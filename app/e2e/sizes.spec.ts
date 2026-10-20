import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { defaultAvailability, defaultPreferences } from '../src/domain/catalogue';
import type { ChatRequest, ChatResponse } from '../src/chat/contracts';

const sessionKey = 'sc4025-drink-finder:v1';
const choice = (page: Page, label: string) => page.locator('.size-options').getByRole('button', { name: new RegExp(`^${label} \\d+ oz$`) });
const cartLine = (page: Page, drinkId: string, sizeId: string) => page.locator(`[data-cart-line="${drinkId}:${sizeId}"]`);

async function seedSession(page: Page, saved: Record<string, unknown>) {
  await page.addInitScript(({ key, value }) => {
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(value));
  }, { key: sessionKey, value: { version: 2, preferences: defaultPreferences, availability: defaultAvailability, cart: [], ...saved } });
}

async function expectPrice(page: Page, price: string) {
  await expect(page.locator('.detail-price strong')).toHaveText(price);
  await expect(page.locator('.detail-cta button')).toHaveText(`Add to order · ${price}`);
}

async function openCart(page: Page, quantity: number) {
  await page.getByRole('button', { name: `View order, ${quantity} items`, exact: true }).click();
  await expect(page).toHaveURL(/#\/cart$/);
}

// Only the local preview is permitted. Chat has an explicit fixture in its test;
// every other chat request is blocked, as are all external requests.
test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== origin || url.pathname === '/api/chat' ? route.abort('blockedbyclient') : route.continue();
  });
});

for (const fixture of [
  { id: 'iced-matcha-latte', name: 'Iced Matcha Latte', labels: ['Tall', 'Grande', 'Venti'], ounces: ['12 oz', '16 oz', '20 oz'], prices: ['S$8.40', 'S$9.15', 'S$9.90'] },
  { id: 'latte', name: 'Caffè Latte', labels: ['Short', 'Tall', 'Grande', 'Venti'], ounces: ['8 oz', '12 oz', '16 oz', '20 oz'], prices: ['S$6.45', 'S$7.20', 'S$7.95', 'S$8.70'] },
]) {
  test(`${fixture.name} sizes default to Tall and update both simulated prices`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/#/drink/${fixture.id}?from=menu`);
    await expect(page.getByRole('heading', { name: fixture.name, exact: true })).toBeVisible();
    await expect(page.locator('.size-group legend')).toHaveText('Size');
    const buttons = page.locator('.size-options button');
    await expect(buttons).toHaveCount(fixture.labels.length);
    await expect(choice(page, 'Tall')).toHaveAttribute('aria-pressed', 'true');
    await expectPrice(page, fixture.prices[fixture.labels.indexOf('Tall')]);
    if (fixture.id === 'iced-matcha-latte') await expect(choice(page, 'Short')).toHaveCount(0);
    for (const [index, label] of fixture.labels.entries()) {
      await expect(choice(page, label)).toContainText(fixture.ounces[index]);
      await choice(page, label).click();
      await expect(choice(page, label)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.size-options button[aria-pressed="true"]')).toHaveCount(1);
      await expectPrice(page, fixture.prices[index]);
    }
    await page.reload();
    await expect(choice(page, 'Venti')).toHaveAttribute('aria-pressed', 'true');
    await expectPrice(page, fixture.prices.at(-1)!);
    const cupWidths = await buttons.locator('.size-cup svg').evaluateAll(icons => icons.map(icon => icon.getBoundingClientRect().width));
    expect(cupWidths).toHaveLength(fixture.labels.length);
    for (let index = 1; index < cupWidths.length; index++) expect(cupWidths[index]).toBeGreaterThan(cupWidths[index - 1]);
  });
}

