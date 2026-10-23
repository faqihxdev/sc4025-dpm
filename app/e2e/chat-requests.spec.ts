import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import type { ChatRequest, ChatResponse } from '../src/chat/contracts';

type PendingReply = { route: Route; request: ChatRequest };
declare global {
  interface Window {
    delayedChatSnapshotStarted: boolean;
    releaseChatSnapshot: () => void;
    delayedChatTransition: ViewTransition;
  }
}

test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== origin || url.pathname === '/api/chat'
      ? route.abort('blockedbyclient') : route.continue();
  });
});

async function holdReplies(page: Page): Promise<PendingReply[]> {
  const pending: PendingReply[] = [];
  await page.route(url => url.pathname === '/api/chat', route => {
    pending.push({ route, request: route.request().postDataJSON() });
  });
  return pending;
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
