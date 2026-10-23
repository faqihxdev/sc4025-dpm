import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { defaultAvailability, defaultPreferences } from '../src/domain/catalogue';
import type { CartItem } from '../src/domain/model';

const sessionKey = 'sc4025-drink-finder:v1';
const chatKey = 'sc4025-drink-chat:v1';
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Choose size', exact: true });
const opener = (page: Page, name = 'Iced Matcha Latte') => page.getByRole('button', { name: `Add ${name} to order`, exact: true });
const sizeChoice = (page: Page, label: string) => dialog(page).getByRole('button', { name: new RegExp(`^${label} \\d+ oz$`) });
const confirm = (page: Page, price: string) => dialog(page).getByRole('button', { name: `Add to order · ${price}`, exact: true });

async function seed(page: Page, cart: CartItem[] = [], drinkId = 'iced-matcha-latte', long = false) {
  const messages = Array.from({ length: long ? 6 : 1 }, (_, index) => [
    { role: 'user', content: long ? `Question ${index + 1}: ${'I would like a creamy drink. '.repeat(15)}` : 'Help me choose' },
    { role: 'assistant', content: long ? `Reply ${index + 1}: ${'Here is a drink to try. '.repeat(18)}` : 'Here are two drinks to try.', picks: index === (long ? 5 : 0) ? [
      { drinkId, reason: 'A creamy drink to try.' },
      { drinkId: 'iced-chai-latte', reason: 'A spiced tea alternative.' },
    ] : [], suggestions: ['Less sweet', 'Compare these'] },
  ]).flat();
  await page.addInitScript(({ key, chatKey, saved, conversation }) => {
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(saved));
    if (!sessionStorage.getItem(chatKey)) sessionStorage.setItem(chatKey, JSON.stringify(conversation));
  }, {
    key: sessionKey, chatKey,
    saved: { version: 2, preferences: defaultPreferences, availability: defaultAvailability, cart },
    conversation: { messages, preferences: defaultPreferences, turnCount: long ? 6 : 1, endedReason: null },
  });
}

const savedCart = (page: Page) => page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!).cart, sessionKey);
const savedChat = (page: Page) => page.evaluate(key => sessionStorage.getItem(key), chatKey);

// Pickers are entirely local. No provider calls or external traffic may escape.
test.beforeEach(async ({ context, baseURL, page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== origin || url.pathname === '/api/chat' ? route.abort('blockedbyclient') : route.continue();
  });
});

test('Tall is a preview until confirmation, and adding different sizes preserves the conversation and draft', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  let requests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/chat') requests++; });
  await page.goto('/#/chat');
  const conversation = await savedChat(page);
  const composer = page.getByRole('textbox', { name: 'Describe your drink', exact: true });
  await composer.fill('What about oatmilk?');
  await opener(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(sizeChoice(page, 'Tall')).toHaveAttribute('aria-pressed', 'true');
  await expect(sizeChoice(page, 'Short')).toHaveCount(0);
  await expect(confirm(page, 'S$8.40')).toBeEnabled();
  expect(await savedCart(page)).toEqual([]);
  await confirm(page, 'S$8.40').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(opener(page)).toBeFocused();
  expect(await savedCart(page)).toEqual([{ drinkId: 'iced-matcha-latte', sizeId: 'tall', quantity: 1 }]);
  await opener(page).click();
  await sizeChoice(page, 'Grande').click();
  await expect(confirm(page, 'S$9.15')).toBeEnabled();
  expect(await savedCart(page)).toEqual([{ drinkId: 'iced-matcha-latte', sizeId: 'tall', quantity: 1 }]);
  await confirm(page, 'S$9.15').click();
  await expect(dialog(page)).toHaveCount(0);
  await opener(page).click();
  await expect(sizeChoice(page, 'Tall')).toHaveAttribute('aria-pressed', 'true');
  await sizeChoice(page, 'Grande').click();
  await confirm(page, 'S$9.15').click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await savedCart(page)).toEqual([
    { drinkId: 'iced-matcha-latte', sizeId: 'tall', quantity: 1 },
    { drinkId: 'iced-matcha-latte', sizeId: 'grande', quantity: 2 },
  ]);
  await expect(composer).toHaveValue('What about oatmilk?');
  expect(await savedChat(page)).toBe(conversation);
  await expect(page).toHaveURL(/#\/chat$/);
  await expect(page.locator('.drink-chat-turn')).toHaveCount(2);
  expect(requests).toBe(0);
  await page.reload();
  expect(await savedCart(page)).toEqual([
    { drinkId: 'iced-matcha-latte', sizeId: 'tall', quantity: 1 },
    { drinkId: 'iced-matcha-latte', sizeId: 'grande', quantity: 2 },
  ]);
  await expect(page.locator('.drink-chat-turn')).toHaveCount(2);
});

test('repeated confirmation during the exit animation adds only once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seed(page);
  await page.goto('/#/chat');
  await opener(page).click();
  const button = confirm(page, 'S$8.40');
  await expect(button).toBeVisible();
  await button.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect(dialog(page)).toHaveCount(0);
  expect(await savedCart(page)).toEqual([{ drinkId: 'iced-matcha-latte', sizeId: 'tall', quantity: 1 }]);
  await expect(opener(page)).toBeFocused();
});