test('different sizes keep separate quantities, totals and reopen the chosen cart size', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/drink/iced-matcha-latte?from=menu');
  await page.locator('.detail-cta button').click();
  await choice(page, 'Grande').click();
  await expectPrice(page, 'S$9.15');
  await page.locator('.detail-cta button').click();
  await page.locator('.detail-cta button').click();
  await openCart(page, 3);
  const tall = cartLine(page, 'iced-matcha-latte', 'tall');
  const grande = cartLine(page, 'iced-matcha-latte', 'grande');
  await expect(page.locator('.cart-item')).toHaveCount(2);
  await expect(tall.locator('.product-meta')).toContainText('Tall · 12 oz');
  await expect(grande.locator('.product-meta')).toContainText('Grande · 16 oz');
  await expect(tall.locator('.quantity-control > span')).toHaveText('1');
  await expect(grande.locator('.quantity-control > span')).toHaveText('2');
  await expect(tall.locator('.product-price')).toHaveText('S$8.40');
  await expect(grande.locator('.product-price')).toHaveText('S$9.15');
  await expect(grande.locator('.cart-item-bottom > strong')).toHaveText('S$18.30');
  await expect(page.locator('.cart-total strong')).toHaveText('S$26.70');
  await page.screenshot({ path: test.info().outputPath('sizes-375-two-size-cart.png'), animations: 'disabled' });
  await grande.getByRole('button', { name: 'Add one Iced Matcha Latte, Grande', exact: true }).click();
  await expect(grande.locator('.quantity-control > span')).toHaveText('3');
  await expect(tall.locator('.quantity-control > span')).toHaveText('1');
  await expect(page.locator('.cart-total strong')).toHaveText('S$35.85');
  await page.reload();
  await expect(grande.locator('.quantity-control > span')).toHaveText('3');
  await expect(tall.locator('.quantity-control > span')).toHaveText('1');
  await grande.locator('.cart-product').click();
  await expect(choice(page, 'Grande')).toHaveAttribute('aria-pressed', 'true');
  await expectPrice(page, 'S$9.15');
  await page.reload();
  await expect(choice(page, 'Grande')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await tall.getByRole('button', { name: 'Remove one Iced Matcha Latte, Tall', exact: true }).click();
  await expect(tall).toHaveCount(0);
  await expect(grande.locator('.quantity-control > span')).toHaveText('3');
  await expect(page.locator('.cart-total strong')).toHaveText('S$27.45');
  await expect(page.getByRole('button', { name: 'View order, 3 items', exact: true })).toBeVisible();
});

test('size changes preserve detail scroll and replace history so browser Back returns to the list', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const listURL = page.url();
  await page.getByRole('searchbox', { name: 'Search drinks' }).fill('Caffè Latte');
  await page.getByRole('main').getByRole('button', { name: /^Caffè Latte/ }).click();
  await page.locator('.size-options').evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const main = page.getByRole('main');
  expect(await main.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  for (const label of ['Grande', 'Venti', 'Short', 'Grande']) {
    const scroll = await main.evaluate(element => element.scrollTop);
    await choice(page, label).click();
    await expect(choice(page, label)).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(new RegExp(`[?&]size=${label.toLowerCase()}$`));
    await expect.poll(() => main.evaluate(element => element.scrollTop)).toBe(scroll);
  }
  await expectPrice(page, 'S$7.95');
  await page.reload();
  await expect(choice(page, 'Grande')).toHaveAttribute('aria-pressed', 'true');
  await expectPrice(page, 'S$7.95');
  await page.goBack();
  await expect(page).toHaveURL(listURL);
  await expect(page.getByRole('searchbox', { name: 'Search drinks' })).toBeVisible();
  await expect(page.locator('.size-options')).toHaveCount(0);
});

