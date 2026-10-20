import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import type { ChatRequest, ChatResponse } from '../src/chat/contracts';
import { defaultPreferences } from '../src/domain/catalogue';

// Every model request is intercepted. External requests are blocked as well.
// A development override can exercise Vite without changing the shared config.
if (process.env.CHAT_MOTION_BASE_URL) test.use({ baseURL: process.env.CHAT_MOTION_BASE_URL });

type PendingReply = { route: Route; request: ChatRequest };
type ScrollCall = { top: number; behavior: string | undefined; before: number };
type SharedSnapshot = { role: 'choice' | 'bubble'; name: string; text: string; x: number; y: number; width: number; height: number };
type MotionProbe = Window & {
  chatScrollCalls: ScrollCall[];
  chatSharedSnapshots: { before: SharedSnapshot[]; after: SharedSnapshot[] }[];
  chatRevealEvents: { role: string; name: string; text: string }[];
};
declare global {
  interface Window {
    chatScrollCalls: ScrollCall[];
    chatSharedSnapshots: { before: SharedSnapshot[]; after: SharedSnapshot[] }[];
    chatRevealEvents: { role: string; name: string; text: string }[];
    retainedChatTurn: Element;
    delayedChatSnapshotStarted: boolean;
    releaseChatSnapshot: () => void;
    delayedChatTransition: ViewTransition;
    chatRouteMotionEvents: string[];
  }
}

test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== origin || url.pathname === '/api/chat'
      ? route.abort('blockedbyclient') : route.continue();
  });
  await context.addInitScript(() => {
    const calls: { top: number; behavior: string | undefined; before: number }[] = [];
    const shared: { before: SharedSnapshot[]; after: SharedSnapshot[] }[] = [];
    const reveals: { role: string; name: string; text: string }[] = [];
    Object.assign(window, { chatScrollCalls: calls, chatSharedSnapshots: shared, chatRevealEvents: reveals });
    const nativeScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (options?: ScrollToOptions | number, y?: number) {
      if (this.classList.contains('drink-chat-flow')) {
        calls.push({
          top: typeof options === 'number' ? options : options?.top ?? this.scrollTop,
          behavior: typeof options === 'object' ? options.behavior : undefined,
          before: this.scrollTop,
        });
      }
      return Reflect.apply(nativeScrollTo, this, typeof options === 'number' ? [options, y ?? 0] : [options]);
    };
    document.addEventListener('animationstart', event => {
      if (!(event instanceof AnimationEvent) || !(event.target instanceof Element)) return;
      const turn = event.target.closest('.drink-chat-turn');
      if (!turn) return;
      reveals.push({
        role: turn.classList.contains('drink-chat-turn-assistant') ? 'assistant' : 'user',
        name: event.animationName, text: turn.textContent ?? '',
      });
    });
    if (document.startViewTransition) {
      const nativeTransition = document.startViewTransition.bind(document);
      const snapshot = (): SharedSnapshot[] => [...document.querySelectorAll('.drink-chat-suggestions > button, .drink-chat-user')]
        .filter(element => getComputedStyle(element).viewTransitionName !== 'none')
        .map(element => {
          const bounds = element.getBoundingClientRect();
          return {
            role: element.tagName === 'BUTTON' ? 'choice' : 'bubble',
            name: getComputedStyle(element).viewTransitionName,
            text: element.textContent ?? '',
            x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
          };
        });
      document.startViewTransition = (update: Parameters<Document['startViewTransition']>[0]) => {
        const record = { before: snapshot(), after: [] as SharedSnapshot[] };
        shared.push(record);
        return nativeTransition(async () => {
          if (typeof update === 'function') await update();
          else if (update?.update) await update.update();
          record.after = snapshot();
        });
      };
    }
  });
});

async function holdReplies(page: Page): Promise<PendingReply[]> {
  const pending: PendingReply[] = [];
  await page.route(url => url.pathname === '/api/chat', route => {
    pending.push({ route, request: route.request().postDataJSON() });
  });
  return pending;
}

async function seedConversation(page: Page, turns = 4) {
  const messages = Array.from({ length: turns }, (_, index) => [
    { role: 'user', content: `Help me find an iced drink, request ${index + 1}.` },
    {
      role: 'assistant',
      content: (`For drink ${index + 1}, an iced latte is creamy and coffee-forward. `).repeat(5),
      picks: [], suggestions: index === turns - 1 ? ['Try an iced tea instead'] : [],
    },
  ]).flat();
  await page.addInitScript(value => {
    sessionStorage.setItem('sc4025-drink-chat:v1', JSON.stringify(value));
  }, { messages, preferences: defaultPreferences, turnCount: turns, endedReason: null });
}

