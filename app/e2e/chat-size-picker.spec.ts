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

test('Close, Escape and scrim discard size previews, trap focus and preserve chat scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page, [], 'iced-matcha-latte', true);
  await page.goto('/#/chat');
  await opener(page).scrollIntoViewIfNeeded();
  const flow = page.locator('.drink-chat-flow');
  const originalScroll = await flow.evaluate(element => element.scrollTop);
  expect(originalScroll).toBeGreaterThan(0);
  const conversation = await savedChat(page);
  for (const dismissal of ['Close', 'Escape', 'scrim']) {
    await opener(page).click();
    await expect(dialog(page).getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused();
    expect(await page.locator('.app-body').evaluate(element => (element as HTMLElement).inert)).toBe(true);
    await sizeChoice(page, 'Venti').click();
    await expect(confirm(page, 'S$9.90')).toBeEnabled();
    const controls = dialog(page).getByRole('button');
    await controls.first().focus();
    await page.keyboard.press('Shift+Tab');
    await expect(controls.last()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(controls.first()).toBeFocused();
    if (dismissal === 'Escape') await page.keyboard.press('Escape');
    else if (dismissal === 'scrim') {
      const scrim = page.locator('.sheet-scrim');
      const bounds = (await scrim.boundingBox())!;
      await scrim.click({ position: { x: bounds.width / 2, y: 12 } });
    } else await controls.first().click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(opener(page)).toBeFocused();
    expect(await flow.evaluate(element => element.scrollTop)).toBe(originalScroll);
    expect(await savedCart(page)).toEqual([]);
    expect(await savedChat(page)).toBe(conversation);
    await expect(page).toHaveURL(/#\/chat$/);
  }
});

test('a full Tall line blocks that size while Venti remains addable without a size collision', async ({ page }) => {
  await seed(page, [{ drinkId: 'iced-matcha-latte', sizeId: 'tall', quantity: 99 }]);
  await page.goto('/#/chat');
  await opener(page).click();
  await expect(confirm(page, 'S$8.40')).toBeDisabled();
  await expect(dialog(page).getByRole('status')).toContainText('99');
  await sizeChoice(page, 'Venti').click();
  await expect(confirm(page, 'S$9.90')).toBeEnabled();
  await expect(dialog(page).getByRole('status')).toHaveCount(0);
  await confirm(page, 'S$9.90').click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await savedCart(page)).toEqual([
    { drinkId: 'iced-matcha-latte', sizeId: 'tall', quantity: 99 },
    { drinkId: 'iced-matcha-latte', sizeId: 'venti', quantity: 1 },
  ]);
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

for (const scenario of [
  { label: '375px', viewport: { width: 375, height: 812 }, enlarged: false },
  { label: 'landscape', viewport: { width: 844, height: 390 }, enlarged: false },
  { label: 'enlarged-text', viewport: { width: 375, height: 812 }, enlarged: true },
]) {
  test(`hot drink size choices and fixed confirmation stay reachable at ${scenario.label}`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await seed(page, [], 'latte');
    await page.goto('/#/chat');
    await opener(page, 'Caffè Latte').click();
    if (scenario.enlarged) await page.addStyleTag({ content: '.chat-size-picker strong, .chat-size-picker h3, .chat-size-picker .size-choice > span:not(.size-cup):not(.size-check) { font-size: 20px !important; }' });
    await expect(dialog(page)).toBeVisible();
    await expect(sizeChoice(page, 'Tall')).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog(page).locator('.size-options button')).toHaveCount(4);
    for (const [name, price] of [['Short', 'S$6.45'], ['Tall', 'S$7.20'], ['Grande', 'S$7.95'], ['Venti', 'S$8.70']]) {
      await sizeChoice(page, name).click();
      await expect(confirm(page, price)).toBeEnabled();
      await expect(confirm(page, price)).toBeInViewport({ ratio: 1 });
    }
    expect(await dialog(page).getByRole('button').evaluateAll(buttons => buttons.every(button => {
      const element = button as HTMLElement;
      return element.offsetWidth >= 44 && element.offsetHeight >= 44;
    }))).toBe(true);
    expect(await dialog(page).locator('.chat-size-picker').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`chat-size-${scenario.label}.png`), animations: 'disabled' });
    await confirm(page, 'S$8.70').click();
    await expect(dialog(page)).toHaveCount(0);
    expect(await savedCart(page)).toEqual([{ drinkId: 'latte', sizeId: 'venti', quantity: 1 }]);
    await expect(opener(page, 'Caffè Latte')).toBeFocused();
  });
}

for (const width of [320, 375]) {
  test(`four hot sizes and the price button do not overflow with 200% text at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await seed(page, [], 'hot-chocolate');
    await page.goto('/#/chat');
    await opener(page, 'Signature Hot Chocolate').click();
    await dialog(page).evaluate(sheet => {
      // Snapshot before writing so inherited fonts are doubled once, not four times.
      const elements = [sheet, ...sheet.querySelectorAll('*')].filter(element => element instanceof HTMLElement);
      const sizes = elements.map(element => ({ element, size: parseFloat(getComputedStyle(element).fontSize) }));
      for (const { element, size } of sizes) element.style.setProperty('font-size', `${size * 2}px`, 'important');
    });
    const sizes = dialog(page).locator('.size-options');
    await expect(sizes.getByRole('button')).toHaveCount(4);
    const layout = await sizes.evaluate(element => {
      const content = element.closest('.sheet-content')!.getBoundingClientRect();
      return [...element.querySelectorAll('.size-choice')].map(choice => {
        const bounds = choice.getBoundingClientRect();
        const label = choice.querySelector('strong')!.getBoundingClientRect();
        return {
          choiceFits: bounds.left >= content.left && bounds.right <= content.right,
          labelFits: label.left >= bounds.left && label.right <= bounds.right,
          labelText: choice.querySelector('strong')!.textContent,
        };
      });
    });
    expect(layout.every(choice => choice.choiceFits && choice.labelFits), JSON.stringify(layout)).toBe(true);
    expect(await dialog(page).locator('.sheet-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await sizeChoice(page, 'Venti').click();
    await expect(confirm(page, 'S$9.80')).toBeInViewport({ ratio: 1 });
    const metrics = await confirm(page, 'S$9.80').evaluate(element => {
      const style = getComputedStyle(element);
      return { fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight) };
    });
    expect(metrics.lineHeight).toBeGreaterThanOrEqual(metrics.fontSize * 1.3);
    await page.screenshot({ path: test.info().outputPath(`chat-size-hot-200pct-${width}.png`), animations: 'disabled' });
    await confirm(page, 'S$9.80').click();
    await expect(dialog(page)).toHaveCount(0);
    expect(await savedCart(page)).toEqual([{ drinkId: 'hot-chocolate', sizeId: 'venti', quantity: 1 }]);
  });
}