test('legacy carts migrate to Tall without losing drinks, preferences or stock', async ({ page }) => {
  const preferences = { ...defaultPreferences, goal: 'refreshing', temperature: 'iced', sweetness: 'less' };
  await seedSession(page, {
    version: 1, preferences, availability: { ...defaultAvailability, 'iced-chai-latte': false },
    cart: [{ drinkId: 'iced-matcha-latte', quantity: 2 }, { drinkId: 'iced-chai-latte', quantity: 1 }],
  });
  await page.goto('/#/cart');
  await expect(page.locator('.cart-item')).toHaveCount(2);
  await expect(cartLine(page, 'iced-matcha-latte', 'tall').locator('.quantity-control > span')).toHaveText('2');
  await expect(cartLine(page, 'iced-chai-latte', 'tall').locator('.cart-warning')).toBeVisible();
  await expect(page.locator('.cart-total strong')).toHaveText('S$24.50');
  const stored = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), sessionKey);
  expect(stored.version).toBe(2);
  expect(stored.preferences).toEqual(preferences);
  expect(stored.availability['iced-chai-latte']).toBe(false);
  expect(stored.cart).toEqual([
    { drinkId: 'iced-matcha-latte', sizeId: 'tall', quantity: 2 },
    { drinkId: 'iced-chai-latte', sizeId: 'tall', quantity: 1 },
  ]);
  await page.reload();
  await expect(page.locator('.cart-item')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'View order, 3 items', exact: true })).toBeVisible();
});