async function calls(page: Page): Promise<ScrollCall[]> {
  return page.evaluate(() => (window as MotionProbe).chatScrollCalls);
}

async function clearCalls(page: Page) {
  await page.evaluate(() => { (window as MotionProbe).chatScrollCalls.length = 0; });
}

async function delaySendSnapshot(page: Page) {
  await page.evaluate(() => {
    const startTransition = document.startViewTransition.bind(document);
    const gate = new Promise<void>(resolve => { window.releaseChatSnapshot = resolve; });
    window.delayedChatSnapshotStarted = false;
    document.startViewTransition = update => {
      const transition = startTransition(async () => {
        window.delayedChatSnapshotStarted = true;
        await gate;
        if (typeof update === 'function') await update();
        else if (update?.update) await update.update();
      });
      window.delayedChatTransition = transition;
      return transition;
    };
  });
}

async function fulfill(pending: PendingReply, reply = 'Try an iced tea with a bright, refreshing flavour.') {
  const response: ChatResponse = {
    reply, suggestions: ['Less sweet', 'Keep it creamy'],
    picks: [
      { drinkId: 'iced-matcha-latte', reason: 'Creamy matcha served iced.' },
      { drinkId: 'iced-chai-latte', reason: 'Spiced tea with milk over ice.' },
    ],
    preferences: { ...pending.request.preferences, temperature: 'iced' },
  };
  await pending.route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
}

test('a new assistant response scrolls smoothly rather than snapping the conversation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seedConversation(page);
  const pending = await holdReplies(page);
  await page.goto('/#/chat');
  await page.getByRole('button', { name: 'Try an iced tea instead', exact: true }).click();
  await expect.poll(() => pending.length).toBe(1);
  await expect(page.locator('.drink-chat-loading')).toBeVisible();
  // Chip-to-bubble snapshot positioning belongs to the send transition.
  // Only observe scroll calls caused by completing the server reply here.
  await page.waitForTimeout(450);
  await clearCalls(page);
  await fulfill(pending[0]);
  await expect(page.locator('.drink-chat-turn-assistant').last()).toContainText('Try an iced tea');
  await expect.poll(() => calls(page)).toContainEqual(expect.objectContaining({ behavior: 'smooth' }));
  expect((await calls(page)).filter(call => call.behavior === 'instant')).toEqual([]);
  await expect.poll(() => page.evaluate(() => (window as MotionProbe).chatRevealEvents.filter(event => event.role === 'assistant' && event.text.includes('Try an iced tea')))).toContainEqual(expect.objectContaining({ name: 'chat-reply-in' }));
});

test('a tall response scrolls to its readable start rather than skipping to the last cards', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 640 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seedConversation(page);
  const pending = await holdReplies(page);
  await page.goto('/#/chat');
  await page.getByRole('button', { name: 'Try an iced tea instead', exact: true }).click();
  await expect.poll(() => pending.length).toBe(1);
  await page.waitForTimeout(450);
  await clearCalls(page);
  const longReply = 'Here is a bright iced tea choice. Matcha is creamy and earthy, while chai has warm spices. '.repeat(6);
  await fulfill(pending[0], longReply);
  const answer = page.locator('.drink-chat-turn-assistant').last();
  await expect(answer.locator('.drink-chat-pick')).toHaveCount(2);
  await expect.poll(() => calls(page)).toContainEqual(expect.objectContaining({ behavior: 'smooth' }));
  await expect.poll(() => answer.evaluate(element => {
    const flow = document.querySelector<HTMLElement>('.drink-chat-flow')!;
    const flowBounds = flow.getBoundingClientRect();
    const answerBounds = element.getBoundingClientRect();
    const scale = flowBounds.height / flow.offsetHeight;
    return answerBounds.top >= flowBounds.top - scale && answerBounds.top <= flowBounds.top + 40 * scale;
  })).toBe(true);
  expect(await answer.evaluate(element => element.getBoundingClientRect().height > document.querySelector('.drink-chat-flow')!.getBoundingClientRect().height)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('chat-tall-reply-readable-start.png') });
});

