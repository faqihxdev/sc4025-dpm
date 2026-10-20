import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { defaultAvailability, defaultPreferences } from '../src/domain/catalogue';
import type { CartItem } from '../src/domain/model';

const sessionKey = 'sc4025-drink-finder:v1';
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Edit size', exact: true });
const line = (page: Page, drinkId: string, sizeId: string) => page.locator(`[data-cart-line="${drinkId}:${sizeId}"]`);
const sizeChoice = (page: Page, name: string) => dialog(page).getByRole('button', { name: new RegExp(`^${name} \\d+ oz$`) });
const updateButton = (page: Page, price: string) => dialog(page).getByRole('button', { name: `Update order · ${price}`, exact: true });

async function seedCart(page: Page, cart: CartItem[], availability: Record<string, boolean> = {}) {
  await page.addInitScript(({ key, saved }) => {
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(saved));
  }, {
    key: sessionKey,
    saved: { version: 2, preferences: defaultPreferences, availability: { ...defaultAvailability, ...availability }, cart },
  });
}

async function savedCart(page: Page) {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!).cart, sessionKey);
}

// Cart editing is local. Prevent both unmocked model requests and external I/O.
test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== origin || url.pathname === '/api/chat' ? route.abort('blockedbyclient') : route.continue();
  });
});

test('editing moves the whole cart quantity to a new size without navigation and survives refresh', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedCart(page, [{ drinkId: 'iced-matcha-latte', sizeId: 'tall', quantity: 2 }, { drinkId: 'iced-chai-latte', sizeId: 'tall', quantity: 1 }]);
  await page.goto('/#/cart');
  const cartURL = page.url();
  const opener = page.getByRole('button', { name: 'Edit Iced Matcha Latte, Tall', exact: true });
  await expect(opener).toHaveText('Edit');
  await opener.click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('.cart-edit-product')).toContainText('Iced Matcha Latte');
  await expect(dialog(page).locator('.cart-edit-summary')).toContainText('2 drinks');
  await expect(sizeChoice(page, 'Tall')).toHaveAttribute('aria-pressed', 'true');
  await expect(sizeChoice(page, 'Short')).toHaveCount(0);
  await expect(updateButton(page, 'S$16.80')).toBeDisabled();
  await sizeChoice(page, 'Grande').click();
  await expect(sizeChoice(page, 'Grande')).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog(page).locator('.cart-edit-summary')).toContainText('S$9.15 each');
  await expect(updateButton(page, 'S$18.30')).toBeEnabled();
  // Previewing must not alter the cart until the explicit confirmation.
  await expect(line(page, 'iced-matcha-latte', 'tall').locator('.quantity-control > span')).toHaveText('2');
  await expect(line(page, 'iced-matcha-latte', 'grande')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('cart-edit-375-drawer.png'), animations: 'disabled' });
  await updateButton(page, 'S$18.30').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(cartURL);
  await expect(line(page, 'iced-matcha-latte', 'tall')).toHaveCount(0);
  await expect(line(page, 'iced-matcha-latte', 'grande').locator('.quantity-control > span')).toHaveText('2');
  await expect(line(page, 'iced-matcha-latte', 'grande').locator('.product-price')).toHaveText('S$9.15');
  await expect(page.locator('.cart-total strong')).toHaveText('S$26.00');
  await expect(page.getByRole('button', { name: 'Edit Iced Matcha Latte, Grande', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'View order, 3 items', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('cart-edit-375-updated-cart.png'), animations: 'disabled' });
  await page.reload();
  await expect(line(page, 'iced-matcha-latte', 'grande').locator('.quantity-control > span')).toHaveText('2');
  await expect(line(page, 'iced-chai-latte', 'tall').locator('.quantity-control > span')).toHaveText('1');
  await expect(page.locator('.cart-total strong')).toHaveText('S$26.00');
});

for (const fixture of [{ destination: 3, total: 'S$45.75' }, { destination: 97, total: 'S$905.85' }]) {
  test(`editing merges a destination quantity of ${fixture.destination} without losing drinks and restores the resulting Edit focus`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedCart(page, [{ drinkId: 'iced-matcha-latte', sizeId: 'tall', quantity: 2 }, { drinkId: 'iced-matcha-latte', sizeId: 'grande', quantity: fixture.destination }]);
    await page.goto('/#/cart');
    await page.getByRole('button', { name: 'Edit Iced Matcha Latte, Tall', exact: true }).click();
    await sizeChoice(page, 'Grande').click();
    await expect(updateButton(page, 'S$18.30')).toBeEnabled();
    await expect(dialog(page)).toContainText('Combines with your other Grande.');
    await updateButton(page, 'S$18.30').click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('.cart-item')).toHaveCount(1);
    const resulting = line(page, 'iced-matcha-latte', 'grande');
    await expect(resulting.locator('.quantity-control > span')).toHaveText(String(fixture.destination + 2));
    await expect(resulting.locator('.cart-item-bottom > strong')).toHaveText(fixture.total);
    await expect(page.locator('.cart-total strong')).toHaveText(fixture.total);
    await expect(page.getByRole('button', { name: 'Edit Iced Matcha Latte, Grande', exact: true })).toBeFocused();
    await expect(page).toHaveURL(/#\/cart$/);
    await page.reload();
    await expect(resulting.locator('.quantity-control > span')).toHaveText(String(fixture.destination + 2));
    if (fixture.destination === 97) await expect(resulting.getByRole('button', { name: 'Add one Iced Matcha Latte, Grande', exact: true })).toBeDisabled();
  });
}

