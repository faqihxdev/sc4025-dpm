import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import type { ChatRequest, ChatResponse } from '../src/chat/contracts';

test.use({ baseURL: process.env.CHAT_OPENING_BASE_URL ?? 'http://127.0.0.1:4177' });

// Isolated contexts never reach a model provider or any nonlocal origin.
test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== origin || url.pathname === '/api/chat'
      ? route.abort('blockedbyclient') : route.continue();
  });
});

async function geometry(page: Page) {
  return page.locator('.drink-chat-flow').evaluate(element => {
    const flow = element as HTMLElement;
    const opening = flow.querySelector<HTMLElement>('.drink-chat-opening')!;
    const heading = opening.querySelector<HTMLElement>('h2')!;
    const composer = document.querySelector<HTMLElement>('.drink-chat-composer')!;
    const bounds = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const scale = flow.getBoundingClientRect().width / flow.offsetWidth;
    return {
      flow: bounds(flow), opening: bounds(opening), heading: bounds(heading), composer: bounds(composer),
      buttons: [...opening.querySelectorAll<HTMLButtonElement>('button')].map(button => ({
        ...bounds(button), heightCss: button.offsetHeight, widthCss: button.offsetWidth,
      })),
      scale, scrollTop: flow.scrollTop, overflowY: flow.scrollHeight > flow.clientHeight,
      horizontalOverflow: flow.scrollWidth > flow.clientWidth,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      paddingBottom: parseFloat(getComputedStyle(flow).paddingBottom),
      textAlign: getComputedStyle(opening).textAlign,
    };
  });
}

async function expectOpening(page: Page, screenshotPath?: string) {
  await expect(page.getByRole('heading', { name: 'What would you like today?' })).toBeVisible();
  await expect(page.locator('.drink-chat-opening button')).toHaveText([
    'Something like my usual', 'Try something different', 'Help me choose',
  ]);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(230);
  const data = await geometry(page);
  expect(data.textAlign).toBe('right');
  expect(data.horizontalOverflow).toBe(false);
  expect(data.pageOverflow).toBe(false);
  expect(data.composer.top).toBeGreaterThanOrEqual(data.flow.bottom - 1);
  for (const [index, button] of data.buttons.entries()) {
    expect(button.heightCss).toBeGreaterThanOrEqual(44);
    expect(button.widthCss).toBeGreaterThanOrEqual(44);
    expect(Math.abs(button.right - data.heading.right)).toBeLessThan(1);
    if (index) expect((button.top - data.buttons[index - 1].bottom) / data.scale).toBeGreaterThanOrEqual(7.9);
  }
  if (!data.overflowY) {
    const last = data.buttons.at(-1)!;
    // Suggestions include four pixels of focus-ring clearance at their bottom.
    expect(Math.abs((data.flow.bottom - last.bottom) / data.scale - data.paddingBottom - 4)).toBeLessThan(1);
  } else {
    // Auto margins collapse when content is too tall, leaving its start reachable.
    expect(data.scrollTop).toBe(0);
    expect(data.opening.top).toBeGreaterThanOrEqual(data.flow.top);
  }
  if (screenshotPath) await page.screenshot({ path: screenshotPath });
  return data;
}

for (const viewport of [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
  { width: 844, height: 390 },
]) {
  test(`welcome choices sit bottom-right without clipping at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/#/chat');
    const data = await expectOpening(page, testInfo.outputPath('opening.png'));
    await testInfo.attach('opening geometry', { body: JSON.stringify(data, null, 2), contentType: 'application/json' });
    await expect(page.getByRole('textbox', { name: 'Describe your drink' })).toBeInViewport();
  });
}

test('large text and a short viewport preserve scrolling from the greeting to each choice', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 550 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/chat');
  await page.addStyleTag({ content: `
    .drink-chat { font-size: 28px; }
    .drink-chat h2 { font-size: 32px; }
    .drink-chat-suggestions > button { font-size: 24px !important; }
    .drink-chat-composer-field input { font-size: 32px; }
  ` });
  const data = await expectOpening(page, testInfo.outputPath('large-text.png'));
  expect(data.overflowY).toBe(true);
  const first = page.getByRole('button', { name: 'Something like my usual', exact: true });
  const last = page.getByRole('button', { name: 'Help me choose', exact: true });
  await first.scrollIntoViewIfNeeded();
  await expect(first).toBeInViewport();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await page.locator('.drink-chat-flow').evaluate(element => { element.scrollTop = 0; });
  const opening = await geometry(page);
  expect(opening.opening.top).toBeGreaterThanOrEqual(opening.flow.top);
  await expect(page.getByRole('textbox', { name: 'Describe your drink' })).toBeInViewport();
});

test('first reply sends once, restores normal top-anchored transcript, and reset restores bottom-right', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const pending: { route: Route; request: ChatRequest }[] = [];
  await page.route(url => url.pathname === '/api/chat', route => {
    pending.push({ route, request: route.request().postDataJSON() });
  });
  await page.goto('/#/chat');
  await expectOpening(page);
  await page.evaluate(() => {
    const probe = window as typeof window & { openingRouteEvents: string[] };
    probe.openingRouteEvents = [];
    document.addEventListener('animationstart', event => {
      if (event instanceof AnimationEvent && event.target instanceof Element && event.target.matches('.route-content')) {
        probe.openingRouteEvents.push(event.animationName);
      }
    });
  });
  const routeBefore = await page.locator('.route-content').boundingBox();
  await page.getByRole('button', { name: 'Try something different', exact: true }).click();
  await expect.poll(() => pending.length).toBe(1);
  await expect(page.locator('.drink-chat-user')).toHaveText('Try something different');
  expect(pending[0].request.messages).toEqual([{ role: 'user', content: 'Try something different' }]);
  const response: ChatResponse = { reply: 'Try a bright iced tea.', suggestions: ['Less sweet', 'Keep it fruity'], picks: [], preferences: pending[0].request.preferences };
  await pending[0].route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  await expect(page.locator('.drink-chat-answer')).toHaveText(response.reply);
  await page.waitForTimeout(350);
  await expect(page.locator('.drink-chat-flow')).not.toHaveClass(/drink-chat-flow-opening/);
  expect(await page.evaluate(() => (window as typeof window & { openingRouteEvents: string[] }).openingRouteEvents)).toEqual([]);
  const routeAfter = await page.locator('.route-content').boundingBox();
  expect(routeAfter?.x).toBeCloseTo(routeBefore!.x, 1);
  expect(routeAfter?.y).toBeCloseTo(routeBefore!.y, 1);
  const transcriptTop = await page.locator('.drink-chat-messages').evaluate(element => {
    const flow = element.closest<HTMLElement>('.drink-chat-flow')!;
    const scale = flow.getBoundingClientRect().width / flow.offsetWidth;
    return (element.getBoundingClientRect().top - flow.getBoundingClientRect().top) / scale;
  });
  expect(transcriptTop).toBeCloseTo(16, 0);
  await page.getByRole('button', { name: 'Reset conversation', exact: true }).click();
  await expectOpening(page, testInfo.outputPath('reset-opening.png'));
  expect(pending.length).toBe(1);
});
