import { expect, test } from '@playwright/test';
import type { Locator, Page, Route } from '@playwright/test';
import type { ChatRequest, ChatResponse } from '../src/chat/contracts';
import { defaultPreferences } from '../src/domain/catalogue';

const replyFor = (request: ChatRequest): ChatResponse => {
  const content = request.messages.at(-1)!.content.toLowerCase();
  const preferences: ChatResponse['preferences'] = { ...request.preferences, temperature: 'iced' };
  const picks = [
    { drinkId: 'iced-matcha-latte', reason: 'Matcha with milk over ice, a tea choice beyond coffee.' },
    { drinkId: 'iced-chai-latte', reason: 'Spiced black tea and milk, served iced.' },
  ];
  if (content.includes('usual')) return { reply: 'Your usual is iced coffee. Keep it familiar or try something different?', suggestions: ['Try something different', 'Keep iced coffee'], picks: [], preferences };
  if (content.includes('different')) return { reply: 'Try an **iced tea** drink with a different flavour.', suggestions: ['No coffee', 'Less sweet', 'Compare these'], picks, preferences };
  if (content.includes('no coffee')) return { reply: 'These iced tea recipes have no coffee listed.', suggestions: ['Compare these', 'With oatmilk'], picks, preferences: { ...preferences, avoidCoffee: true } };
  if (content.includes('compare')) return { reply: 'Matcha uses matcha and milk. Chai uses spiced black tea and milk.', suggestions: ['Choose matcha', 'Choose chai'], picks, preferences };
  return { reply: 'Would you like to keep it iced?', suggestions: ['Keep it iced', 'Try hot'], picks: [], preferences };
};

async function holdChatReplies(page: Page) {
  const pending: { route: Route; request: ChatRequest }[] = [];
  await page.route(url => url.pathname === '/api/chat', route => {
    pending.push({ route, request: route.request().postDataJSON() });
  });
  return pending;
}

const fulfillReply = ({ route, request }: { route: Route; request: ChatRequest }) => route.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify(replyFor(request)),
});

async function expectPriceBadges(cards: Locator) {
  // These literals are the catalogue fixtures, not recomputed by formatPrice.
  const prices = ['S$8.40', 'S$7.70'];
  await expect(cards.locator('.drink-chat-photo .drink-chat-pick-price')).toHaveText(prices);
  for (let index = 0; index < prices.length; index++) {
    const card = cards.nth(index);
    const badge = card.locator('.drink-chat-pick-price');
    await expect(badge).toHaveCSS('position', 'absolute');
    await expect(badge).toHaveCSS('font-size', '12px');
    await expect(badge).toHaveCSS('line-height', '20px');
    await expect(badge).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(badge).toHaveCSS('color', 'rgb(30, 57, 50)');
    await expect(card.locator('.drink-chat-pick-view')).toHaveAttribute('aria-description', prices[index]);
  }
  const placements = await cards.evaluateAll(elements => elements.map(card => {
    const photo = card.querySelector<HTMLElement>('.drink-chat-photo')!;
    const badge = card.querySelector<HTMLElement>('.drink-chat-pick-price')!;
    const imageBounds = photo.getBoundingClientRect();
    const bounds = badge.getBoundingClientRect();
    const arrow = card.querySelector('.drink-chat-pick-arrow')!.getBoundingClientRect();
    const withPrice = card.getBoundingClientRect().height;
    const display = badge.style.display;
    // A transient, isolated-page layout probe confirms the overlay adds no row.
    badge.style.display = 'none';
    const withoutPrice = card.getBoundingClientRect().height;
    badge.style.display = display;
    return {
      left: bounds.left - imageBounds.left, bottom: imageBounds.bottom - bounds.bottom,
      scale: imageBounds.width / photo.offsetWidth, withPrice, withoutPrice,
      inside: bounds.left >= imageBounds.left && bounds.right <= imageBounds.right
        && bounds.top >= imageBounds.top && bounds.bottom <= imageBounds.bottom,
      overlapsArrow: bounds.left < arrow.right && bounds.right > arrow.left
        && bounds.top < arrow.bottom && bounds.bottom > arrow.top,
    };
  }));
  for (const placement of placements) {
    expect(placement.inside).toBe(true);
    expect(placement.overlapsArrow).toBe(false);
    expect(Math.abs(placement.left - 8 * placement.scale)).toBeLessThan(.75);
    expect(Math.abs(placement.bottom - 8 * placement.scale)).toBeLessThan(.75);
    expect(Math.abs(placement.withPrice - placement.withoutPrice)).toBeLessThan(.5);
  }
}

// Each test uses an isolated browser context. Unmocked chat requests and all
// nonlocal requests are blocked, so these tests cannot call a model provider.
test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== origin || url.pathname === '/api/chat' ? route.abort('blockedbyclient') : route.continue();
  });
});