test('an over-99 merge is blocked with an alert while another valid size can still be previewed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const cart: CartItem[] = [{ drinkId: 'iced-matcha-latte', sizeId: 'tall', quantity: 2 }, { drinkId: 'iced-matcha-latte', sizeId: 'grande', quantity: 98 }];
  await seedCart(page, cart);
  await page.goto('/#/cart');
  await page.getByRole('button', { name: 'Edit Iced Matcha Latte, Tall', exact: true }).click();
  await sizeChoice(page, 'Grande').click();
  await expect(updateButton(page, 'S$18.30')).toBeDisabled();
  await expect(dialog(page).getByRole('status')).toContainText('99');
  await expect(dialog(page).getByRole('status')).toBeVisible();
  expect(await savedCart(page)).toEqual(cart);
  await sizeChoice(page, 'Venti').click();
  await expect(updateButton(page, 'S$19.80')).toBeEnabled();
  await expect(dialog(page).getByRole('status')).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await savedCart(page)).toEqual(cart);
  await expect(page.locator('.cart-total strong')).toHaveText('S$913.50');
});

test('Close, Escape and the scrim discard previews, trap focus and preserve the original cart scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const cart: CartItem[] = [
    { drinkId: 'iced-matcha-latte', sizeId: 'tall', quantity: 1 }, { drinkId: 'iced-chai-latte', sizeId: 'tall', quantity: 1 },
    { drinkId: 'iced-latte', sizeId: 'tall', quantity: 1 }, { drinkId: 'latte', sizeId: 'tall', quantity: 1 },
    { drinkId: 'americano', sizeId: 'tall', quantity: 1 }, { drinkId: 'oat-latte', sizeId: 'tall', quantity: 1 },
  ];
  await seedCart(page, cart);
  await page.goto('/#/cart');
  const main = page.getByRole('main');
  const opener = page.getByRole('button', { name: 'Edit Oatmilk Latte, Tall', exact: true });
  await opener.scrollIntoViewIfNeeded();
  const originalScroll = await main.evaluate(element => element.scrollTop);
  expect(originalScroll).toBeGreaterThan(0);
  for (const dismissal of ['Close', 'Escape', 'scrim']) {
    await opener.click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused();
    expect(await page.locator('.app-body').evaluate(element => (element as HTMLElement).inert)).toBe(true);
    await sizeChoice(page, 'Venti').click();
    await expect(updateButton(page, 'S$9.70')).toBeEnabled();
    const focusable = dialog(page).locator('button:not(:disabled), a[href], input, select, [tabindex="0"]');
    await focusable.first().focus();
    await page.keyboard.press('Shift+Tab');
    await expect(focusable.last()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(focusable.first()).toBeFocused();
    expect(await main.evaluate(element => element.scrollTop)).toBe(originalScroll);
    if (dismissal === 'Escape') await page.keyboard.press('Escape');
    else if (dismissal === 'scrim') {
      const scrim = page.locator('.sheet-scrim');
      const bounds = (await scrim.boundingBox())!;
      await scrim.click({ position: { x: bounds.width / 2, y: 12 } });
    } else await dialog(page).getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await main.evaluate(element => element.scrollTop)).toBe(originalScroll);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    expect(await savedCart(page)).toEqual(cart);
    await expect(page).toHaveURL(/#\/cart$/);
  }
});

test('pointer confirmation during Close or Escape dismissal cannot save a cancelled size preview', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install({ time: new Date('2026-10-03T03:00:00Z') });
  const cart: CartItem[] = [{ drinkId: 'iced-matcha-latte', sizeId: 'tall', quantity: 2 }];
  await seedCart(page, cart);
  await page.goto('/#/cart');
  await page.clock.pauseAt(new Date('2026-10-03T03:00:01Z'));
  // Keep the pointer target stationary while testing the real 160ms timer.
  // This is not reduced motion, which would bypass the dismissal interval.
  await page.addStyleTag({ content: '.sheet, .sheet-scrim { animation: none !important; }' });
  const opener = page.getByRole('button', { name: 'Edit Iced Matcha Latte, Tall', exact: true });
  for (const dismissal of ['Close', 'Escape']) {
    await opener.click();
    await sizeChoice(page, 'Grande').click();
    const target = (await updateButton(page, 'S$18.30').boundingBox())!;
    if (dismissal === 'Escape') await page.keyboard.press('Escape');
    else await dialog(page).getByRole('button', { name: 'Close dialog', exact: true }).click();
    const exitingDialog = page.locator('.sheet[role="dialog"]');
    await expect(exitingDialog).toHaveAttribute('inert', '');
    // A real pointer event respects inert; dispatchEvent would bypass it.
    await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
    expect(await savedCart(page)).toEqual(cart);
    await expect(line(page, 'iced-matcha-latte', 'grande')).toHaveCount(0);
    await page.clock.runFor(159);
    await expect(exitingDialog).toHaveCount(1);
    await page.clock.runFor(1);
    await expect(exitingDialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await savedCart(page)).toEqual(cart);
  }
});

