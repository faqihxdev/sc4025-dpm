import { expect, test } from '@playwright/test';

import type { ChatRequest, ChatResponse } from '../src/chat/contracts';

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

// Each test uses an isolated browser context. Unmocked chat requests and all
// nonlocal requests are blocked, so these tests cannot call a model provider.
test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== origin || url.pathname === '/api/chat' ? route.abort('blockedbyclient') : route.continue();
  });
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