for (const viewport of [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
  { width: 844, height: 390 },
]) {
  test(`the fourth goal card keeps its loaded illustration and opens idle chat at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const requests: ChatRequest[] = [];
    await page.route(url => url.pathname === '/api/chat', async route => {
      const request: ChatRequest = route.request().postDataJSON();
      requests.push(request);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(replyFor(request)) });
    });
    await page.goto('/#/goal');
    const cards = page.locator('.goal-card');
    const chatCard = cards.last();
    const photo = chatCard.locator('.goal-photo');
    const image = photo.locator('img');
    await expect(cards).toHaveCount(4);
    await expect(chatCard).toContainText('Help me choose');
    for (let index = 0; index < 3; index++) {
      await expect(cards.nth(index).locator('.goal-check [data-icon="chevron"]')).toHaveCount(1);
      await expect(cards.nth(index).locator('.goal-check [data-icon="spark"]')).toHaveCount(0);
    }
    const chevron = chatCard.locator('.goal-check svg[data-icon="chevron"]');
    await expect(chevron).toHaveCount(1);
    await expect(chevron).toHaveAttribute('width', '18');
    await expect(chevron).toHaveAttribute('height', '18');
    await expect(chevron).toHaveAttribute('aria-hidden', 'true');
    await expect(chatCard.locator('.goal-check [data-icon="spark"]')).toHaveCount(0);
    expect(await chevron.evaluate(icon => {
      const container = icon.closest('.goal-check')!.getBoundingClientRect();
      const bounds = icon.getBoundingClientRect();
      return bounds.left >= container.left - .1 && bounds.right <= container.right + .1
        && bounds.top >= container.top - .1 && bounds.bottom <= container.bottom + .1
        && Math.abs(bounds.left + bounds.width / 2 - container.left - container.width / 2) < .5
        && Math.abs(bounds.top + bounds.height / 2 - container.top - container.height / 2) < .5;
    })).toBe(true);
    await expect(photo).toHaveCSS('background-color', 'rgb(212, 233, 226)');
    await expect(photo).toHaveCSS('background-image', 'none');
    await expect(image).toHaveCount(1);
    await expect.poll(() => image.evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0 && element.naturalHeight > 0)).toBe(true);
    expect(await photo.evaluate(element => ({ width: (element as HTMLElement).offsetWidth, height: (element as HTMLElement).offsetHeight }))).toEqual({ width: 62, height: 62 });
    expect(await photo.evaluate(element => {
      const frame = element.getBoundingClientRect();
      const image = element.querySelector('img')!.getBoundingClientRect();
      return Math.abs(frame.width - image.width) < 1 && Math.abs(frame.height - image.height) < 1;
    })).toBe(true);
    expect(await cards.evaluateAll(elements => {
      const widths = elements.map(element => element.getBoundingClientRect().width);
      return Math.max(...widths) - Math.min(...widths) < 1
        && elements.every(element => (element as HTMLElement).offsetHeight >= 90
          && element.querySelector<HTMLElement>('.goal-photo')!.offsetWidth === 62);
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(requests).toHaveLength(0);
    await page.screenshot({ path: test.info().outputPath(`goal-${viewport.width}-overview.png`), animations: 'disabled' });
    await chatCard.scrollIntoViewIfNeeded();
    await expect(chatCard).toBeInViewport({ ratio: 1 });
    await expect(image).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: test.info().outputPath(`goal-${viewport.width}-fourth-card-visible.png`), animations: 'disabled' });
    await chatCard.screenshot({ path: test.info().outputPath(`goal-${viewport.width}-fourth-card.png`), animations: 'disabled' });
    await chatCard.click();
    await expect(page).toHaveURL(/#\/chat$/);
    await expect(page.locator('#drink-chat-input')).toBeVisible();
    await expect(page.locator('.drink-chat-turn')).toHaveCount(0);
    await expect(page.locator('.drink-chat-loading')).toHaveCount(0);
    expect(requests).toHaveLength(0);
  });
}

test('novel model suggestions stay active after picks and send their literal text until chat ends', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const novelChoice = 'Keep that earthy matcha flavour';
  const requests: ChatRequest[] = [];
  await page.route(url => url.pathname === '/api/chat', async route => {
    const request: ChatRequest = route.request().postDataJSON();
    requests.push(request);
    const picks = replyFor({ ...request, messages: [{ role: 'user', content: 'Try something different' }] }).picks;
    const response: ChatResponse = requests.length === 3
      ? { ...replyFor(request), reply: 'This chat has ended. Reset to start a new drink conversation.', suggestions: [], picks: [], endedReason: 'repeated_off_topic' }
      : {
        ...replyFor(request), reply: 'Here are two iced tea choices.', picks,
        suggestions: requests.length === 1
          ? [novelChoice, 'Choose warm spices instead', 'Surprise me with a tea twist']
          : ['Try another tea pairing', 'Stay with this one'],
      };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.goto('/#/chat');
  await expect(page.getByRole('button', { name: novelChoice, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Try something different', exact: true }).click();
  const firstReply = page.locator('.drink-chat-turn-assistant').last();
  await expect(firstReply.locator('.drink-chat-pick')).toHaveCount(2);
  const suggestions = firstReply.locator('.drink-chat-suggestions');
  await expect(suggestions.locator('button')).toHaveText([novelChoice, 'Choose warm spices instead', 'Surprise me with a tea twist']);
  await expect(suggestions).toHaveCSS('flex-wrap', 'wrap');
  expect(await suggestions.evaluate(row => {
    const bounds = row.getBoundingClientRect();
    return row.scrollWidth <= row.clientWidth && [...row.querySelectorAll('button')].every(button => {
      const rect = button.getBoundingClientRect();
      return !button.disabled && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
    });
  })).toBe(true);
  await page.screenshot({ path: test.info().outputPath('chat-375-novel-suggestions.png'), animations: 'disabled' });
  await suggestions.getByRole('button', { name: novelChoice, exact: true }).click();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(4);
  expect(requests).toHaveLength(2);
  expect(requests[1].messages).toEqual([
    { role: 'user', content: 'Try something different' },
    { role: 'assistant', content: 'Here are two iced tea choices.' },
    { role: 'user', content: novelChoice },
  ]);
  const secondReply = page.locator('.drink-chat-turn-assistant').last();
  await expect(secondReply.locator('.drink-chat-pick')).toHaveCount(2);
  await expect(secondReply.getByRole('button', { name: 'Try another tea pairing', exact: true })).toBeEnabled();
  await secondReply.getByRole('button', { name: 'Try another tea pairing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset chat', exact: true })).toBeVisible();
  await expect(page.locator('.drink-chat-suggestions button')).toHaveCount(0);
  await expect(page.locator('#drink-chat-input')).toHaveCount(0);
  expect(requests).toHaveLength(3);
  expect(requests[2].messages.at(-1)).toEqual({ role: 'user', content: 'Try another tea pairing' });
  for (const request of requests) expect(Object.keys(request).sort()).toEqual(['availability', 'messages', 'preferences']);
});

test('the fourth matching goal card opens chat and preserves a multi-turn session', async ({ page }) => {
  const requests: ChatRequest[] = [];
  await page.route(url => url.pathname === '/api/chat', async route => {
    const request: ChatRequest = route.request().postDataJSON();
    requests.push(request);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(replyFor(request)) });
  });
  await page.goto('/#/goal');
  await expect(page.locator('.goal-card')).toHaveCount(4);
  await expect(page.locator('.goal-card').last()).toContainText('Help me choose');
  await page.locator('.goal-card').last().click();
  await expect(page.locator('.drink-chat')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Sample order history' })).toHaveCount(0);
  await expect(page.getByText('Tell me what you feel like, or start here.', { exact: true })).toBeVisible();
  await expect(page.getByText('You usually pick iced coffee. Stick with it or try something new?', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Something like my usual', exact: true }).click();
  await expect(page.getByText('Your usual is iced coffee. Keep it familiar or try something different?', { exact: true })).toBeVisible();
  expect(Object.keys(requests[0]).sort()).toEqual(['availability', 'messages', 'preferences']);
  await page.getByRole('button', { name: 'Try something different', exact: true }).click();
  await expect(page.locator('.drink-chat-pick')).toHaveCount(2);
  await expect(page.locator('.drink-chat-turn-assistant').last().locator('.drink-chat-suggestions button')).toHaveCount(3);
  await page.getByRole('button', { name: 'No coffee', exact: true }).click();
  await expect(page.getByText('These iced tea recipes have no coffee listed.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Compare these', exact: true }).click();
  await expect(page.getByText('Matcha uses matcha and milk. Chai uses spiced black tea and milk.', { exact: true })).toBeVisible();
  expect(requests.at(-1)!.messages).toHaveLength(7);
  expect(requests.at(-1)!.preferences).toMatchObject({ temperature: 'iced', avoidCoffee: true });
  expect(requests.at(-1)!.messages.filter(message => message.role === 'user').map(message => message.content)).toEqual(['Something like my usual', 'Try something different', 'No coffee', 'Compare these']);

  await page.locator('.drink-chat-turn-assistant').last().getByRole('button', { name: 'View Iced Matcha Latte', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Iced Matcha Latte', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(8);
  await page.reload();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(8);
  await expect(page.getByRole('switch', { name: 'Sample order history' })).toHaveCount(0);
  await page.locator('#drink-chat-input').fill('Help me choose');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Would you like to keep it iced?', { exact: true })).toBeVisible();
  for (const request of requests) expect(Object.keys(request).sort()).toEqual(['availability', 'messages', 'preferences']);
  await page.getByRole('button', { name: 'Reset conversation', exact: true }).click();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('What would you like today?', { exact: true })).toBeVisible();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(0);
});

test('legacy v1 sample history is discarded without losing the conversation or preferences', async ({ page }) => {
  const legacy = {
    usingSampleHistory: true,
    orderHistory: [{ drinkId: 'iced-latte', quantity: 3 }, { drinkId: 'iced-americano', quantity: 1 }],
    preferences: { ...defaultPreferences, temperature: 'iced' },
    messages: [
      { role: 'user', content: 'Something like my usual' },
      { role: 'assistant', content: 'Your usual is iced coffee. Keep it familiar or try something different?', picks: [], suggestions: ['Try something different', 'Keep iced coffee'] },
    ],
  };
  await page.addInitScript(value => {
    const key = 'sc4025-drink-chat:v1';
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(value));
  }, legacy);
  const requests: ChatRequest[] = [];
  await page.route(url => url.pathname === '/api/chat', async route => {
    const request: ChatRequest = route.request().postDataJSON();
    requests.push(request);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(replyFor(request)) });
  });
  await page.goto('/#/chat');
  await expect(page.locator('.drink-chat-turn')).toHaveCount(2);
  await expect(page.getByRole('switch', { name: 'Sample order history' })).toHaveCount(0);
  await expect(page.getByText(legacy.messages[1].content, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try something different', exact: true }).click();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(4);
  expect(Object.keys(requests[0]).sort()).toEqual(['availability', 'messages', 'preferences']);
  expect(requests[0].preferences).toEqual(legacy.preferences);
  expect(requests[0].messages).toEqual([
    { role: 'user', content: legacy.messages[0].content },
    { role: 'assistant', content: legacy.messages[1].content },
    { role: 'user', content: 'Try something different' },
  ]);
  const persisted = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sc4025-drink-chat:v1')!));
  expect(persisted).not.toHaveProperty('usingSampleHistory');
  expect(persisted).not.toHaveProperty('orderHistory');
  await page.reload();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(4);
});

test('an unavailable service gives an honest error and retries without duplicating the request', async ({ page }) => {
  const requests: ChatRequest[] = [];
  await page.route(url => url.pathname === '/api/chat', async route => {
    const request: ChatRequest = route.request().postDataJSON();
    requests.push(request);
    await route.fulfill({ status: requests.length === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(requests.length === 1 ? { error: 'unavailable' } : replyFor(request)) });
  });
  await page.goto('/#/chat');
  await page.getByRole('button', { name: 'Help me choose', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Drink chat is unavailable right now');
  await expect(page.locator('.drink-chat-turn-assistant')).toHaveCount(0);
  await expect(page.locator('.drink-chat-pick')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Would you like to keep it iced?', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.drink-chat-turn-user')).toHaveCount(1);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  await page.getByRole('button', { name: 'Quick choices', exact: true }).click();
  await expect(page.locator('.goal-card')).toHaveCount(4);
});

test('chat size confirmation increments the persisted order without navigation or extra replies and respects stock changes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requests: ChatRequest[] = [];
  await page.route(url => url.pathname === '/api/chat', async route => {
    const request: ChatRequest = route.request().postDataJSON();
    requests.push(request);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(replyFor(request)) });
  });
  await page.goto('/#/chat');
  await page.getByRole('button', { name: 'Try something different', exact: true }).click();
  await expectPriceBadges(page.locator('.drink-chat-pick'));
  const addMatcha = page.getByRole('button', { name: 'Add Iced Matcha Latte to order', exact: true });
  await expect(addMatcha).toHaveText('Add to order');
  const target = (await addMatcha.boundingBox())!;
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
  await page.mouse.down();
  const pressedColours = await addMatcha.evaluate(button => {
    const style = getComputedStyle(button);
    return { background: style.backgroundColor, foreground: style.color };
  });
  await test.info().attach('quick-add-pressed-colours', { body: JSON.stringify(pressedColours), contentType: 'application/json' });
  await page.screenshot({ path: test.info().outputPath('chat-375-add-pressed.png'), animations: 'disabled' });
  expect(pressedColours).toEqual({ background: 'rgb(0, 99, 64)', foreground: 'rgb(255, 255, 255)' });
  await page.mouse.up();
  const picker = page.getByRole('dialog', { name: 'Choose size', exact: true });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: 'Add to order · S$8.40', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Iced Matcha Latte added to your order.');
  await expect(page.getByRole('button', { name: 'View order, 1 items', exact: true })).toContainText('1');
  await expect(page).toHaveURL(/#\/chat$/);
  await expect(page.locator('.drink-chat-turn')).toHaveCount(2);
  expect(requests).toHaveLength(1);
  await addMatcha.click();
  await picker.getByRole('button', { name: 'Add to order · S$8.40', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View order, 2 items', exact: true })).toContainText('2');
  await expect(page).toHaveURL(/#\/chat$/);
  await expect(page.locator('.drink-chat-turn')).toHaveCount(2);
  expect(requests).toHaveLength(1);
  await page.screenshot({ path: test.info().outputPath('chat-375-added-to-order.png'), animations: 'disabled' });
  await page.reload();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'View order, 2 items', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View Iced Matcha Latte', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Iced Matcha Latte', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(2);
  await expect(addMatcha).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: 'View order, 2 items', exact: true }).click();
  await expect(page.locator('.cart-item')).toHaveCount(1);
  await expect(page.locator('.cart-item')).toContainText('Iced Matcha Latte');
  await expect(page.locator('.cart-item [aria-label="2 drinks"]')).toHaveText('2');
  await page.reload();
  await expect(page.locator('.cart-item [aria-label="2 drinks"]')).toHaveText('2');
  await page.getByRole('button', { name: 'Demo settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Demo settings', exact: true });
  await settings.getByRole('checkbox', { name: 'Iced Matcha Latte', exact: true }).uncheck();
  await settings.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add one Iced Matcha Latte, Tall', exact: true })).toBeDisabled();
  await expect(page.locator('.cart-item [aria-label="2 drinks"]')).toHaveText('2');
  await page.goto('/#/chat');
  await expect(addMatcha).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View Iced Matcha Latte', exact: true })).toHaveCount(0);
  await expect(page.locator('.drink-chat-pick')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Add Iced Chai Tea Latte to order', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'View order, 2 items', exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
});

test('server-ended conversations survive reload and both reset actions start a fresh chat', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const requests: ChatRequest[] = [];
  await page.route(url => url.pathname === '/api/chat', async route => {
    const request: ChatRequest = route.request().postDataJSON();
    requests.push(request);
    const reply = request.messages.at(-1)!.content === 'End this chat'
      ? { ...replyFor(request), reply: 'This chat has ended. Reset to start a new drink conversation.', picks: [], suggestions: [], endedReason: 'repeated_off_topic' }
      : replyFor(request);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) });
  });
  await page.goto('/#/chat');
  await page.getByRole('button', { name: 'Try something different', exact: true }).click();
  await expect(page.locator('.drink-chat-pick')).toHaveCount(2);
  await page.locator('#drink-chat-input').fill('End this chat');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('This chat has ended. Reset to start a new drink conversation.', { exact: true })).toBeVisible();
  await expect(page.locator('#drink-chat-input')).toHaveCount(0);
  await expect(page.locator('.drink-chat-suggestions button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset chat', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Iced Matcha Latte', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View Iced Matcha Latte', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Iced Matcha Latte', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset chat', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(4);
  await expect(page.locator('#drink-chat-input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset chat', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('chat-ended.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Reset chat', exact: true }).click();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(0);
  await expect(page.locator('#drink-chat-input')).toBeVisible();
  await page.getByRole('button', { name: 'Try something different', exact: true }).click();
  await expect(page.locator('.drink-chat-pick')).toHaveCount(2);
  expect(requests[2].messages).toEqual([{ role: 'user', content: 'Try something different' }]);
  await page.locator('#drink-chat-input').fill('End this chat');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Reset chat', exact: true })).toBeVisible();
  expect(requests).toHaveLength(4);
  for (const request of requests) expect(Object.keys(request).sort()).toEqual(['availability', 'messages', 'preferences']);
  await page.getByRole('button', { name: 'Reset conversation', exact: true }).click();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(0);
  await expect(page.locator('#drink-chat-input')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset chat', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(0);
  await expect(page.locator('#drink-chat-input')).toBeVisible();
});

test('the twentieth submission ends chat while retrying a failed request does not consume another turn', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const seed = {
    turnCount: 18,
    preferences: { ...defaultPreferences, temperature: 'iced' },
    messages: [
      { role: 'user', content: 'An iced drink' },
      { role: 'assistant', content: 'Would you like to keep it iced?', picks: [], suggestions: ['Keep it iced'] },
    ],
  };
  await page.addInitScript(value => {
    const key = 'sc4025-drink-chat:v1';
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(value));
  }, seed);
  const requests: ChatRequest[] = [];
  await page.route(url => url.pathname === '/api/chat', async route => {
    const request: ChatRequest = route.request().postDataJSON();
    requests.push(request);
    const unavailable = requests.length === 1 || requests.length === 3;
    await route.fulfill({ status: unavailable ? 503 : 200, contentType: 'application/json', body: JSON.stringify(unavailable ? { error: 'unavailable' } : replyFor(request)) });
  });
  await page.goto('/#/chat');
  await expect(page.locator('.drink-chat-turn')).toHaveCount(2);
  await page.getByRole('button', { name: 'Keep it iced', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Drink chat is unavailable right now');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.drink-chat-turn')).toHaveCount(4);
  await expect(page.locator('#drink-chat-input')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset chat', exact: true })).toHaveCount(0);
  expect(requests[1]).toEqual(requests[0]);
  await page.getByRole('button', { name: 'Keep it iced', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Drink chat is unavailable right now');
  await expect(page.getByRole('button', { name: 'Reset chat', exact: true })).toHaveCount(0);
  await expect(page.locator('#drink-chat-input')).toBeDisabled();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Reset chat', exact: true })).toBeVisible();
  await expect(page.locator('#drink-chat-input')).toHaveCount(0);
  await expect(page.locator('.drink-chat-suggestions button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(4);
  expect(requests[3]).toEqual(requests[2]);
  await page.screenshot({ path: test.info().outputPath('chat-turn-limit.png'), animations: 'disabled' });
  for (const request of requests) expect(Object.keys(request).sort()).toEqual(['availability', 'messages', 'preferences']);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reset chat', exact: true })).toBeVisible();
  await expect(page.locator('#drink-chat-input')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset chat', exact: true }).click();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(0);
  await expect(page.locator('#drink-chat-input')).toBeVisible();
});

test('pending replies cycle quietly and disappear on completion, reset and navigation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.clock.install({ time: new Date('2026-10-03T01:00:00Z') });
  const pending = await holdChatReplies(page);
  await page.goto('/#/chat');
  await page.clock.pauseAt(new Date('2026-10-03T01:00:10Z'));
  await page.getByRole('button', { name: 'Try something different', exact: true }).click();
  const status = page.locator('.drink-chat-loading[role="status"]');
  const phrase = status.locator('.drink-chat-loading-phrase');
  await expect(status).toBeVisible();
  await expect(status).toMatchAriaSnapshot('- status: Preparing a reply');
  await expect(phrase).toHaveAttribute('aria-hidden', 'true');
  await expect(phrase).toHaveText('Thinking it over');
  await expect(status.locator('.drink-chat-loading-dots > span')).toHaveCount(3);
  await expect(status.locator('.drink-chat-loading-dots')).toHaveAttribute('aria-hidden', 'true');
  await expect(status.locator('.drink-chat-loading-dots > span').first()).toHaveCSS('animation-name', 'chat-pending-dot');
  await expect(phrase).toHaveCSS('animation-name', 'chat-pending-phrase');
  await expect(page.locator('#drink-chat-input')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
  await expect(page.locator('.drink-chat-turn-assistant')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('chat-375-pending.png'), animations: 'disabled' });
  await page.clock.runFor(3199);
  await expect(phrase).toHaveText('Thinking it over');
  await page.clock.runFor(1);
  await expect(phrase).toHaveText('Putting a reply together');
  await page.clock.runFor(3200);
  await expect(phrase).toHaveText('Just a moment');
  await page.clock.runFor(3200);
  await expect(phrase).toHaveText('Thinking it over');
  await expect(status).toMatchAriaSnapshot('- status: Preparing a reply');
  await expect.poll(() => pending.length).toBe(1);
  await fulfillReply(pending[0]);
  await expect(status).toHaveCount(0);
  await expect(page.locator('.drink-chat-turn-assistant')).toHaveCount(1);
  await expect(page.locator('#drink-chat-input')).toBeEnabled();
  await page.clock.runFor(6400);
  await expect(status).toHaveCount(0);

  await page.getByRole('button', { name: 'Reset conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Try something different', exact: true }).click();
  await expect(phrase).toHaveText('Thinking it over');
  await expect.poll(() => pending.length).toBe(2);
  await page.clock.runFor(3200);
  await expect(phrase).toHaveText('Putting a reply together');
  await page.getByRole('button', { name: 'Reset conversation', exact: true }).click();
  await expect(status).toHaveCount(0);
  // Reset aborts the fetch. A late server reply must not recreate its turn.
  await fulfillReply(pending[1]).catch(() => {});
  await page.clock.runFor(6400);
  await expect(page.locator('.drink-chat-turn')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByRole('button', { name: 'Try something different', exact: true }).click();
  await expect(phrase).toHaveText('Thinking it over');
  await expect.poll(() => pending.length).toBe(3);
  await page.getByRole('button', { name: 'Quick choices', exact: true }).click();
  await page.clock.runFor(400);
  await expect(page.locator('.goal-card')).toHaveCount(4);
  await expect(status).toHaveCount(0);
  await fulfillReply(pending[2]).catch(() => {});
  await page.clock.runFor(6400);
  await page.locator('.goal-card').last().click();
  await page.clock.runFor(400);
  await expect(status).toHaveCount(0);
  await expect(page.locator('.drink-chat-turn-assistant')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Your last request did not finish');
});

test('reduced motion keeps pending text still and responds to preference changes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-10-03T01:00:00Z') });
  const pending = await holdChatReplies(page);
  await page.goto('/#/chat');
  await page.clock.pauseAt(new Date('2026-10-03T01:00:10Z'));
  await page.getByRole('button', { name: 'Try something different', exact: true }).click();
  const status = page.locator('.drink-chat-loading[role="status"]');
  const phrase = status.locator('.drink-chat-loading-phrase');
  await expect(phrase).toHaveText('Thinking it over');
  await expect(phrase).toHaveCSS('animation-name', 'none');
  await expect(status.locator('.drink-chat-loading-dots > span').first()).toHaveCSS('animation-name', 'none');
  await page.clock.runFor(9600);
  await expect(phrase).toHaveText('Thinking it over');
  await expect(status).toMatchAriaSnapshot('- status: Preparing a reply');
  await page.screenshot({ path: test.info().outputPath('chat-375-pending-reduced-motion.png'), animations: 'disabled' });
  const stillPhrase = await phrase.elementHandle();
  if (!stillPhrase) throw new Error('The pending reply phrase is missing.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // CSS changes before matchMedia reaches React. Wait for its animated remount
  // so the paused clock cannot skip ahead before the phrase interval starts.
  await expect.poll(() => stillPhrase.evaluate(node => node.isConnected)).toBe(false);
  await stillPhrase.dispose();
  await expect(phrase).toHaveCSS('animation-name', 'chat-pending-phrase');
  await page.clock.runFor(3200);
  await expect(phrase).toHaveText('Putting a reply together');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(phrase).toHaveText('Thinking it over');
  await expect(phrase).toHaveCSS('animation-name', 'none');
  await page.clock.runFor(6400);
  await expect(phrase).toHaveText('Thinking it over');
  await expect.poll(() => pending.length).toBe(1);
  await fulfillReply(pending[0]);
  await expect(status).toHaveCount(0);
  await expect(page.locator('.drink-chat-turn-assistant')).toHaveCount(1);
});

for (const viewport of [{ width: 375, height: 812 }, { width: 320, height: 640 }, { width: 1440, height: 900 }]) {
  test(`chat contains its card carousel and wrapped replies at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route(url => url.pathname === '/api/chat', async route => {
      const request: ChatRequest = route.request().postDataJSON();
      const response = { ...replyFor(request), suggestions: ['Keep it iced and creamy', 'Find a less sweet option', 'Compare these two drinks'] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
    });
    await page.goto('/#/chat');
    const opening = page.locator('.drink-chat-opening .drink-chat-suggestions');
    await expect(opening.locator('button')).toHaveCount(3);
    const openingChoices = await opening.locator('button').evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right };
    }));
    expect(Math.abs(openingChoices[0].right - openingChoices[1].right)).toBeLessThan(2);
    expect(openingChoices[1].y).toBeGreaterThan(openingChoices[0].y);
    expect(openingChoices[2].y).toBeGreaterThan(openingChoices[1].y);
    expect(await opening.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`chat-${viewport.width}-opening.png`), animations: 'disabled' });
    await page.getByRole('button', { name: 'Try something different', exact: true }).click();
    const answer = page.locator('.drink-chat-turn-assistant').last();
    const picks = answer.locator('.drink-chat-picks');
    const suggestions = answer.locator('.drink-chat-suggestions');
    await expect(picks.locator('.drink-chat-pick')).toHaveCount(2);
    await expect(suggestions.locator('button')).toHaveCount(3);
    await expect(answer.locator('.drink-chat-avatar, .drink-chat-answer svg')).toHaveCount(0);
    await expect(answer.locator('.drink-chat-answer strong')).toHaveText('iced tea');
    await expect(answer.locator('.drink-chat-answer')).toHaveText('Try an iced tea drink with a different flavour.');
    await expect(picks.locator('.drink-chat-pick p')).toHaveCount(0);
    await expect(picks.getByText('View drink', { exact: true })).toHaveCount(0);
    await expect(picks.locator('article.drink-chat-pick')).toHaveCount(2);
    await expect(picks.locator('.drink-chat-pick button')).toHaveCount(4);
    await expect(picks.locator('button button')).toHaveCount(0);
    await expect(picks.locator('.drink-chat-pick-name')).toHaveText(['Iced Matcha Latte', 'Iced Chai Tea Latte']);
    await expect(picks.getByRole('button', { name: 'View Iced Matcha Latte', exact: true })).toHaveClass('drink-chat-pick-view');
    await expect(picks.getByRole('button', { name: 'View Iced Chai Tea Latte', exact: true })).toHaveClass('drink-chat-pick-view');
    await expect(picks.locator('.drink-chat-pick-add')).toHaveText(['Add to order', 'Add to order']);
    await expect(picks.locator('.drink-chat-pick-arrow')).toHaveCount(2);
    await expectPriceBadges(picks.locator('.drink-chat-pick'));
    const addBounds = await picks.locator('.drink-chat-pick-add').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().bottom));
    expect(Math.abs(addBounds[0] - addBounds[1])).toBeLessThan(2);

    await expect(picks).toHaveCSS('overflow-x', 'auto');
    if (viewport.width === 320) await expect.poll(() => picks.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    const cardBounds = await picks.locator(':scope > *').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    }));
    expect(Math.abs(cardBounds[0].y - cardBounds[1].y)).toBeLessThan(2);
    expect(cardBounds[1].x).toBeGreaterThan(cardBounds[0].x);
    expect(await suggestions.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await suggestions.evaluate(row => {
      const bounds = row.getBoundingClientRect();
      return [...row.querySelectorAll('button')].every(button => {
        const rect = button.getBoundingClientRect();
        return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
      });
    })).toBe(true);
    const photos = picks.locator('.drink-chat-photo');
    await expect(photos.first().locator('.drink-image')).toHaveCSS('border-radius', '0px');
    await expect(photos.first()).toHaveCSS('aspect-ratio', '4 / 3');
    const matchaImage = photos.first().locator('img[data-drink-image="iced-matcha-latte"]');
    await expect(matchaImage).toHaveAttribute('alt', 'Iced Matcha Latte');
    await expect(matchaImage).toHaveAttribute('src', /\/images\/iced-matcha-latte-small(?:\.[a-f0-9]+)?\.webp$/);
    await expect.poll(() => matchaImage.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
    expect(await picks.locator('.drink-chat-pick').evaluateAll(cards => cards.every(card => {
      const bounds = card.getBoundingClientRect();
      const image = card.querySelector('.drink-chat-photo')!.getBoundingClientRect();
      const title = card.querySelector('.drink-chat-pick-name')!.getBoundingClientRect();
      const arrow = card.querySelector('.drink-chat-pick-arrow')!.getBoundingClientRect();
      const add = card.querySelector<HTMLButtonElement>('.drink-chat-pick-add')!;
      return image.bottom <= title.top + 1 && image.width >= bounds.width - 3
        && arrow.left > bounds.left + bounds.width / 2 && arrow.top < bounds.top + 40
        && add.getBoundingClientRect().top >= title.bottom - 1 && add.offsetHeight >= 44 && add.offsetWidth >= 44;
    }))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const layout = await page.evaluate(() => {
      const screen = document.querySelector('.device-screen')!.getBoundingClientRect();
      return [...document.querySelectorAll('.drink-chat, .drink-chat-flow, .drink-chat-composer')].map(element => {
        const rect = element.getBoundingClientRect();
        return { className: element.className, left: rect.left, right: rect.right, width: rect.width, screenLeft: screen.left, screenRight: screen.right, screenWidth: screen.width };
      });
    });
    for (const box of layout) {
      expect(box.width, `${box.className} must fit the actual device screen`).toBeLessThanOrEqual(box.screenWidth + 1);
      expect(box.left).toBeGreaterThanOrEqual(box.screenLeft - 1);
      expect(box.right).toBeLessThanOrEqual(box.screenRight + 1);
    }
    await page.screenshot({ path: test.info().outputPath(`chat-${viewport.width}-carousel.png`), animations: 'disabled' });

    await picks.locator('.drink-chat-pick-view').first().focus();
    await page.keyboard.press('Tab');
    await expect(picks.locator('.drink-chat-pick-add').first()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(picks.locator('.drink-chat-pick-view').last()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(picks.locator('.drink-chat-pick-add').last()).toBeFocused();
    await expect(picks.locator('.drink-chat-pick').last()).toBeInViewport({ ratio: 1 });
    expect(await picks.locator('.drink-chat-pick-add').last().evaluate(button => {
      const style = getComputedStyle(button);
      const bounds = button.getBoundingClientRect();
      const card = button.closest('.drink-chat-pick')!.getBoundingClientRect();
      const scale = bounds.width / (button as HTMLElement).offsetWidth;
      const ring = (parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset)) * scale;
      return style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) >= 1.5
        && bounds.left - ring >= card.left && bounds.right + ring <= card.right
        && bounds.top - ring >= card.top && bounds.bottom + ring <= card.bottom;
    })).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`chat-${viewport.width}-focused-add.png`), animations: 'disabled' });
    await expect.poll(() => picks.evaluate(row => {
      const card = row.querySelector('.drink-chat-pick:last-child')!.getBoundingClientRect();
      const bounds = row.getBoundingClientRect();
      return card.left >= bounds.left - 1 && card.right <= bounds.right + 1;
    })).toBe(true);
    await page.keyboard.press('Shift+Tab');
    await expect(picks.locator('.drink-chat-pick-view').last()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Iced Chai Tea Latte', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Go back', exact: true }).click();
    await expect(page.locator('.drink-chat-turn')).toHaveCount(2);

    await suggestions.locator('button').first().focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(suggestions.locator('button').last()).toBeFocused();
    await expect.poll(() => suggestions.evaluate(row => {
      const button = row.querySelector('button:last-child')!;
      const rowRect = row.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return buttonRect.left >= rowRect.left - 1 && buttonRect.right <= rowRect.right + 1;
    })).toBe(true);
    await expect(suggestions.locator('button').last()).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const composer = page.locator('.drink-chat-composer-field');
    const input = page.locator('#drink-chat-input');
    await expect(composer).toHaveCSS('outline-style', 'none');
    await input.focus();
    await expect.poll(() => composer.evaluate(element => {
      const style = getComputedStyle(element);
      const screen = document.querySelector('.device-screen')!;
      const scale = screen.getBoundingClientRect().width / screen.clientWidth;
      // Chromium rounds CSS-zoomed outline strokes down to physical pixels.
      const minimumPhysicalWidth = Math.max(1, Math.floor(2 * scale + .01));
      return element.matches(':focus-within') && style.outlineStyle === 'solid'
        && parseFloat(style.outlineWidth) * scale >= minimumPhysicalWidth - .05
        && style.outlineColor === style.borderColor;
    })).toBe(true);
    await expect(input).toHaveCSS('outline-style', 'none');
    await expect(input).toHaveCSS('box-shadow', 'none');
    await page.screenshot({ path: test.info().outputPath(`chat-${viewport.width}-focused-input.png`), animations: 'disabled' });
    await input.fill('Keep it iced');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Send message' })).toBeFocused();
    expect(await composer.evaluate(element => element.matches(':focus-within'))).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`chat-${viewport.width}-focused-composer.png`), animations: 'disabled' });
  });
}

