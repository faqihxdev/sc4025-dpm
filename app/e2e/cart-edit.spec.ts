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
  await updateButton(page, 'S$18.30').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(cartURL);
  await expect(line(page, 'iced-matcha-latte', 'tall')).toHaveCount(0);
  await expect(line(page, 'iced-matcha-latte', 'grande').locator('.quantity-control > span')).toHaveText('2');
  await expect(line(page, 'iced-matcha-latte', 'grande').locator('.product-price')).toHaveText('S$9.15');
  await expect(page.locator('.cart-total strong')).toHaveText('S$26.00');
  await expect(page.getByRole('button', { name: 'Edit Iced Matcha Latte, Grande', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'View order, 3 items', exact: true })).toBeVisible();
  await page.reload();
  await expect(line(page, 'iced-matcha-latte', 'grande').locator('.quantity-control > span')).toHaveText('2');
  await expect(line(page, 'iced-chai-latte', 'tall').locator('.quantity-control > span')).toHaveText('1');
  await expect(page.locator('.cart-total strong')).toHaveText('S$26.00');
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