test('an awaited reply does not pull the reader away after they scroll up', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seedConversation(page);
  const pending = await holdReplies(page);
  await page.goto('/#/chat');
  await page.getByRole('button', { name: 'Try an iced tea instead', exact: true }).click();
  await expect.poll(() => pending.length).toBe(1);
  await page.waitForTimeout(450);
  const flow = page.locator('.drink-chat-flow');
  const bounds = (await flow.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, -1500);
  await expect.poll(() => flow.evaluate(element => element.scrollTop)).toBeLessThan(10);
  const readingPosition = await flow.evaluate(element => element.scrollTop);
  await clearCalls(page);
  await fulfill(pending[0]);
  await expect(page.locator('.drink-chat-turn-assistant').last()).toContainText('Try an iced tea');
  await page.waitForTimeout(350);
  expect(await calls(page)).toEqual([]);
  expect(Math.abs(await flow.evaluate(element => element.scrollTop) - readingPosition)).toBeLessThan(1);
});

for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
  test(`a suggested reply keeps spatial continuity into its sent bubble at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const pending = await holdReplies(page);
    await page.goto('/#/chat');
    const choice = page.getByRole('button', { name: 'Try something different', exact: true });
    const oldBounds = (await choice.boundingBox())!;
    await choice.click();
    await expect.poll(() => pending.length).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as MotionProbe).chatSharedSnapshots.some(record => record.before.some(element => element.role === 'choice' && element.text === 'Try something different') && record.after.some(element => element.role === 'bubble' && element.text === 'Try something different')))).toBe(true);
    const snapshot = await page.evaluate(() => (window as MotionProbe).chatSharedSnapshots.find(record => record.before.some(element => element.role === 'choice' && element.text === 'Try something different'))!);
    const source = snapshot.before.find(element => element.role === 'choice')!;
    const target = snapshot.after.find(element => element.role === 'bubble')!;
    expect(source.name).toBe('chat-send');
    expect(target.name).toBe(source.name);
    expect(Math.abs(source.x - oldBounds.x)).toBeLessThan(1);
    expect(Math.abs(source.width - oldBounds.width)).toBeLessThan(1);
    const destination = await page.locator('.drink-chat-user').last().boundingBox();
    expect(Math.abs(target.x - destination!.x)).toBeLessThan(1);
    expect(Math.abs(target.width - destination!.width)).toBeLessThan(1);
    expect(target.y).toBeLessThan(source.y);
    expect(Math.abs(target.x + target.width - source.x - source.width)).toBeLessThan(1);
    await expect(page.locator('.drink-chat-turn-user')).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath(`chat-chip-bubble-${viewport.width}.png`) });
    await fulfill(pending[0]);
    await expect(page.locator('.drink-chat-turn')).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-chat-transition'))).toBe(false);
    expect(await page.locator('.drink-chat-suggestions button, .drink-chat-user').evaluateAll(elements => elements.every(element => getComputedStyle(element).viewTransitionName === 'none'))).toBe(true);
    expect(pending).toHaveLength(1);
  });
}

for (const mode of ['reduced motion', 'unsupported view transitions'] as const) {
  test(`${mode} sends suggested replies without a transition dependency`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ reducedMotion: mode === 'reduced motion' ? 'reduce' : 'no-preference' });
    if (mode === 'unsupported view transitions') await page.addInitScript(() => {
      Object.defineProperty(document, 'startViewTransition', { value: undefined, configurable: true });
    });
    const pending = await holdReplies(page);
    await page.goto('/#/chat');
    await page.getByRole('button', { name: 'Help me choose', exact: true }).click();
    await expect(page.locator('.drink-chat-user')).toHaveText('Help me choose');
    await expect.poll(() => pending.length).toBe(1);
    await fulfill(pending[0]);
    await expect(page.locator('.drink-chat-turn-assistant')).toContainText('Try an iced tea');
    expect(await page.evaluate(() => (window as MotionProbe).chatSharedSnapshots)).toEqual([]);
    expect(pending).toHaveLength(1);
    if (mode === 'reduced motion') {
      expect((await calls(page)).every(call => call.behavior !== 'smooth')).toBe(true);
      expect(await page.evaluate(() => (window as MotionProbe).chatRevealEvents)).toEqual([]);
      await expect(page.locator('.drink-chat-turn-assistant')).toHaveCSS('animation-name', 'none');
    }
  });
}

test('a rate-limit cooldown prevents early retries and only sends when the user retries after expiry', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-10-03T01:00:00Z') });
  const requests: ChatRequest[] = [];
  await page.route(url => url.pathname === '/api/chat', async route => {
    const request: ChatRequest = route.request().postDataJSON();
    requests.push(request);
    if (requests.length === 1) await route.fulfill({ status: 429, headers: { 'Retry-After': '2' }, contentType: 'application/json', body: JSON.stringify({ error: 'rate_limit' }) });
    else await fulfill({ route, request });
  });
  await page.goto('/#/chat');
  await page.clock.pauseAt(new Date('2026-10-03T01:00:10Z'));
  await page.getByRole('button', { name: 'Help me choose', exact: true }).click();
  const retry = page.getByRole('button', { name: 'Try again', exact: true });
  await expect(page.getByRole('alert')).toContainText('Too many requests');
  await expect(retry).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await retry.evaluate(button => (button as HTMLButtonElement).click());
  expect(requests).toHaveLength(1);
  await page.clock.runFor(1999);
  await expect(retry).toBeDisabled();
  expect(requests).toHaveLength(1);
  await page.clock.runFor(1001);
  await expect(retry).toBeEnabled();
  // Expiry does not automatically create another paid request.
  expect(requests).toHaveLength(1);
  await retry.click();
  await expect(page.locator('.drink-chat-turn-assistant')).toContainText('Try an iced tea');
  await expect(page.locator('.drink-chat-turn-user')).toHaveCount(1);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
});

test('trimming the twelve-message context preserves old turns without replaying their entry motion', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seedConversation(page, 5);
  const pending = await holdReplies(page);
  await page.goto('/#/chat');
  await expect(page.locator('.drink-chat-turn')).toHaveCount(10);
  await page.evaluate(() => Object.assign(window, { retainedChatTurn: document.querySelectorAll('.drink-chat-turn')[2] }));
  await page.getByRole('button', { name: 'Try an iced tea instead', exact: true }).click();
  await expect.poll(() => pending.length).toBe(1);
  await page.waitForTimeout(450);
  await fulfill(pending[0], 'Here are two iced tea choices, first reply.');
  await expect(page.locator('.drink-chat-turn')).toHaveCount(12);
  await expect.poll(() => page.evaluate(() => (window as MotionProbe).chatRevealEvents.filter(event => event.role === 'assistant'))).toHaveLength(1);
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: 'Less sweet', exact: true }).click();
  await expect.poll(() => pending.length).toBe(2);
  await page.waitForTimeout(450);
  await fulfill(pending[1], 'Here are two iced tea choices, second reply.');
  await expect(page.locator('.drink-chat-turn')).toHaveCount(12);
  expect(await page.evaluate(() => document.querySelectorAll('.drink-chat-turn')[0] === (window as Window & { retainedChatTurn: Element }).retainedChatTurn)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as MotionProbe).chatRevealEvents.filter(event => event.role === 'assistant'))).toHaveLength(2);
  const revealed = await page.evaluate(() => (window as MotionProbe).chatRevealEvents.filter(event => event.role === 'assistant').map(event => event.text));
  expect(revealed.every(text => text.includes('first reply') || text.includes('second reply'))).toBe(true);
  expect(pending[1].request.messages).toHaveLength(11);
});

test('reusing the same suggested reply only shares the newest bubble, not an earlier matching label', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const pending = await holdReplies(page);
  await page.goto('/#/chat');
  await page.getByRole('button', { name: 'Help me choose', exact: true }).click();
  await expect.poll(() => pending.length).toBe(1);
  await page.waitForTimeout(450);
  await fulfill(pending[0]);
  await expect(page.locator('.drink-chat-turn-assistant')).toHaveCount(1);
  for (let index = 1; index <= 2; index++) {
    await page.getByRole('button', { name: 'Less sweet', exact: true }).click();
    await expect.poll(() => pending.length).toBe(index + 1);
    await expect.poll(() => page.evaluate(() => (window as MotionProbe).chatSharedSnapshots.filter(record => record.before.some(element => element.role === 'choice' && element.text === 'Less sweet') && record.after.some(element => element.role === 'bubble' && element.text === 'Less sweet')).length)).toBe(index);
    await page.waitForTimeout(450);
    await fulfill(pending[index]);
    await expect(page.locator('.drink-chat-turn-assistant')).toHaveCount(index + 1);
  }
  const repeated = await page.evaluate(() => (window as MotionProbe).chatSharedSnapshots.filter(record => record.before.some(element => element.role === 'choice' && element.text === 'Less sweet')));
  expect(repeated).toHaveLength(2);
  for (const record of repeated) {
    expect(record.before).toHaveLength(1);
    expect(record.after).toHaveLength(1);
    expect(record.after[0]).toMatchObject({ role: 'bubble', name: 'chat-send', text: 'Less sweet' });
  }
  await expect(page.locator('.drink-chat-user')).toHaveText(['Help me choose', 'Less sweet', 'Less sweet']);
});

test('rapid same-chip double clicks create only one user turn and one request', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const pending = await holdReplies(page);
  await page.goto('/#/chat');
  await delaySendSnapshot(page);
  // Two click events use the real rendered button and React send handler in
  // one task, before the native snapshot can commit and disable/remove it.
  await page.getByRole('button', { name: 'Help me choose', exact: true }).evaluate(button => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect.poll(() => page.evaluate(() => window.delayedChatSnapshotStarted)).toBe(true);
  expect(pending).toHaveLength(0);
  expect(await page.evaluate(() => window.chatSharedSnapshots)).toHaveLength(1);
  await page.evaluate(() => window.releaseChatSnapshot());
  await expect.poll(() => pending.length).toBe(1);
  await expect(page.locator('.drink-chat-user')).toHaveText('Help me choose');
  await fulfill(pending[0]);
  await expect(page.locator('.drink-chat-turn')).toHaveCount(2);
  expect(pending).toHaveLength(1);
  expect(pending[0].request.messages).toEqual([{ role: 'user', content: 'Help me choose' }]);
});

test('reset before a delayed native snapshot commits does not resurrect the message or call the API', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const pending = await holdReplies(page);
  await page.goto('/#/chat');
  await delaySendSnapshot(page);
  await page.getByRole('button', { name: 'Help me choose', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.delayedChatSnapshotStarted)).toBe(true);
  expect(pending).toHaveLength(0);
  // The native snapshot blocks pointer hit-testing while its update callback
  // waits. Invoke the rendered reset control's real handler to test the race.
  await page.getByRole('button', { name: 'Reset conversation', exact: true }).evaluate(button => (button as HTMLButtonElement).click());
  await page.evaluate(async () => {
    window.releaseChatSnapshot();
    await window.delayedChatTransition.updateCallbackDone.catch(() => {});
    await window.delayedChatTransition.finished.catch(() => {});
  });
  await expect(page.locator('.drink-chat-turn')).toHaveCount(0);
  await expect(page.locator('.drink-chat-loading')).toHaveCount(0);
  await expect(page.locator('.drink-chat-opening')).toContainText('What would you like today?');
  await expect(page.locator('#drink-chat-input')).toBeEnabled();
  expect(pending).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-chat-transition'))).toBe(false);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('sc4025-drink-chat:v1')!).messages)).toEqual([]);
});

test('sending a suggested reply after entering chat from goals does not replay the whole page slide', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    window.chatRouteMotionEvents = [];
    document.addEventListener('animationstart', event => {
      if (event instanceof AnimationEvent && event.target instanceof Element && event.target.matches('.route-content')) {
        window.chatRouteMotionEvents.push(event.animationName);
      }
    });
  });
  const pending = await holdReplies(page);
  await page.goto('/#/goal');
  await page.locator('.goal-card').last().click();
  await expect(page).toHaveURL(/#\/chat$/);
  await expect(page.locator('.drink-chat-opening')).toBeVisible();
  // Exercise the real forward-navigation path. Directly loading /chat does
  // not give route-content the route-forward animation that can restart.
  await expect(page.locator('.route-content')).toHaveAttribute('data-motion', 'forward');
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.chatRouteMotionEvents.length = 0; });
  await page.getByRole('button', { name: 'Help me choose', exact: true }).click();
  await expect.poll(() => pending.length).toBe(1);
  await expect.poll(() => page.evaluate(() => window.chatSharedSnapshots.some(record => record.after.some(element => element.role === 'bubble' && element.text === 'Help me choose')))).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-chat-transition'))).toBe(false);
  await page.waitForTimeout(400);
  const replayed = await page.evaluate(() => window.chatRouteMotionEvents.filter(name => name === 'route-forward' || name === 'route-back'));
  expect(replayed).toEqual([]);
  expect(pending).toHaveLength(1);
});