test('unavailable stock blocks confirming every drawer size without changing the cart', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const cart: CartItem[] = [{ drinkId: 'latte', sizeId: 'tall', quantity: 2 }];
  await seedCart(page, cart, { latte: false });
  await page.goto('/#/cart');
  await page.getByRole('button', { name: 'Edit Caffè Latte, Tall', exact: true }).click();
  for (const [name, price] of [['Short', 'S$12.90'], ['Tall', 'S$14.40'], ['Grande', 'S$15.90'], ['Venti', 'S$17.40']]) {
    await sizeChoice(page, name).click();
    await expect(updateButton(page, price)).toBeDisabled();
  }
  await dialog(page).getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await savedCart(page)).toEqual(cart);
  await expect(line(page, 'latte', 'tall').locator('.cart-warning')).toBeVisible();
});

for (const scenario of [
  { name: '320px', viewport: { width: 320, height: 640 }, enlarged: false },
  { name: '375px', viewport: { width: 375, height: 812 }, enlarged: false },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, enlarged: false },
  { name: 'landscape', viewport: { width: 844, height: 390 }, enlarged: false },
  { name: 'enlarged text', viewport: { width: 375, height: 812 }, enlarged: true },
]) {
  test(`the cart size drawer keeps its choices and fixed confirmation reachable with ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedCart(page, [{ drinkId: 'latte', sizeId: 'tall', quantity: 2 }]);
    await page.goto('/#/cart');
    const opener = page.getByRole('button', { name: 'Edit Caffè Latte, Tall', exact: true });
    expect(await opener.evaluate(element => (element as HTMLElement).offsetHeight)).toBeGreaterThanOrEqual(44);
    await opener.click();
    if (scenario.enlarged) await page.addStyleTag({ content: '.cart-size-editor strong, .cart-size-editor .size-choice > span:not(.size-cup):not(.size-check), .cart-edit-summary, .cart-edit-product .product-meta { font-size: 20px !important; }' });
    const editor = dialog(page).locator('.cart-size-editor');
    await expect(editor).toBeVisible();
    await expect(dialog(page)).toHaveAttribute('aria-modal', 'true');
    await expect(editor.locator('.cart-edit-product')).toContainText('Caffè Latte');
    await expect(editor.locator('.cart-edit-summary')).toContainText('2 drinks');
    const image = editor.locator('img[data-drink-image="latte"]');
    await expect.poll(() => image.evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
    const choices = dialog(page).locator('.size-options');
    await expect(choices.getByRole('button')).toHaveCount(4);
    await expect(updateButton(page, 'S$14.40')).toBeDisabled();
    await choices.scrollIntoViewIfNeeded();
    expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await dialog(page).getByRole('button').evaluateAll(buttons => buttons.every(button => {
      const element = button as HTMLElement;
      return element.offsetWidth >= 44 && element.offsetHeight >= 44
        && getComputedStyle(element).transitionDuration.split(',').every(duration => parseFloat(duration) === 0);
    }))).toBe(true);
    await sizeChoice(page, 'Short').focus();
    for (const name of ['Tall', 'Grande', 'Venti']) {
      await page.keyboard.press('Tab');
      await expect(sizeChoice(page, name)).toBeFocused();
      await expect(sizeChoice(page, name)).toBeInViewport({ ratio: 1 });
    }
    await page.keyboard.press('Space');
    await expect(sizeChoice(page, 'Venti')).toHaveAttribute('aria-pressed', 'true');
    const confirm = updateButton(page, 'S$17.40');
    await expect(confirm).toBeEnabled();
    await expect(confirm).toBeInViewport({ ratio: 1 });
    const beforeScroll = (await confirm.boundingBox())!;
    await dialog(page).locator('.sheet-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const afterScroll = (await confirm.boundingBox())!;
    expect(Math.abs(beforeScroll.y - afterScroll.y)).toBeLessThan(1);
    await expect(confirm).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`cart-edit-${scenario.name.replaceAll(' ', '-')}-drawer.png`), animations: 'disabled' });
    await confirm.click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(line(page, 'latte', 'venti').locator('.quantity-control > span')).toHaveText('2');
    await expect(page.locator('.cart-total strong')).toHaveText('S$17.40');
    await expect(page.getByRole('button', { name: 'Edit Caffè Latte, Venti', exact: true })).toBeFocused();
    await expect(page).toHaveURL(/#\/cart$/);
  });
}