test('unavailable recipes block adding every size while existing size lines remain removable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedSession(page, { cart: [{ drinkId: 'latte', sizeId: 'tall', quantity: 1 }, { drinkId: 'latte', sizeId: 'grande', quantity: 1 }] });
  await page.goto('/#/drink/latte?from=cart&size=grande');
  await page.getByRole('button', { name: 'Demo settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Demo settings', exact: true });
  await settings.getByRole('checkbox', { name: 'Caffè Latte', exact: true }).uncheck();
  await settings.getByRole('button', { name: 'Close dialog', exact: true }).click();
  for (const label of ['Short', 'Tall', 'Grande', 'Venti']) {
    await choice(page, label).click();
    await expect(choice(page, label)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Currently unavailable', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'View order, 2 items', exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByRole('button', { name: 'Currently unavailable', exact: true })).toBeDisabled();
  await openCart(page, 2);
  const lines = page.locator('.cart-item');
  await expect(lines).toHaveCount(2);
  await expect(lines.locator('.quantity-control button[disabled]')).toHaveCount(2);
  await expect(lines.locator('.cart-warning')).toHaveCount(2);
  await cartLine(page, 'latte', 'grande').getByRole('button', { name: 'Remove one Caffè Latte, Grande', exact: true }).click();
  await expect(cartLine(page, 'latte', 'grande')).toHaveCount(0);
  await expect(cartLine(page, 'latte', 'tall')).toHaveCount(1);
  await expect(page.locator('.cart-total strong')).toHaveText('S$7.20');
});

test('chat size picker starts Tall after a Grande detail selection and makes no extra request', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requests: ChatRequest[] = [];
  await page.route(url => url.pathname === '/api/chat', async route => {
    const request: ChatRequest = route.request().postDataJSON();
    requests.push(request);
    const response: ChatResponse = {
      reply: 'Here are two iced tea choices.', suggestions: ['Compare these'], preferences: request.preferences,
      picks: [{ drinkId: 'iced-matcha-latte', reason: 'Matcha with milk over ice.' }, { drinkId: 'iced-chai-latte', reason: 'Spiced black tea with milk over ice.' }],
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.goto('/#/chat');
  await page.getByRole('button', { name: 'Help me choose', exact: true }).click();
  await page.getByRole('button', { name: 'View Iced Matcha Latte', exact: true }).click();
  await expect(choice(page, 'Tall')).toHaveAttribute('aria-pressed', 'true');
  await choice(page, 'Grande').click();
  await expectPrice(page, 'S$9.15');
  await page.locator('.detail-cta button').click();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.locator('.drink-chat-turn')).toHaveCount(2);
  await expect(page.locator('.drink-chat-pick-price')).toHaveText(['S$8.40', 'S$7.70']);
  await expect(page.locator('.drink-chat-pick .size-options')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Iced Matcha Latte to order', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose size', exact: true });
  await expect(picker.getByRole('button', { name: 'Tall 12 oz', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await picker.getByRole('button', { name: 'Add to order · S$8.40', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(page).toHaveURL(/#\/chat$/);
  await expect(page.locator('.drink-chat-turn')).toHaveCount(2);
  expect(requests).toHaveLength(1);
  await openCart(page, 2);
  await expect(page.locator('.cart-item')).toHaveCount(2);
  await expect(cartLine(page, 'iced-matcha-latte', 'tall').locator('.quantity-control > span')).toHaveText('1');
  await expect(cartLine(page, 'iced-matcha-latte', 'grande').locator('.quantity-control > span')).toHaveText('1');
  await expect(page.locator('.cart-total strong')).toHaveText('S$17.55');
  await page.reload();
  await expect(page.locator('.cart-item')).toHaveCount(2);
  expect(requests).toHaveLength(1);
});

test('native cart transitions name only the chosen size line when a drink has two sizes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const runtimeErrors: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await seedSession(page, { cart: [{ drinkId: 'iced-matcha-latte', sizeId: 'tall', quantity: 1 }, { drinkId: 'iced-matcha-latte', sizeId: 'grande', quantity: 1 }] });
  await page.addInitScript(() => {
    const collect = () => [...document.querySelectorAll('*')].flatMap(element => {
      const name = getComputedStyle(element).viewTransitionName;
      return name.startsWith('drink-') ? [{ name, line: element.closest('.cart-item')?.getAttribute('data-cart-line') ?? null }] : [];
    });
    const probe = {
      supported: typeof document.startViewTransition === 'function', finished: 0, errors: [] as string[],
      snapshots: [] as { before: ReturnType<typeof collect>; after: ReturnType<typeof collect> }[],
    };
    Object.defineProperty(window, '__sizeTransitions', { value: probe });
    addEventListener('unhandledrejection', event => probe.errors.push(String(event.reason)));
    if (!probe.supported) return;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = options => {
      const snapshot = { before: collect(), after: [] as ReturnType<typeof collect> };
      probe.snapshots.push(snapshot);
      const transition = start(options);
      transition.ready.then(() => { snapshot.after = collect(); }, error => { probe.errors.push(String(error)); });
      transition.finished.then(() => { probe.finished++; }, error => { probe.errors.push(String(error)); });
      return transition;
    };
  });
  await page.goto('/#/cart');
  await expect(page.locator('.cart-item')).toHaveCount(2);
  expect(await page.evaluate(() => Reflect.get(window, '__sizeTransitions').supported)).toBe(true);
  for (const [index, label] of ['Grande', 'Tall'].entries()) {
    const sizeId = label.toLowerCase();
    const row = cartLine(page, 'iced-matcha-latte', sizeId);
    await row.locator('.drink-title').scrollIntoViewIfNeeded();
    await expect.poll(() => row.locator('img[data-drink-image="iced-matcha-latte"]').evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
    await row.locator('.cart-product').click();
    await expect(choice(page, label)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => Reflect.get(window, '__sizeTransitions').finished)).toBe(index * 2 + 1);
    await page.getByRole('button', { name: 'Go back', exact: true }).click();
    await expect(page.locator('.cart-item')).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => Reflect.get(window, '__sizeTransitions').finished)).toBe(index * 2 + 2);
  }
  const probe = await page.evaluate(() => Reflect.get(window, '__sizeTransitions'));
  expect(probe.snapshots).toHaveLength(4);
  for (const [index, snapshot] of probe.snapshots.entries()) {
    const before = snapshot.before.map((entry: { name: string }) => entry.name).sort();
    const after = snapshot.after.map((entry: { name: string }) => entry.name).sort();
    expect(before).toEqual(['drink-iced-matcha-latte', 'drink-image-iced-matcha-latte'].sort());
    expect(after).toEqual(before);
    const cartSide = index % 2 === 0 ? snapshot.before : snapshot.after;
    const expectedLine = index < 2 ? 'iced-matcha-latte:grande' : 'iced-matcha-latte:tall';
    expect(cartSide.map((entry: { line: string }) => entry.line)).toEqual([expectedLine, expectedLine]);
  }
  expect(probe.errors).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

for (const scenario of [
  { name: '320px', viewport: { width: 320, height: 640 }, enlarged: false },
  { name: '375px', viewport: { width: 375, height: 812 }, enlarged: false },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, enlarged: false },
  { name: 'landscape', viewport: { width: 844, height: 390 }, enlarged: false },
  { name: 'enlarged text', viewport: { width: 375, height: 812 }, enlarged: true },
]) {
  test(`size choices and the cart stay reachable with ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/drink/latte?from=menu');
    if (scenario.enlarged) await page.addStyleTag({ content: '.size-choice strong, .size-choice > span:not(.size-cup):not(.size-check), .detail-copy .intro-copy, .cart-product strong, .cart-product .product-meta { font-size: 20px !important; }' });
    const sizes = page.locator('.size-options');
    await sizes.scrollIntoViewIfNeeded();
    const buttons = sizes.getByRole('button');
    await expect(buttons).toHaveCount(4);
    expect(await sizes.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await buttons.evaluateAll(elements => elements.every(element => {
      const button = element as HTMLElement;
      const bounds = button.getBoundingClientRect();
      const screen = document.querySelector('.device-screen')!.getBoundingClientRect();
      return button.offsetWidth >= 44 && button.offsetHeight >= 88
        && bounds.left >= screen.left && bounds.right <= screen.right
        && getComputedStyle(button).transitionDuration.split(',').every(duration => parseFloat(duration) === 0);
    }))).toBe(true);
    if (scenario.enlarged) await expect(choice(page, 'Grande').locator('strong')).toHaveCSS('font-size', '20px');
    await choice(page, 'Short').focus();
    for (const label of ['Tall', 'Grande', 'Venti']) {
      await page.keyboard.press('Tab');
      await expect(choice(page, label)).toBeFocused();
      await expect(choice(page, label)).toBeInViewport({ ratio: 1 });
      expect(await choice(page, label).evaluate(button => {
        const style = getComputedStyle(button);
        const bounds = button.getBoundingClientRect();
        const screen = document.querySelector('.device-screen')!;
        const viewport = document.querySelector('.app-scroll')!.getBoundingClientRect();
        const scale = screen.getBoundingClientRect().width / screen.clientWidth;
        const ring = (parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset)) * scale;
        return style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) > 0
          && bounds.top - ring >= viewport.top - 1 && bounds.bottom + ring <= viewport.bottom + 1;
      }), 'The complete keyboard focus ring must clear the header and fixed Add bar').toBe(true);
    }
    await page.keyboard.press('Space');
    await expect(choice(page, 'Venti')).toHaveAttribute('aria-pressed', 'true');
    await expectPrice(page, 'S$8.70');
    await expect(page.locator('.detail-cta button')).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`sizes-${scenario.name.replaceAll(' ', '-')}-detail.png`), animations: 'disabled' });
    await page.locator('.detail-cta button').click();
    await openCart(page, 1);
    const line = cartLine(page, 'latte', 'venti');
    await expect(line.locator('.product-meta')).toContainText('Venti · 20 oz');
    await expect(line.locator('.product-price')).toHaveText('S$8.70');
    await expect(page.locator('.cart-total strong')).toHaveText('S$8.70');
    await line.scrollIntoViewIfNeeded();
    await line.getByRole('button', { name: 'Add one Caffè Latte, Venti', exact: true }).focus();
    await expect(line.getByRole('button', { name: 'Add one Caffè Latte, Venti', exact: true })).toBeInViewport({ ratio: 1 });
    expect(await line.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`sizes-${scenario.name.replaceAll(' ', '-')}-cart.png`), animations: 'disabled' });
  });
}