for (const scenario of [
  { name: 'landscape', viewport: { width: 844, height: 390 }, enlargedText: false },
  { name: 'enlarged text', viewport: { width: 375, height: 812 }, enlargedText: true },
]) {
  test(`chat cards and composer remain reachable with ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route(url => url.pathname === '/api/chat', async route => {
      const request: ChatRequest = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(replyFor(request)) });
    });
    await page.goto('/#/chat');
    if (scenario.enlargedText) {
      // Stress text wrapping in this isolated page without changing app styles.
      await page.addStyleTag({ content: '.drink-chat-answer, .drink-chat-user, .drink-chat-pick-name, .drink-chat-suggestions > button { font-size: 20px !important; } .drink-chat-composer-field input { font-size: 24px !important; }' });
    }
    await page.getByRole('button', { name: 'Try something different', exact: true }).click();
    const cards = page.locator('.drink-chat-pick');
    await expect(cards).toHaveCount(2);
    await expectPriceBadges(cards);
    await expect(page.locator('#drink-chat-input')).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await cards.first().locator('.drink-chat-pick-view').focus();
    await page.keyboard.press('Tab');
    await expect(cards.first().locator('.drink-chat-pick-add')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cards.last().locator('.drink-chat-pick-view')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cards.last().locator('.drink-chat-pick-add')).toBeFocused();
    await expect(cards.last()).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#drink-chat-input')).toBeInViewport({ ratio: 1 });
    if (scenario.enlargedText) await expect(page.locator('.drink-chat-pick-name').first()).toHaveCSS('font-size', '20px');
    await page.screenshot({ path: test.info().outputPath(`chat-${scenario.name.replace(' ', '-')}.png`), animations: 'disabled' });
  });
}
