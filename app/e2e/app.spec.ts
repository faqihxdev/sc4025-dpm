import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { join } from 'node:path';
import { drinks } from '../src/domain/catalogue.js';

const main = (page: Page) => page.getByRole('main');
const group = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const picks = (page: Page) => main(page).getByRole('article');
const legacyRecipeIds = [
  'iced-americano', 'americano', 'iced-latte', 'latte', 'oat-latte',
  'vanilla-oat-iced-latte', 'black-tea-lemonade', 'strawberry-acai-lemonade',
  'iced-matcha-latte', 'hot-chocolate', 'chamomile-tea', 'pistachio-oat-matcha',
];
const teaCount = drinks.filter(drink => drink.category === 'tea').length;
const stockFixture = (ids: readonly string[]) => Object.fromEntries(drinks.map(drink => [drink.id, ids.includes(drink.id)]));

async function limitStock(page: Page, ids: readonly string[]) {
  await page.addInitScript(availability => {
    const current = JSON.parse(sessionStorage.getItem('sc4025-drink-finder:v1') ?? '{}');
    sessionStorage.setItem('sc4025-drink-finder:v1', JSON.stringify({
      version: 1,
      preferences: { goal: null, temperature: null, avoidCoffee: false, sweetness: 'any', milk: null, budgetCents: null },
      cart: [],
      ...current,
      availability,
    }));
  }, stockFixture(ids));
}

async function startFinder(page: Page, goal = 'Something refreshing') {
  await page.goto('/');
  await page.locator('.finder-banner').getByRole('button', { name: 'Try it now', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${goal}`) }).click();
  await expect(page).toHaveURL(/#\/preferences$/);
  await expect(page.getByRole('heading', { name: 'Preferences', level: 1, exact: true })).toBeVisible();
}

async function showPicks(page: Page) {
  await page.getByRole('button', { name: 'Show my drink picks', exact: true }).click();
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Demo settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Demo settings' })).toBeVisible();
}

async function waitForNativeMotion(page: Page) {
  await expect.poll(() => page.locator('html').evaluate(element =>
    element.hasAttribute('data-goal-transition') || element.hasAttribute('data-drink-transition')),
  { message: 'Still-screen captures must wait for native snapshot overlays to finish' }).toBe(false);
}

async function expectPhotoFraming(page: Page, id: string) {
  const drink = drinks.find(recipe => recipe.id === id);
  if (!drink) throw new Error(`Missing framing recipe: ${id}`);
  const framing = drink.imageFraming ?? { scale: 1.55, centerY: 60 };
  const frame = main(page).locator(`[data-drink-frame="${id}"]`);
  const photo = main(page).locator(`[data-drink-image="${id}"]`);
  await expect(frame).toHaveCSS('background-color', 'rgb(30, 57, 50)');
  await expect(frame).toHaveCSS('border-radius', '50%');
  await expect(frame).toHaveCSS('overflow', 'hidden');
  const geometry = await photo.evaluate(image => {
    const parent = image.closest('[data-drink-frame]');
    if (!(image instanceof HTMLImageElement) || !(parent instanceof HTMLElement)) throw new Error('Missing photograph frame');
    const source = image.getBoundingClientRect();
    const crop = parent.getBoundingClientRect();
    return { widthScale: source.width / crop.width, heightScale: source.height / crop.height, transform: image.style.transform };
  });
  expect(Math.abs(geometry.widthScale - framing.scale)).toBeLessThan(0.01);
  expect(Math.abs(geometry.heightScale - framing.scale)).toBeLessThan(0.01);
  expect(geometry.transform).toBe(`translate(-50%, -${framing.centerY}%)`);
}

async function restoreSavedPreferences(page: Page, preferences: Record<string, string | number | boolean | null>, availableIds?: readonly string[]) {
  await page.addInitScript(({ saved, availability }) => {
    sessionStorage.setItem('sc4025-drink-finder:v1', JSON.stringify({
      version: 1,
      preferences: { goal: null, temperature: null, avoidCoffee: false, sweetness: 'any', milk: null, budgetCents: null, ...saved },
      cart: [],
      availability,
    }));
  }, { saved: preferences, availability: availableIds ? stockFixture(availableIds) : {} });
  await page.goto('/#/results');
}

async function savedPreferences(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('sc4025-drink-finder:v1') ?? '{}').preferences);
}

async function routeGeometry(page: Page) {
  await page.evaluate(async () => { await document.fonts.ready; });
  return main(page).evaluate(element => {
    const route = element.querySelector('.route-content');
    if (!(route instanceof HTMLElement)) throw new Error('Missing route content');
    const viewport = element.getBoundingClientRect();
    const content = route.getBoundingClientRect();
    return {
      mainHeight: viewport.height,
      routeHeight: content.height,
      topSpace: content.top - viewport.top,
      bottomSpace: viewport.bottom - content.bottom,
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    };
  });
}

async function expectCenteredRoute(page: Page) {
  const geometry = await routeGeometry(page);
  expect(geometry.routeHeight, 'This state should fit without scrolling').toBeLessThan(geometry.mainHeight);
  expect(geometry.topSpace).toBeGreaterThanOrEqual(0);
  expect(geometry.bottomSpace).toBeGreaterThanOrEqual(0);
  expect(Math.abs(geometry.topSpace - geometry.bottomSpace), 'Short route content should have equal space above and below').toBeLessThanOrEqual(1);
  expect(geometry.scrollTop).toBe(0);
}

async function expectTopAlignedLongRoute(page: Page) {
  const geometry = await routeGeometry(page);
  expect(geometry.routeHeight, 'This state should need its scrollable content area').toBeGreaterThan(geometry.mainHeight);
  expect(Math.abs(geometry.topSpace), 'Long content must start at the top, not above the scrollable viewport').toBeLessThanOrEqual(1);
  expect(geometry.scrollTop).toBe(0);
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
}

async function expectAdaptiveRoutePlacement(page: Page) {
  const geometry = await routeGeometry(page);
  if (geometry.routeHeight < geometry.mainHeight) {
    expect(geometry.topSpace).toBeGreaterThanOrEqual(0);
    expect(geometry.bottomSpace).toBeGreaterThanOrEqual(0);
    expect(Math.abs(geometry.topSpace - geometry.bottomSpace), 'Fitting content must remain centered').toBeLessThanOrEqual(1);
  } else {
    expect(Math.abs(geometry.topSpace), 'Overflowing content must remain top-aligned').toBeLessThanOrEqual(1);
    expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
  }
  expect(geometry.scrollTop).toBe(0);
}

async function observeViewTransitions(page: Page) {
  await page.addInitScript(() => {
    const probe = {
      supported: typeof document.startViewTransition === 'function',
      calls: 0,
      ready: 0,
      finished: 0,
      readyErrors: [] as string[],
      finishedErrors: [] as string[],
      unhandled: [] as string[],
      motion: [] as { name: string; pseudo: string; duration: number; transforms: string[] }[],
      snapshots: [] as { before: string[]; after: string[] }[],
    };
    Object.defineProperty(window, '__goalTransitions', { value: probe });
    addEventListener('unhandledrejection', event => probe.unhandled.push(String(event.reason)));
    if (!probe.supported) return;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = options => {
      const namedLabels = () => Array.from(document.querySelectorAll('*'))
        .map(element => getComputedStyle(element).viewTransitionName).filter(name => /^(goal|drink)-/.test(name));
      const snapshot = { before: namedLabels(), after: [] as string[] };
      probe.snapshots.push(snapshot);
      const transition = start(options);
      probe.calls++;
      transition.ready.then(() => {
        probe.ready++;
        snapshot.after = namedLabels();
        for (const animation of document.getAnimations()) {
          if (!(animation instanceof CSSAnimation) || !/(goal|drink)-/.test(animation.animationName) || !(animation.effect instanceof KeyframeEffect)) continue;
          probe.motion.push({
            name: animation.animationName,
            pseudo: String(Reflect.get(animation.effect, 'pseudoElement') ?? ''),
            duration: Number(animation.effect.getTiming().duration),
            transforms: animation.effect.getKeyframes().map(frame => String(frame.transform ?? '')),
          });
        }
      }, error => { probe.readyErrors.push(String(error)); });
      transition.finished.then(() => { probe.finished++; }, error => { probe.finishedErrors.push(String(error)); });
      return transition;
    };
  });
}

async function transitionState(page: Page) {
  return page.evaluate(() => Reflect.get(window, '__goalTransitions'));
}

async function expectCompletedTransitions(page: Page, calls: number) {
  await expect.poll(async () => (await transitionState(page)).finished).toBe(calls);
  const probe = await transitionState(page);
  expect(probe.calls).toBe(calls);
  expect(probe.ready).toBe(calls);
  expect(probe.readyErrors).toEqual([]);
  expect(probe.finishedErrors).toEqual([]);
  expect(probe.unhandled).toEqual([]);
}

test('menu search, categories and empty-search recovery use the same catalogue', async ({ page }) => {
  await page.goto('/');
  await expect(main(page).getByText(`${drinks.length} drinks`, { exact: true })).toBeVisible();
  await expect(main(page).locator('.product-row')).toHaveCount(drinks.length);
  await page.getByRole('searchbox', { name: 'Search drinks' }).fill('americano');
  await expect(main(page).getByText(`${drinks.filter(drink => drink.name.toLowerCase().includes('americano')).length} drinks`, { exact: true })).toBeVisible();
  await expect(main(page).getByRole('button', { name: /^Iced Americano/ })).toBeVisible();
  await expect(main(page).getByRole('button', { name: /^Caffè Americano/ })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search drinks' }).fill('');
  await page.getByRole('button', { name: 'Tea', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tea', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(main(page).getByText(`${teaCount} drinks`, { exact: true })).toBeVisible();
  await expect(main(page).locator('.product-row')).toHaveCount(teaCount);
  await expect(main(page).getByRole('button', { name: /^Caffè Americano/ })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search drinks' }).fill('unicorn');
  await expect(page.getByRole('heading', { name: 'No drinks found' })).toBeVisible();
  await page.getByRole('button', { name: 'Show all drinks', exact: true }).click();
  await expect(main(page).getByText(`${drinks.length} drinks`, { exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search drinks' })).toHaveValue('');
});

test('the custom search clear button supports click and keyboard without changing the category', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('searchbox', { name: 'Search drinks' });
  const tea = page.getByRole('button', { name: 'Tea', exact: true });
  const clear = page.getByRole('button', { name: 'Clear search', exact: true });
  await expect(clear).toHaveCount(0);
  await tea.click();
  await input.fill('unicorn');
  await expect(page.getByRole('heading', { name: 'No drinks found' })).toBeVisible();
  await expect(clear).toBeVisible();
  await expect(clear.locator('svg')).toHaveCount(1);
  const fieldBounds = await page.locator('.search-field').boundingBox();
  const clearBounds = await clear.boundingBox();
  expect(fieldBounds).not.toBeNull();
  expect(clearBounds).not.toBeNull();
  expect(Math.abs(clearBounds!.y + clearBounds!.height / 2 - fieldBounds!.y - fieldBounds!.height / 2), 'The custom X must align with the center of the search field').toBeLessThanOrEqual(1);
  await clear.click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(tea).toHaveAttribute('aria-pressed', 'true');
  await expect(main(page).getByText(`${teaCount} drinks`, { exact: true })).toBeVisible();
  await expect(clear).toHaveCount(0);
  await input.fill('matcha');
  await input.press('Tab');
  await expect(clear).toBeFocused();
  await clear.press('Enter');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(tea).toHaveAttribute('aria-pressed', 'true');
  await expect(main(page).getByText(`${teaCount} drinks`, { exact: true })).toBeVisible();
});

test.describe('milk metadata', () => {
  // These display/filter regressions are local. Block telemetry, model calls
  // and all external traffic even if runtime configuration changes.
  test.beforeEach(async ({ context, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin !== origin || url.pathname.startsWith('/api/')
        ? route.abort('blockedbyclient') : route.continue();
    });
  });

  test('no-milk recipes omit milk copy in search, details and size-edited cart lines', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Search drinks' }).fill('Iced Shaken Black Tea Lemonade');
    const product = main(page).getByRole('button', { name: /^Iced Shaken Black Tea Lemonade/ });
    await expect(product.locator('.product-meta')).toHaveText('Tall · 12 oz · Iced');
    await expect(product).not.toContainText('No milk listed');
    await product.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('milk-metadata-menu-375.png'), animations: 'disabled' });
    await product.click();
    await expect(main(page).getByRole('heading', { name: 'Iced Shaken Black Tea Lemonade', exact: true })).toBeVisible();
    await expect(main(page).locator('.recipe-line').filter({ hasText: 'Milk recipe' })).toHaveCount(0);
    await expect(main(page).locator('.recipe-line').filter({ hasText: 'Temperature' })).toContainText('Iced');
    await expect(main(page).locator('.recipe-line').filter({ hasText: 'Coffee ingredients' })).toContainText('None listed');
    await main(page).locator('.recipe-section').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('milk-metadata-details-375.png'), animations: 'disabled' });
    await main(page).getByRole('button', { name: 'Grande 16 oz', exact: true }).click();
    await page.getByRole('button', { name: 'Add to order · S$7.85', exact: true }).click();
    await page.getByRole('button', { name: 'View order, 1 items', exact: true }).click();
    const grande = page.locator('[data-cart-line="black-tea-lemonade:grande"]');
    await expect(grande.locator('.product-meta')).toHaveText('Grande · 16 oz · Iced');
    await expect(grande).not.toContainText('No milk listed');
    await grande.getByRole('button', { name: 'Edit Iced Shaken Black Tea Lemonade, Grande', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit size', exact: true });
    await editor.getByRole('button', { name: 'Venti 20 oz', exact: true }).click();
    await editor.getByRole('button', { name: 'Update order · S$8.60', exact: true }).click();
    await expect(editor).toHaveCount(0);
    const venti = page.locator('[data-cart-line="black-tea-lemonade:venti"]');
    await expect(venti.locator('.product-meta')).toHaveText('Venti · 20 oz · Iced');
    await page.reload();
    await expect(venti.locator('.product-meta')).toHaveText('Venti · 20 oz · Iced');
    await expect(venti).not.toContainText('No milk listed');
    await page.screenshot({ path: testInfo.outputPath('milk-metadata-cart-375.png'), animations: 'disabled' });
  });

  test('omitting milk metadata preserves the strict no-milk preference and results', async ({ page }) => {
    await limitStock(page, ['black-tea-lemonade', 'strawberry-acai-lemonade', 'iced-matcha-latte']);
    await startFinder(page, 'Something refreshing');
    const noMilk = group(page, 'Milk in the recipe').getByRole('button', { name: 'No milk listed', exact: true });
    await expect(noMilk).toBeEnabled();
    await noMilk.click();
    await expect(noMilk).toHaveAttribute('aria-pressed', 'true');
    await showPicks(page);
    await expect(picks(page)).toHaveCount(2);
    await expect(picks(page).getByRole('heading', { name: 'Iced Matcha Latte', exact: true })).toHaveCount(0);
    for (const card of await picks(page).all()) {
      await expect(card.locator('.product-meta')).toHaveText('Tall · 12 oz · Iced');
      const name = await card.locator('.drink-title').textContent();
      expect(drinks.find(drink => drink.name === name)?.milk).toBe('none');
    }
    expect((await savedPreferences(page)).milk).toBe('none');
    await page.getByRole('button', { name: 'Edit my preferences', exact: true }).click();
    await expect(noMilk).toHaveAttribute('aria-pressed', 'true');
  });

  for (const fixture of [
    { id: 'iced-latte', name: 'Iced Caffè Latte', milk: 'dairy', label: 'Dairy milk', temperature: 'Iced' },
    { id: 'oat-latte', name: 'Oatmilk Latte', milk: 'oat', label: 'Oatmilk', temperature: 'Hot' },
  ]) {
    test(`${fixture.label} remains visible in menu, details, cart and results`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await limitStock(page, [fixture.id]);
      await page.goto('/');
      await page.getByRole('searchbox', { name: 'Search drinks' }).fill(fixture.name);
      const product = main(page).getByRole('button', { name: new RegExp(`^${fixture.name}`) });
      const metadata = `Tall · 12 oz · ${fixture.temperature} · ${fixture.label}`;
      await expect(product.locator('.product-meta')).toHaveText(metadata);
      await product.click();
      await expect(main(page).locator('.recipe-line').filter({ hasText: 'Milk recipe' })).toContainText(fixture.label);
      await page.locator('.detail-cta button').click();
      await page.getByRole('button', { name: 'View order, 1 items', exact: true }).click();
      await expect(page.locator(`[data-cart-line="${fixture.id}:tall"] .product-meta`)).toHaveText(metadata);
      await page.getByRole('button', { name: 'Add another drink', exact: true }).click();
      await page.locator('.finder-banner').getByRole('button', { name: 'Try it now', exact: true }).click();
      await page.getByRole('button', { name: /^A coffee boost/ }).click();
      await group(page, 'Milk in the recipe').getByRole('button', { name: fixture.label, exact: true }).click();
      await showPicks(page);
      await expect(picks(page)).toHaveCount(1);
      await expect(picks(page).locator('.product-meta')).toHaveText(metadata);
      expect((await savedPreferences(page)).milk).toBe(fixture.milk);
    });
  }
});

test('goal chooser uses unselected navigation cards while preserving saved answers', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startFinder(page, 'A coffee boost');
  await group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true }).click();
  await group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true }).click();
  await group(page, 'Sweetness').getByRole('button', { name: 'Less sweet', exact: true }).click();
  const saved = { goal: 'coffee', temperature: 'iced', avoidCoffee: false, sweetness: 'less', milk: 'dairy', budgetCents: null };
  expect(await savedPreferences(page)).toEqual(saved);
  await page.getByRole('button', { name: 'Change goal', exact: true }).click();
  await expect(page).toHaveURL(/#\/goal$/);
  expect(await savedPreferences(page)).toEqual(saved);
  await expect(main(page).locator('.goal-card')).toHaveCount(4);
  await expect(main(page).locator('.goal-selected')).toHaveCount(0);
  await expect(main(page).locator('.goal-check .lucide-check, .goal-check [data-icon="check"]')).toHaveCount(0);
  for (const card of await main(page).locator('.goal-card').all()) {
    await expect(card).not.toHaveAttribute('aria-pressed');
    await expect(card.locator('[data-icon="chevron"]')).toHaveCount(1);
  }
  await page.reload();
  expect(await savedPreferences(page)).toEqual(saved);
  await expect(main(page).locator('.goal-selected, .goal-card[aria-pressed], .goal-check .lucide-check, .goal-check [data-icon="check"]')).toHaveCount(0);
  await page.getByRole('button', { name: /^A coffee boost/ }).click();
  await expect(page).toHaveURL(/#\/preferences$/);
  await expect(page.locator('.goal-banner')).toContainText('A coffee boost');
  expect(await savedPreferences(page)).toEqual(saved);
  await expect(group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

for (const width of [320, 375]) {
  test(`finder banner matches the reference's centered copy and inset artwork at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/');
    await page.evaluate(async () => { await document.fonts.ready; });
    const banner = page.locator('.finder-banner');
    const art = banner.locator('.banner-drink');
    const headline = banner.getByRole('heading', { level: 2 });
    const subtext = banner.locator('p');
    const action = banner.getByRole('button', { name: 'Try it now', exact: true });
    await expect(headline).toHaveText('Find My Drink');
    await expect(headline.locator('br')).toHaveCount(0);
    await expect(subtext).toHaveText("We'll help you find your perfect drink");
    await expect(subtext).toBeVisible();
    await expect.poll(() => art.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
    const region = await banner.boundingBox();
    const picture = await art.boundingBox();
    const title = await headline.boundingBox();
    const support = await subtext.boundingBox();
    const button = await action.boundingBox();
    expect(region).not.toBeNull();
    expect(picture).not.toBeNull();
    expect(title).not.toBeNull();
    expect(support).not.toBeNull();
    expect(button).not.toBeNull();
    const centerX = region!.x + region!.width / 2;
    const centerY = region!.y + region!.height / 2;
    expect(region!.height, 'The short supporting line must fit inside the standard hero height').toBe(188);
    expect(picture!.x + picture!.width / 2, 'The artwork must occupy the left side').toBeLessThan(centerX);
    expect(title!.x + title!.width / 2, 'The headline must occupy the right text block').toBeGreaterThan(centerX);
    expect(button!.x + button!.width / 2, 'The action must align on the right').toBeGreaterThan(centerX);
    expect(button!.y + button!.height / 2, 'The action must occupy the lower half').toBeGreaterThan(centerY);
    expect(title!.height, 'The headline must remain one line').toBeLessThan(30);
    expect(Math.abs(support!.y - title!.y - title!.height - 6), 'The lifted subtext must stay clearly separated from the heading').toBeLessThanOrEqual(1);
    expect(Math.abs(button!.y - support!.y - support!.height - 16), 'The subtext lift must add clearance above the unchanged button').toBeLessThanOrEqual(1);
    const copyAxis = region!.x + region!.width * .75 - 8;
    for (const [name, bounds] of [['headline', title!], ['subtext', support!], ['action', button!]] as const) {
      expect(Math.abs(bounds.x + bounds.width / 2 - copyAxis), `The ${name} must share the optically inset center`).toBeLessThanOrEqual(1);
    }
    const bodyLines = await subtext.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return Array.from(range.getClientRects(), bounds => bounds.x + bounds.width / 2);
    });
    expect(bodyLines).toHaveLength(2);
    for (const center of bodyLines) expect(Math.abs(center - copyAxis), 'Each visible body line must be centered, not just its container').toBeLessThanOrEqual(1);
    for (const [name, text] of [['headline', title!], ['subtext', support!], ['action', button!]] as const) {
      const overlapX = Math.min(picture!.x + picture!.width, text.x + text.width) - Math.max(picture!.x, text.x);
      const overlapY = Math.min(picture!.y + picture!.height, text.y + text.height) - Math.max(picture!.y, text.y);
      expect(overlapX <= 1 || overlapY <= 1, `The ${name} must not overlap the artwork`).toBe(true);
    }
    const topInset = title!.y - region!.y;
    const bottomInset = region!.y + region!.height - button!.y - button!.height;
    expect(Math.abs(topInset - bottomInset), 'The reference-style copy stack must be vertically centered').toBeLessThanOrEqual(1);
    expect(picture!.x - region!.x, 'The leaves must sit inside the banner rather than bleed outside it').toBe(4);
    expect(button!.width).toBeGreaterThanOrEqual(44);
    expect(button!.height).toBeGreaterThanOrEqual(44);
    expect(region!.x + region!.width - title!.x - title!.width, 'The heading needs breathing room at the right border').toBeGreaterThanOrEqual(12);
    expect(picture!.width).toBe(width === 320 ? 136 : 164);
    expect(picture!.y - region!.y).toBe(width === 320 ? 8 : 6);
    expect(await art.evaluate(image => getComputedStyle(image).borderRadius), 'The botanical cluster must retain its transparent outline, not a circular crop').toBe('0px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: join(testInfo.project.outputDir, `banner-${width}.png`), fullPage: true, animations: 'disabled' });
  });
}

test('finder requirements, details, cart quantity and same-tab refresh stay consistent', async ({ page }) => {
  await limitStock(page, ['iced-americano']);
  await startFinder(page, 'A coffee boost');
  await group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true }).click();
  await group(page, 'Milk in the recipe').getByRole('button', { name: 'No milk listed', exact: true }).click();
  await group(page, 'Sweetness').getByRole('button', { name: 'Less sweet', exact: true }).click();
  await showPicks(page);
  await expect(picks(page)).toHaveCount(1);
  await expect(picks(page).getByRole('heading', { name: 'Iced Americano', exact: true })).toBeVisible();
  await expect(picks(page)).not.toContainText('Within your');
  expect((await savedPreferences(page)).budgetCents).toBeNull();
  await picks(page).getByRole('button', { name: 'See drink', exact: true }).click();
  await expect(main(page).getByRole('heading', { name: 'Iced Americano', exact: true })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Tall 12 oz', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(main(page).getByText('S$6.20', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add to order · S$6.20', exact: true }).click();
  await page.getByRole('button', { name: 'View order, 1 items', exact: true }).click();
  await expect(main(page).getByRole('article')).toContainText('Iced Americano');
  await page.getByRole('button', { name: 'Add one Iced Americano, Tall', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View order, 2 items', exact: true })).toBeVisible();
  await expect(main(page).getByText('S$12.40', { exact: true })).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your drink order.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View order, 2 items', exact: true })).toBeVisible();
  await main(page).getByRole('button', { name: /^Iced Americano/ }).click();
  await expect(main(page).getByRole('heading', { name: 'Iced Americano', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your drink order.' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove one Iced Americano, Tall', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View order, 1 items', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add another drink', exact: true }).click();
  await page.locator('.finder-banner').getByRole('button', { name: 'Try it now', exact: true }).click();
  await expect(page.getByRole('button', { name: /^A coffee boost/ })).not.toHaveAttribute('aria-pressed');
  await page.getByRole('button', { name: /^A coffee boost/ }).click();
  await expect(group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(group(page, 'Budget per drink')).toHaveCount(0);
  expect((await savedPreferences(page)).budgetCents).toBeNull();
});

test('no-match recovery preserves strict choices and lets users change one requirement', async ({ page }) => {
  await restoreSavedPreferences(page, { goal: 'refreshing', temperature: 'hot', avoidCoffee: true, milk: 'dairy' }, ['pistachio-oat-matcha']);
  await expect(page.getByRole('heading', { name: 'No drink fits just yet.' })).toBeVisible();
  await expect(picks(page)).toHaveCount(0);
  await main(page).getByRole('button', { name: 'Edit my preferences', exact: true }).first().click();
  await expect(group(page, 'Hot or iced?')).toHaveCount(0);
  expect((await savedPreferences(page)).temperature).toBe('iced');
  await expect(group(page, 'Coffee ingredients').getByRole('button', { name: 'No coffee', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await group(page, 'Milk in the recipe').getByRole('button', { name: 'No preference', exact: true }).click();
  await showPicks(page);
  await expect(picks(page)).toHaveCount(1);
  await expect(picks(page).getByRole('heading', { name: 'Iced Pistachio Oatmilk Matcha Latte', exact: true })).toBeVisible();
});

test('two qualifying recipes produce two cards without filler recommendations', async ({ page }) => {
  await limitStock(page, ['chamomile-tea', 'hot-chocolate']);
  await startFinder(page, 'Warm and comforting');
  await expect(group(page, 'Hot or iced?')).toHaveCount(0);
  expect((await savedPreferences(page)).temperature).toBe('hot');
  await group(page, 'Coffee ingredients').getByRole('button', { name: 'No coffee', exact: true }).click();
  await showPicks(page);
  await expect(picks(page)).toHaveCount(2);
  await expect(picks(page).getByRole('heading', { name: 'Chamomile Tea', exact: true })).toBeVisible();
  await expect(picks(page).getByRole('heading', { name: 'Signature Hot Chocolate', exact: true })).toBeVisible();
});

test('goal alternatives stay explicit and respect the selected recipe filters', async ({ page }) => {
  await restoreSavedPreferences(page, { goal: 'coffee', temperature: 'iced', milk: 'none' }, ['black-tea-lemonade', 'strawberry-acai-lemonade', 'iced-matcha-latte']);
  await expect(picks(page)).toHaveCount(2);
  await expect(main(page).getByText('None fits your goal with these requirements.', { exact: false })).toBeVisible();
  await expect(picks(page).getByText('An alternative', { exact: true })).toHaveCount(2);
  await expect(picks(page).getByRole('heading', { name: 'Iced Matcha Latte', exact: true })).toHaveCount(0);
  for (const card of await picks(page).all()) {
    await expect(card.locator('.product-meta')).toHaveText('Tall · 12 oz · Iced');
  }
});

for (const goal of ['Something refreshing', 'A coffee boost', 'Warm and comforting']) {
  test(`goal-aware preferences keep each available choice compatible with ${goal}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    if (goal === 'A coffee boost') await limitStock(page, ['iced-latte', 'oat-latte']);
    await startFinder(page, goal);
    const coffeeGoal = goal === 'A coffee boost';
    await expect(group(page, 'Coffee ingredients')).toHaveCount(coffeeGoal ? 0 : 1);
    await expect(group(page, 'Hot or iced?')).toHaveCount(coffeeGoal ? 1 : 0);
    await expect(group(page, 'Budget per drink')).toHaveCount(0);
    await expect(main(page).locator('.preference-group')).toHaveCount(3);
    await expect(main(page).locator('.preference-group legend svg')).toHaveCount(3);
    await expect(main(page).locator('.preference-group p, .helper-copy')).toHaveCount(0);
    await expect(page.locator('.header-subtitle')).toHaveCount(0);
    await expect(page.getByText('All optional', { exact: true })).toHaveCount(0);
    expect((await savedPreferences(page)).temperature).toBe(coffeeGoal ? null : goal === 'Something refreshing' ? 'iced' : 'hot');
    for (const legend of await main(page).locator('.preference-group legend').all()) {
      await expect(legend.locator('svg')).toHaveCount(1);
    }
    const preferenceGroups = [
      ...(coffeeGoal ? [{ name: 'Hot or iced?', neutral: 'Either' }] : []),
      ...(!coffeeGoal ? [{ name: 'Coffee ingredients', neutral: 'No preference' }] : []),
      { name: 'Sweetness', neutral: 'No preference' },
      { name: 'Milk in the recipe', neutral: 'No preference' },
    ];
    for (const preferenceGroup of preferenceGroups) {
      const labels = await group(page, preferenceGroup.name).getByRole('button').allTextContents();
      for (const label of labels) {
        await page.getByRole('button', { name: 'Clear optional preferences', exact: true }).click();
        await expect(group(page, preferenceGroup.name).getByRole('button', { name: preferenceGroup.neutral, exact: true })).toBeEnabled();
        const option = group(page, preferenceGroup.name).getByRole('button', { name: label.trim(), exact: true });
        if (await option.isDisabled()) continue;
        await option.click();
        await showPicks(page);
        expect(await picks(page).count()).toBeGreaterThan(0);
        await expect(picks(page).first().getByText('Your top pick', { exact: true })).toBeVisible();
        await expect(main(page).getByText('None fits your goal with these requirements.', { exact: false })).toHaveCount(0);
        if (preferenceGroup.name === 'Coffee ingredients' && label.trim() === 'No coffee') {
          for (const card of await picks(page).all()) {
            await expect(card).toContainText('No coffee listed in the described recipe.');
            const name = await card.locator('.drink-title').textContent();
            expect(drinks.find(drink => drink.name === name)?.containsCoffee).toBe(false);
          }
        }
        const saved = await savedPreferences(page);
        expect(saved.budgetCents).toBeNull();
        if (!coffeeGoal) expect(saved.temperature).toBe(goal === 'Something refreshing' ? 'iced' : 'hot');
        await page.getByRole('button', { name: 'Edit my preferences', exact: true }).click();
      }
    }
    if (coffeeGoal) {
      await page.getByRole('button', { name: 'Clear optional preferences', exact: true }).click();
      await group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true }).click();
      await expect(group(page, 'Milk in the recipe').getByRole('button', { name: 'Oatmilk', exact: true })).toBeDisabled();
      await expect(group(page, 'Hot or iced?').getByRole('button', { name: 'Either', exact: true })).toBeEnabled();
      await group(page, 'Hot or iced?').getByRole('button', { name: 'Either', exact: true }).click();
      await expect(group(page, 'Milk in the recipe').getByRole('button', { name: 'Oatmilk', exact: true })).toBeEnabled();
      await group(page, 'Milk in the recipe').getByRole('button', { name: 'Oatmilk', exact: true }).click();
      await expect(group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true })).toBeDisabled();
      await expect(group(page, 'Milk in the recipe').getByRole('button', { name: 'No preference', exact: true })).toBeEnabled();
      await group(page, 'Milk in the recipe').getByRole('button', { name: 'No preference', exact: true }).click();
      await expect(group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true })).toBeEnabled();
      await expect(group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true })).toBeEnabled();
    }
  });
}

test('restored coffee goals remove legacy budget and no-coffee while preserving explicit temperature', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await restoreSavedPreferences(page, { goal: 'coffee', temperature: 'iced', avoidCoffee: true, sweetness: 'less', milk: 'dairy', budgetCents: 650 }, ['iced-latte']);
  await expect(picks(page)).toHaveCount(1);
  await expect(picks(page).getByRole('heading', { name: 'Iced Caffè Latte', exact: true })).toBeVisible();
  expect(await savedPreferences(page)).toEqual({ goal: 'coffee', temperature: 'iced', avoidCoffee: false, sweetness: 'less', milk: 'dairy', budgetCents: null });
  await expect(picks(page)).not.toContainText('Within your');
  await page.getByRole('button', { name: 'Edit my preferences', exact: true }).click();
  await expect(group(page, 'Coffee ingredients')).toHaveCount(0);
  await expect(group(page, 'Budget per drink')).toHaveCount(0);
  await expect(group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

for (const goal of [
  { id: 'refreshing', previousTemperature: 'hot', temperature: 'iced', label: 'Something refreshing' },
  { id: 'comfort', previousTemperature: 'iced', temperature: 'hot', label: 'Warm and comforting' },
]) {
  test(`legacy hidden budget and opposite temperature migrate for ${goal.id}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await restoreSavedPreferences(page, {
      goal: goal.id, temperature: goal.previousTemperature, avoidCoffee: true,
      sweetness: 'less', milk: 'dairy', budgetCents: 650,
    });
    const expected = drinks.filter(drink => drink.goals.some(tag => tag === goal.id) && drink.temperature === goal.temperature && drink.containsCoffee === false && drink.milk === 'dairy');
    await expect(picks(page)).toHaveCount(Math.min(3, expected.length));
    const saved = { goal: goal.id, temperature: goal.temperature, avoidCoffee: true, sweetness: 'less', milk: 'dairy', budgetCents: null };
    expect(await savedPreferences(page)).toEqual(saved);
    for (const card of await picks(page).all()) {
      const name = await card.locator('.drink-title').textContent();
      const drink = drinks.find(recipe => recipe.name === name);
      expect(drink).toBeDefined();
      expect(drink!.temperature).toBe(goal.temperature);
      expect(drink!.containsCoffee).toBe(false);
      expect(drink!.milk).toBe('dairy');
      expect(drink!.priceCents).toBeGreaterThan(650);
      await expect(card).not.toContainText('Within your');
    }
    await page.getByRole('button', { name: 'Edit my preferences', exact: true }).click();
    await expect(page.locator('.goal-banner')).toContainText(goal.label);
    await expect(group(page, 'Hot or iced?')).toHaveCount(0);
    await expect(group(page, 'Budget per drink')).toHaveCount(0);
    await expect(group(page, 'Coffee ingredients').getByRole('button', { name: 'No coffee', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    expect(await savedPreferences(page)).toEqual(saved);
    await page.getByRole('button', { name: 'Clear optional preferences', exact: true }).click();
    expect(await savedPreferences(page)).toEqual({ goal: goal.id, temperature: goal.temperature, avoidCoffee: false, sweetness: 'any', milk: null, budgetCents: null });
    await showPicks(page);
    await expect(picks(page).first().getByText('Your top pick', { exact: true })).toBeVisible();
  });
}

test('the preference availability notice follows the controls without helper paragraphs', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await limitStock(page, ['iced-latte', 'oat-latte']);
  await startFinder(page, 'A coffee boost');
  await group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true }).click();
  const blocked = group(page, 'Milk in the recipe').getByRole('button', { name: 'Oatmilk', exact: true });
  await expect(blocked).toBeDisabled();
  await expect(blocked).toHaveAttribute('aria-describedby', 'preference-availability-help');
  const notice = page.locator('#preference-availability-help');
  await expect(notice).toHaveText('Unavailable options have no matching drinks.');
  await expect(main(page).locator('.preference-group p, .helper-copy')).toHaveCount(0);
  await expect(page.locator('.header-subtitle')).toHaveCount(0);
  const order = await notice.evaluate(element => {
    const lastGroup = Array.from(document.querySelectorAll('.preference-group')).at(-1);
    const clear = document.querySelector('.preferences-page .flow-actions');
    if (!lastGroup || !clear) throw new Error('Missing preference controls');
    return {
      groupsBeforeClear: Boolean(lastGroup.compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING),
      clearBeforeNotice: Boolean(clear.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  expect(order).toEqual({ groupsBeforeClear: true, clearBeforeNotice: true });
  await notice.scrollIntoViewIfNeeded();
  await expect(notice).toBeVisible();
  const clearBounds = await page.getByRole('button', { name: 'Clear optional preferences', exact: true }).boundingBox();
  const noticeBounds = await notice.boundingBox();
  expect(clearBounds).not.toBeNull();
  expect(noticeBounds).not.toBeNull();
  expect(noticeBounds!.y).toBeGreaterThanOrEqual(clearBounds!.y + clearBounds!.height);
  await page.getByRole('button', { name: 'Clear optional preferences', exact: true }).click();
  await expect(blocked).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Show my drink picks', exact: true })).toBeVisible();
});

test('changing goals resets inferred temperature but retains explicit coffee choices and other answers', async ({ page }) => {
  await limitStock(page, legacyRecipeIds);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startFinder(page);
  await group(page, 'Coffee ingredients').getByRole('button', { name: 'No coffee', exact: true }).click();
  await group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true }).click();
  await group(page, 'Sweetness').getByRole('button', { name: 'Sweeter', exact: true }).click();
  expect((await savedPreferences(page)).temperature).toBe('iced');
  await page.getByRole('button', { name: 'Change goal', exact: true }).click();
  await page.getByRole('button', { name: /^A coffee boost/ }).click();
  await expect(group(page, 'Coffee ingredients')).toHaveCount(0);
  expect(await savedPreferences(page)).toEqual({ goal: 'coffee', temperature: null, avoidCoffee: false, sweetness: 'more', milk: 'dairy', budgetCents: null });
  await expect(group(page, 'Hot or iced?').getByRole('button', { name: 'Either', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true }).click();
  await page.getByRole('button', { name: 'Change goal', exact: true }).click();
  await page.getByRole('button', { name: /^A coffee boost/ }).click();
  await expect(group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect((await savedPreferences(page)).temperature).toBe('iced');
  await page.getByRole('button', { name: 'Change goal', exact: true }).click();
  await page.getByRole('button', { name: /^Warm and comforting/ }).click();
  await expect(group(page, 'Coffee ingredients')).toHaveCount(1);
  await expect(group(page, 'Hot or iced?')).toHaveCount(0);
  expect(await savedPreferences(page)).toEqual({ goal: 'comfort', temperature: 'hot', avoidCoffee: false, sweetness: 'more', milk: 'dairy', budgetCents: null });
  await showPicks(page);
  await expect(picks(page).first().getByText('Your top pick', { exact: true })).toBeVisible();
  await expect(picks(page).first().getByRole('heading', { name: 'Signature Hot Chocolate', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Change goal', exact: true }).click();
  await page.getByRole('button', { name: /^A coffee boost/ }).click();
  expect(await savedPreferences(page)).toEqual({ goal: 'coffee', temperature: null, avoidCoffee: false, sweetness: 'more', milk: 'dairy', budgetCents: null });
  await expect(group(page, 'Hot or iced?').getByRole('button', { name: 'Either', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('no simulated stock gives an honest empty state and restoring stock recovers the finder', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await openSettings(page);
  for (const checkbox of await page.getByRole('dialog').getByRole('checkbox').all()) await checkbox.uncheck();
  await page.keyboard.press('Escape');
  await startFinder(page);
  await expect(group(page, 'Hot or iced?')).toHaveCount(0);
  await expect(group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true })).toBeDisabled();
  await expect(group(page, 'Milk in the recipe').getByRole('button', { name: 'No preference', exact: true })).toBeEnabled();
  await expect(group(page, 'Coffee ingredients').getByRole('button', { name: 'No preference', exact: true })).toBeEnabled();
  await expect(group(page, 'Coffee ingredients').getByRole('button', { name: 'No coffee', exact: true })).toBeDisabled();
  await expect(group(page, 'Sweetness').getByRole('button', { name: 'Sweeter', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Clear optional preferences', exact: true })).toBeEnabled();
  await showPicks(page);
  await expect(page.getByRole('heading', { name: 'No drink fits just yet.' })).toBeVisible();
  await expect(picks(page)).toHaveCount(0);
  await openSettings(page);
  await page.getByRole('dialog').getByRole('checkbox', { name: 'Iced Shaken Black Tea Lemonade', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(picks(page)).toHaveCount(1);
  await expect(picks(page).getByRole('heading', { name: 'Iced Shaken Black Tea Lemonade', exact: true })).toBeVisible();
  await expect(picks(page).getByText('Your top pick', { exact: true })).toBeVisible();
});

test('editing temperature preserves the other answers and recomputes the recipe', async ({ page }) => {
  await limitStock(page, ['iced-latte', 'latte']);
  await startFinder(page, 'A coffee boost');
  await group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true }).click();
  await group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true }).click();
  await group(page, 'Sweetness').getByRole('button', { name: 'Less sweet', exact: true }).click();
  await showPicks(page);
  await expect(picks(page).getByRole('heading', { name: 'Iced Caffè Latte', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit my preferences', exact: true }).click();
  await group(page, 'Hot or iced?').getByRole('button', { name: 'Hot', exact: true }).click();
  await expect(group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(group(page, 'Sweetness').getByRole('button', { name: 'Less sweet', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(group(page, 'Budget per drink')).toHaveCount(0);
  expect((await savedPreferences(page)).budgetCents).toBeNull();
  await showPicks(page);
  await expect(picks(page)).toHaveCount(1);
  await expect(picks(page).getByRole('heading', { name: 'Caffè Latte', exact: true })).toBeVisible();
  await expect(picks(page).getByText('Tall · 12 oz · Hot · Dairy milk', { exact: true })).toBeVisible();
});

test('availability changes after selection disable adding and survive refresh', async ({ page }) => {
  await page.goto('/');
  await main(page).getByRole('button', { name: /^Iced Americano/ }).click();
  await page.getByRole('button', { name: /^Add to order/ }).click();
  await openSettings(page);
  await page.getByRole('dialog').getByRole('checkbox', { name: 'Iced Americano', exact: true }).uncheck();
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Currently unavailable', exact: true })).toBeDisabled();
  await expect(main(page).getByText('This recipe is unavailable in the current demo stock.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Currently unavailable', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'View order, 1 items', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add one Iced Americano, Tall', exact: true })).toBeDisabled();
  await expect(main(page).getByText('No longer available. Remove this drink or choose another.')).toBeVisible();
  await page.getByRole('button', { name: 'Remove one Iced Americano, Tall', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your order is empty.' })).toBeVisible();
});

test('reset clears the cart, finder answers and stock changes', async ({ page }) => {
  await startFinder(page, 'Warm and comforting');
  expect((await savedPreferences(page)).temperature).toBe('hot');
  await showPicks(page);
  await picks(page).first().getByRole('button', { name: 'See drink', exact: true }).click();
  await page.getByRole('button', { name: /^Add to order/ }).click();
  await openSettings(page);
  await page.getByRole('dialog').getByRole('checkbox', { name: 'Iced Americano', exact: true }).uncheck();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View order, 0 items', exact: true })).toBeVisible();
  await openSettings(page);
  await expect(page.getByRole('dialog').getByRole('checkbox', { name: 'Iced Americano', exact: true })).toBeChecked();
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.locator('.finder-banner').getByRole('button', { name: 'Try it now', exact: true }).click();
  for (const goal of ['Something refreshing', 'A coffee boost', 'Warm and comforting']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${goal}`) })).not.toHaveAttribute('aria-pressed');
  }
  expect((await savedPreferences(page)).goal).toBeNull();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
});

test('settings dialog traps keyboard focus, closes on Escape and restores its opener', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Demo settings', exact: true });
  await opener.focus();
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Demo settings' });
  const close = dialog.getByRole('button', { name: 'Close dialog', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Reset demo', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('missing product photographs have an accessible fallback and retain the ordering flow', async ({ page }) => {
  await page.route('**/images/iced-americano*.webp', route => route.abort());
  await page.goto('/');
  await expect(main(page).getByRole('img', { name: 'Iced Americano, image unavailable', exact: true })).toBeVisible();
  await main(page).getByRole('button', { name: /^Iced Americano/ }).click();
  await expect(main(page).getByRole('img', { name: 'Iced Americano, image unavailable', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Add to order/ }).click();
  await expect(page.getByRole('button', { name: 'View order, 1 items', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await main(page).getByRole('button', { name: /^Caffè Latte/ }).click();
  const healthyImage = main(page).getByRole('img', { name: 'Caffè Latte', exact: true });
  await expect(healthyImage).toBeVisible();
  await expect.poll(() => healthyImage.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(main(page).getByRole('img', { name: 'Caffè Latte, image unavailable', exact: true })).toHaveCount(0);
});

test('blocked session storage keeps the current ordering flow usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new DOMException('Test blocked storage', 'SecurityError'); },
    });
  });
  await page.goto('/');
  await main(page).getByRole('button', { name: /^Iced Americano/ }).click();
  await page.getByRole('button', { name: /^Add to order/ }).click();
  await expect(page.getByRole('button', { name: 'View order, 1 items', exact: true })).toBeVisible();
  await openSettings(page);
  await expect(page.getByRole('dialog')).toContainText('Browser storage is blocked.');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByRole('button', { name: 'View order, 0 items', exact: true })).toBeVisible();
});

test('a missing drink URL recovers to the menu without a runtime error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#/drink/missing');
  await expect(page.getByRole('heading', { name: 'Drink not found' })).toBeVisible();
  await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
  await expect(main(page).getByText(`${drinks.length} drinks`, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the menu and finder use only local runtime assets', async ({ page, baseURL }) => {
  const localOrigin = new URL(baseURL!).origin;
  const externalRequests: string[] = [];
  const localAssets: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.origin !== localOrigin) externalRequests.push(request.url());
    else if (request.resourceType() === 'script' || request.resourceType() === 'image') {
      localAssets.push(request.url());
    }
  });
  await startFinder(page);
  await showPicks(page);
  await expect(picks(page)).toHaveCount(3);
  expect(localAssets.length, 'The assertion must observe the app assets').toBeGreaterThan(0);
  expect(externalRequests, 'No analytics, CDN, remote images or fonts should load at runtime').toEqual([]);
});

test('the expanded catalogue exposes every recipe with a working local photograph', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  expect(drinks.length).toBeGreaterThanOrEqual(24);
  const rows = main(page).locator('.product-row');
  await expect(rows).toHaveCount(drinks.length);
  expect(await rows.locator('.drink-title').allTextContents()).toEqual(drinks.map(drink => drink.name));
  for (const drink of drinks) {
    const photo = main(page).locator(`[data-drink-image="${drink.id}"]`);
    await main(page).locator(`[data-drink-frame="${drink.id}"]`).scrollIntoViewIfNeeded();
    await expect.poll(() => photo.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
      { message: `${drink.name} must load its prepared local photograph` }).toBe(true);
  }
  await expectPhotoFraming(page, 'iced-americano');
  for (const category of [
    { name: 'Coffee', key: 'coffee' }, { name: 'Tea', key: 'tea' },
    { name: 'Refreshers', key: 'refreshers' }, { name: 'Chocolate', key: 'chocolate' },
    { name: 'Frappuccino', key: 'blended' },
  ]) {
    await page.getByRole('button', { name: category.name, exact: true }).click();
    const expected = drinks.filter(drink => drink.category === category.key);
    await expect(rows).toHaveCount(expected.length);
    expect(await rows.locator('.drink-title').allTextContents()).toEqual(expected.map(drink => drink.name));
  }
  await main(page).evaluate(element => { element.scrollTop = 0; });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({ path: join(testInfo.project.outputDir, 'design-375-frappuccino.png'), fullPage: true, animations: 'disabled' });
  const cutout = main(page).locator('[data-drink-image="chocolate-chip-creme-frappuccino"]');
  await expectPhotoFraming(page, 'chocolate-chip-creme-frappuccino');
  await main(page).getByRole('button', { name: /^Chocolate Chip Crème Frappuccino/ }).click();
  await expect(main(page).getByRole('heading', { name: 'Chocolate Chip Crème Frappuccino', exact: true })).toBeVisible();
  await waitForNativeMotion(page);
  await expectPhotoFraming(page, 'chocolate-chip-creme-frappuccino');
  await expect.poll(() => cutout.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: join(testInfo.project.outputDir, 'design-375-frappuccino-detail.png'), fullPage: true, animations: 'disabled' });
});

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
  { width: 844, height: 390 },
]) {
  test(`complete flow remains usable at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('searchbox', { name: 'Search drinks' })).toBeVisible();
    const frame = await page.locator('.device').evaluate(element => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: box.x,
        width: box.width,
        borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
      };
    });
    if (viewport.width >= 600) {
      expect(frame.width, 'The desktop frame must retain its phone-sized width').toBeLessThanOrEqual(430);
      expect(Math.abs(frame.x + frame.width / 2 - viewport.width / 2), 'The phone frame must be horizontally centered').toBeLessThanOrEqual(1);
      if (viewport.width === 1440) {
        const screenBounds = await page.locator('.device-screen').boundingBox();
        expect(screenBounds).not.toBeNull();
        expect(screenBounds!.width).toBe(393);
        expect(screenBounds!.height).toBe(852);
      }
    } else {
      expect(frame.width, 'On phones the app must fill the available width').toBe(viewport.width);
      expect(frame.x).toBe(0);
      expect(frame.borders).toEqual(['0px', '0px', '0px', '0px']);
      expect(frame.radii).toEqual(['0px', '0px', '0px', '0px']);
      await expect(page.locator('.device-screen')).toHaveCSS('border-radius', '0px');
    }
    if (viewport.width === 390 || viewport.width === 1440) {
      await page.screenshot({ path: testInfo.outputPath(`${viewport.width}-menu.png`), fullPage: true });
    }
    await page.locator('.finder-banner').getByRole('button', { name: 'Try it now', exact: true }).click();
    await page.getByRole('button', { name: /^Something refreshing/ }).click();
    await expect(page.getByRole('heading', { name: 'Preferences', level: 1, exact: true })).toBeVisible();
    await group(page, 'Coffee ingredients').getByRole('button', { name: 'No coffee', exact: true }).click();
    await showPicks(page);
    await expect(picks(page)).toHaveCount(3);
    if (viewport.width === 390 || viewport.width === 1440) {
      await waitForNativeMotion(page);
      await page.screenshot({ path: testInfo.outputPath(`${viewport.width}-results.png`), fullPage: true });
    }
    await picks(page).first().getByRole('button', { name: 'See drink', exact: true }).click();
    const contentBox = await main(page).boundingBox();
    expect(contentBox, 'Details content must have a visible scrollable area').not.toBeNull();
    expect(contentBox!.height, 'Fixed chrome must leave room for drink details').toBeGreaterThanOrEqual(44);
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(horizontalOverflow, 'The page must not require horizontal scrolling').toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: /^Add to order/ }).click();
    await page.getByRole('button', { name: 'View order, 1 items', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your drink order.' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('the finder and dialogs work with reduced motion enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startFinder(page);
  await showPicks(page);
  await expect(picks(page)).toHaveCount(3);
  const prefersReduced = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  expect(prefersReduced).toBe(true);
  await openSettings(page);
  const movingElements = await page.evaluate(() => Array.from(document.querySelectorAll('*')).filter(element => {
    const style = getComputedStyle(element);
    return [...style.animationDuration.split(','), ...style.transitionDuration.split(',')].some(duration => parseFloat(duration) > 0);
  }).map(element => element.className));
  expect(movingElements, 'Reduced motion must disable all declared animations and transitions').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('screen and sheet motion stays brief and avoids animating layout', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.locator('.finder-banner').getByRole('button', { name: 'Try it now', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Something refreshing/ })).toBeVisible();
  const screenMotion = await main(page).evaluate(element => [element, ...element.querySelectorAll('*')].map(node => {
    const style = getComputedStyle(node);
    return { name: style.animationName, durations: style.animationDuration.split(',').map(duration => parseFloat(duration)) };
  }).filter(motion => motion.name !== 'none'));
  expect(screenMotion.length, 'Forward navigation should have a short screen transition').toBeGreaterThan(0);
  for (const motion of screenMotion) {
    for (const duration of motion.durations) {
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThanOrEqual(0.4);
    }
  }
  await page.getByRole('button', { name: /^Something refreshing/ }).click();
  await expect(page.getByRole('heading', { name: 'Preferences', level: 1, exact: true })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-goal-transition');
  await openSettings(page);
  const sheetMotion = await page.getByRole('dialog').evaluate(element => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: parseFloat(style.animationDuration) };
  });
  expect(sheetMotion.name).not.toBe('none');
  expect(sheetMotion.duration).toBeGreaterThan(0);
  expect(sheetMotion.duration).toBeLessThanOrEqual(0.4);
  const keyframeProperties = await page.evaluate(() => {
    const properties: string[] = [];
    const collect = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSKeyframesRule) {
          for (const frame of Array.from(rule.cssRules)) {
            if (frame instanceof CSSKeyframeRule) {
              for (const property of Array.from(frame.style)) properties.push(property);
            }
          }
        } else if ('cssRules' in rule && rule.cssRules instanceof CSSRuleList) {
          collect(rule.cssRules);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) collect(sheet.cssRules);
    return [...new Set(properties)];
  });
  expect(keyframeProperties.length).toBeGreaterThan(0);
  expect(keyframeProperties.filter(property => property !== 'opacity' && property !== 'transform')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 720 }]) {
test(`native goal transitions finish forward and in reverse at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.setViewportSize(viewport);
  await observeViewTransitions(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/goal');
  await page.evaluate(async () => { await document.fonts.ready; });
  expect((await transitionState(page)).supported, 'The isolated Chromium browser must exercise the native API').toBe(true);
  const originalTitle = await page.getByRole('button', { name: /^A coffee boost/ }).locator('.goal-title').boundingBox();
  expect(originalTitle).not.toBeNull();
  await page.getByRole('button', { name: /^A coffee boost/ }).click();
  await page.waitForFunction(() => Reflect.get(window, '__goalTransitions').ready === 1, undefined, { polling: 'raf' });
  await page.evaluate(async () => {
    const start = performance.now();
    while (performance.now() - start < 100) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  });
  await page.screenshot({ path: join(testInfo.project.outputDir, `design-${viewport.width}-goal-transition.png`), fullPage: true });
  await expect(page.getByRole('heading', { name: 'Preferences', level: 1, exact: true })).toBeVisible();
  await expect(page.locator('.goal-banner')).toContainText('A coffee boost');
  await expect(page.locator('.goal-banner-label')).toHaveCSS('view-transition-name', 'goal-coffee');
  await expectCompletedTransitions(page, 1);
  const destinationTitle = await page.locator('.goal-banner-label').boundingBox();
  expect(destinationTitle).not.toBeNull();
  expect(Math.abs(destinationTitle!.y - originalTitle!.y)).toBeGreaterThan(30);
  const movement = (await transitionState(page)).motion.find((motion: { name: string }) => motion.name.includes('group-anim-goal-coffee'));
  expect(movement, 'The native goal label must move between positions, not only fade').toBeDefined();
  expect(movement.duration).toBeGreaterThan(0);
  expect(movement.duration).toBeLessThanOrEqual(400);
  expect(movement.transforms[0]).not.toBe(movement.transforms.at(-1));
  expect((await transitionState(page)).snapshots).toEqual([{ before: ['goal-coffee'], after: ['goal-coffee'] }]);
  const namedGroups = (await transitionState(page)).motion.map((motion: { name: string }) => motion.name.replace(/^.*group-anim-/, ''));
  expect([...new Set(namedGroups)], 'Only the chosen label may receive a native movement group').toEqual(['goal-coffee']);
  await page.getByRole('button', { name: 'Change goal', exact: true }).click();
  const selectedGoal = page.getByRole('button', { name: /^A coffee boost/ });
  await expect(selectedGoal).not.toHaveAttribute('aria-pressed');
  await expect(selectedGoal.locator('.goal-title')).toHaveCSS('view-transition-name', 'goal-coffee');
  await expectCompletedTransitions(page, 2);
  await selectedGoal.click();
  await expect(page).toHaveURL(/#\/preferences$/);
  await expectCompletedTransitions(page, 3);
  await showPicks(page);
  await expect(page.locator('.goal-banner')).toContainText('A coffee boost');
  await page.getByRole('button', { name: 'Change goal', exact: true }).click();
  await expect(selectedGoal).not.toHaveAttribute('aria-pressed');
  await expectCompletedTransitions(page, 4);
  for (const snapshot of (await transitionState(page)).snapshots) {
    expect(snapshot.before).toEqual(['goal-coffee']);
    expect(snapshot.after).toEqual(['goal-coffee']);
  }
  const reverseGroups = (await transitionState(page)).motion.map((motion: { name: string }) => motion.name.replace(/^.*group-anim-/, ''));
  expect([...new Set(reverseGroups)], 'Reverse navigation must not create ghost snapshots for other goals').toEqual(['goal-coffee']);
  await selectedGoal.evaluate(element => { if (element instanceof HTMLElement) element.click(); });
  await expect(page.getByRole('button', { name: 'Change goal', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Change goal', exact: true }).evaluate(element => { if (element instanceof HTMLElement) element.click(); });
  await expect(page).toHaveURL(/#\/goal$/);
  await expect(selectedGoal).not.toHaveAttribute('aria-pressed');
  await expect.poll(async () => {
    const probe = await transitionState(page);
    return probe.finished === probe.calls;
  }).toBe(true);
  expect((await transitionState(page)).finishedErrors).toEqual([]);
  expect((await transitionState(page)).unhandled).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});
}

for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 720 }]) {
  for (const origin of ['menu', 'results', 'cart']) {
    test(`only the chosen drink title and photo move from ${origin} to details at ${viewport.width}px`, async ({ page }, testInfo) => {
      const runtimeErrors: string[] = [];
      page.on('pageerror', error => runtimeErrors.push(error.message));
      await page.setViewportSize(viewport);
      await observeViewTransitions(page);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      if (origin === 'menu') {
        await page.goto('/');
        await page.getByRole('searchbox', { name: 'Search drinks' }).fill('Iced Caffè Latte');
      } else if (origin === 'results') {
        await limitStock(page, ['iced-latte']);
        await startFinder(page, 'A coffee boost');
        await group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true }).click();
        await group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true }).click();
        await showPicks(page);
        await expect(picks(page)).toHaveCount(1);
      } else {
        await page.goto('/#/drink/iced-latte?from=menu');
        await page.getByRole('button', { name: /^Add to order/ }).click();
        await page.getByRole('button', { name: 'View order, 1 items', exact: true }).click();
      }
      await page.evaluate(async () => { await document.fonts.ready; });
      await expect.poll(async () => {
        const probe = await transitionState(page);
        return probe.finished === probe.calls;
      }).toBe(true);
      const callsBefore = (await transitionState(page)).calls;
      const sourceTitle = main(page).locator('.drink-title').filter({ hasText: /^Iced Caffè Latte$/ });
      await expect(sourceTitle).toHaveCount(1);
      await sourceTitle.scrollIntoViewIfNeeded();
      await expect.poll(() => main(page).locator('[data-drink-image="iced-latte"]').evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
        { message: 'The real product photograph must be loaded before the shared-image capture' }).toBe(true);
      await expect(main(page).locator('[data-drink-frame="iced-latte"]')).toHaveCSS('border-radius', '50%');
      const sourceBounds = await sourceTitle.boundingBox();
      expect(sourceBounds).not.toBeNull();
      if (origin === 'results') await picks(page).getByRole('button', { name: 'See drink', exact: true }).click();
      else await main(page).getByRole('button', { name: /^Iced Caffè Latte/ }).click();
      await page.waitForFunction(calls => Reflect.get(window, '__goalTransitions').ready === calls, callsBefore + 1, { polling: 'raf' });
      await page.evaluate(async () => {
        const start = performance.now();
        while (performance.now() - start < 100) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      });
      await page.screenshot({ path: join(testInfo.project.outputDir, `design-${viewport.width}-${origin}-drink-transition.png`), fullPage: true });
      await expect(main(page).getByRole('heading', { name: 'Iced Caffè Latte', exact: true })).toBeVisible();
      await expect(main(page).locator('[data-drink-frame="iced-latte"]')).toHaveCSS('border-radius', '50%');
      await expectCompletedTransitions(page, callsBefore + 1);
      const snapshot = (await transitionState(page)).snapshots[callsBefore];
      const chosenNames = ['drink-iced-latte', 'drink-image-iced-latte'];
      expect([...snapshot.before].sort(), 'Only the chosen title and photo may become named snapshots').toEqual(chosenNames);
      expect([...snapshot.after].sort()).toEqual(chosenNames);
      const nativeGroups = (await transitionState(page)).motion.filter((motion: { name: string }) => motion.name.includes('group-anim-drink-'));
      expect([...new Set(nativeGroups.map((motion: { name: string }) => motion.name.replace(/^.*group-anim-/, '')))].sort()).toEqual(chosenNames);
      for (const name of chosenNames) {
        const movement = nativeGroups.find((motion: { name: string }) => motion.name.endsWith(`group-anim-${name}`));
        expect(movement, `The selected ${name} must have a native movement group`).toBeDefined();
        expect(movement.duration).toBeGreaterThan(0);
        expect(movement.duration).toBeLessThanOrEqual(400);
        expect(movement.transforms[0]).not.toBe(movement.transforms.at(-1));
      }
      const destinationBounds = await main(page).getByRole('heading', { name: 'Iced Caffè Latte', exact: true }).boundingBox();
      expect(destinationBounds).not.toBeNull();
      expect(Math.abs(destinationBounds!.y - sourceBounds!.y)).toBeGreaterThan(2);
      await page.getByRole('button', { name: 'Go back', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#/${origin}$`));
      await expect(sourceTitle).toBeVisible();
      await expectCompletedTransitions(page, callsBefore + 2);
      await expect(main(page).locator('[data-drink-frame="iced-latte"]')).toHaveCSS('border-radius', '50%');
      const reverse = (await transitionState(page)).snapshots[callsBefore + 1];
      expect([...reverse.before].sort()).toEqual(chosenNames);
      expect([...reverse.after].sort()).toEqual(chosenNames);
      if (origin === 'menu') await expect(page.getByRole('searchbox', { name: 'Search drinks' })).toHaveValue('Iced Caffè Latte');
      if (origin === 'cart') await expect(page.getByRole('button', { name: 'View order, 1 items', exact: true })).toBeVisible();
      expect(runtimeErrors).toEqual([]);
      expect((await transitionState(page)).unhandled).toEqual([]);
    });
  }
}

test('reduced motion skips the native goal and drink transition API', async ({ page }) => {
  await observeViewTransitions(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startFinder(page, 'Warm and comforting');
  await expect(page.locator('.goal-banner')).toContainText('Warm and comforting');
  await page.getByRole('button', { name: 'Change goal', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Warm and comforting/ })).not.toHaveAttribute('aria-pressed');
  await page.getByRole('button', { name: /^Something refreshing/ }).click();
  await showPicks(page);
  await expect(page.getByRole('heading', { name: 'Your drink picks', exact: true })).toBeVisible();
  await picks(page).first().getByRole('button', { name: 'See drink', exact: true }).click();
  await page.getByRole('button', { name: /^Add to order/ }).click();
  await page.getByRole('button', { name: 'View order, 1 items', exact: true }).click();
  await main(page).locator('.cart-product').click();
  await expect(page).toHaveURL(/#\/drink\//);
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your drink order.' })).toBeVisible();
  expect((await transitionState(page)).calls).toBe(0);
  expect((await transitionState(page)).unhandled).toEqual([]);
});

test('the full finder flow still works when the View Transition API is absent', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined });
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await startFinder(page);
  expect(await page.evaluate(() => typeof document.startViewTransition)).toBe('undefined');
  await expect(page.locator('.goal-banner')).toContainText('Something refreshing');
  await showPicks(page);
  await expect(picks(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Change goal', exact: true }).click();
  await page.getByRole('button', { name: /^A coffee boost/ }).click();
  await showPicks(page);
  await expect(page.locator('.goal-banner')).toContainText('A coffee boost');
  await picks(page).first().getByRole('button', { name: 'See drink', exact: true }).click();
  await page.getByRole('button', { name: /^Add to order/ }).click();
  await page.getByRole('button', { name: 'View order, 1 items', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your drink order.' })).toBeVisible();
  await main(page).locator('.cart-product').click();
  await expect(page).toHaveURL(/#\/drink\//);
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your drink order.' })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

for (const width of [320, 375]) {
  test(`preferences keep their primary action visible while scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 600 });
    await startFinder(page, 'A coffee boost');
    await expect(page.locator('.flow-progress')).toHaveCount(0);
    await expect(page.getByText(/^Step \d of \d$/)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Preferences', level: 1, exact: true })).toHaveCount(1);
    const action = page.getByRole('button', { name: 'Show my drink picks', exact: true });
    await expect(action).toBeVisible();
    expect(await action.evaluate(element => element.closest('main') === null), 'The primary action must sit outside scrollable preferences').toBe(true);
    const before = await action.boundingBox();
    expect(before).not.toBeNull();
    expect(before!.height).toBeGreaterThanOrEqual(44);
    const pickup = await page.locator('.pickup-strip').boundingBox();
    expect(pickup).not.toBeNull();
    expect(before!.y + before!.height).toBeLessThanOrEqual(pickup!.y);
    await group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true }).click();
    await group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true }).click();
    await page.getByRole('button', { name: 'Clear optional preferences', exact: true }).scrollIntoViewIfNeeded();
    await expect.poll(() => main(page).evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(action).toBeVisible();
    const after = await action.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.y - before!.y), 'The action must not move with preference content').toBeLessThanOrEqual(1);
    await main(page).evaluate(element => { element.scrollTop = 0; });
    await page.getByRole('button', { name: /^Change/ }).click();
    await expect(page.getByRole('button', { name: /^A coffee boost/ })).not.toHaveAttribute('aria-pressed');
    await page.getByRole('button', { name: /^Warm and comforting/ }).click();
    await expect(page.getByRole('heading', { name: 'Preferences', level: 1, exact: true })).toBeVisible();
    await expect(group(page, 'Hot or iced?')).toHaveCount(0);
    expect((await savedPreferences(page)).temperature).toBe('hot');
    await expect(group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await showPicks(page);
    await expect(page.getByRole('heading', { name: 'Your drink picks', level: 1, exact: true })).toBeVisible();
  });
}

test('compact discovery screens avoid repeated headings and oversized result photographs', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.locator('.menu-switch')).toHaveCount(0);
  await page.locator('.finder-banner').getByRole('button', { name: 'Try it now', exact: true }).click();
  await expect(page.locator('.flow-progress')).toHaveCount(0);
  await expect(page.getByText(/^Step \d of \d$/)).toHaveCount(0);
  await page.getByRole('button', { name: /^Something refreshing/ }).click();
  await showPicks(page);
  await expect(page.getByRole('heading', { name: 'Your drink picks', exact: true })).toHaveCount(1);
  await expect(page.locator('.goal-banner')).toHaveCount(1);
  await expect(page.locator('.goal-banner')).toContainText('Something refreshing');
  await expect(page.locator('.goal-banner').getByRole('button', { name: 'Change goal', exact: true })).toBeVisible();
  await expect(page.locator('.results-toolbar')).toHaveCount(0);
  await expect(page.locator('.results-count')).toHaveCount(0);
  await expect(picks(page)).toHaveCount(3);
  const contentBounds = await main(page).boundingBox();
  expect(contentBounds).not.toBeNull();
  for (let index = 0; index < 2; index++) {
    const visibleCard = await picks(page).nth(index).boundingBox();
    expect(visibleCard).not.toBeNull();
    expect(visibleCard!.y).toBeGreaterThanOrEqual(contentBounds!.y);
    expect(visibleCard!.y + visibleCard!.height, 'Two complete result cards should fit without scrolling').toBeLessThanOrEqual(contentBounds!.y + contentBounds!.height);
  }
  for (const card of await picks(page).all()) {
    const imageBounds = await card.locator('[data-drink-frame]').boundingBox();
    expect(imageBounds).not.toBeNull();
    expect(imageBounds!.width, 'A recommendation image must remain a compact thumbnail').toBeLessThanOrEqual(96);
    expect(imageBounds!.height).toBeLessThanOrEqual(96);
    const cardBounds = await card.boundingBox();
    expect(cardBounds).not.toBeNull();
    expect(cardBounds!.height, 'A result card should not consume most of the viewport').toBeLessThanOrEqual(320);
    await expect(card.getByRole('button', { name: 'See drink', exact: true })).toHaveCount(1);
  }
  await waitForNativeMotion(page);
  await expect.poll(() => picks(page).locator('img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: join(testInfo.project.outputDir, 'design-375-results-three.png'), fullPage: true, animations: 'disabled' });
  await page.locator('.goal-banner').getByRole('button', { name: 'Change goal', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Something refreshing/ })).not.toHaveAttribute('aria-pressed');
});

test('preference choices show one checkmark only when selected and keep their labels', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await startFinder(page, 'A coffee boost');
  const verifyChecks = async () => {
    for (const button of await main(page).locator('.choice').all()) {
      const selected = await button.getAttribute('aria-pressed') === 'true';
      await expect(button.locator('.choice-mark')).toHaveCount(selected ? 1 : 0);
      await expect(button.locator('svg')).toHaveCount(selected ? 1 : 0);
    }
  };
  await verifyChecks();
  for (const label of ['Less sweet', 'Sweeter', 'No preference']) {
    await group(page, 'Sweetness').getByRole('button', { name: label, exact: true }).click();
    await expect(group(page, 'Sweetness').getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await verifyChecks();
    const rows = await group(page, 'Sweetness').getByRole('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().y));
    expect(Math.max(...rows) - Math.min(...rows), 'All three sweetness labels should fit on one row at 375px').toBeLessThanOrEqual(1);
  }
});

for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 1000 }]) {
  test(`short routes center and long routes retain their full scroll area at ${viewport.width}px`, async ({ page }, testInfo) => {
    await limitStock(page, ['iced-latte', 'black-tea-lemonade', 'strawberry-acai-lemonade', 'chamomile-tea']);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expectTopAlignedLongRoute(page);
    await page.getByRole('searchbox', { name: 'Search drinks' }).scrollIntoViewIfNeeded();
    await page.locator('.finder-banner').getByRole('button', { name: 'Try it now', exact: true }).click();
    await expect(page.getByRole('button', { name: /^A coffee boost/ })).toBeVisible();
    await expectCenteredRoute(page);
    await page.getByRole('button', { name: /^A coffee boost/ }).click();
    await expect(page.getByRole('heading', { name: 'Preferences', level: 1, exact: true })).toBeVisible();
    await expectAdaptiveRoutePlacement(page);
    await page.getByRole('button', { name: 'Clear optional preferences', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Clear optional preferences', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show my drink picks', exact: true })).toBeVisible();
    await group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true }).click();
    await group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true }).click();
    await showPicks(page);
    await expect(picks(page)).toHaveCount(1);
    await expectCenteredRoute(page);
    await picks(page).getByRole('button', { name: 'See drink', exact: true }).click();
    await expect(main(page).getByRole('heading', { name: 'Iced Caffè Latte', exact: true })).toBeVisible();
    await expectTopAlignedLongRoute(page);
    await page.getByText('Ingredients and recipe information', { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByText('Ingredients and recipe information', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Add to order/ })).toBeVisible();
    await page.getByRole('button', { name: 'View order, 0 items', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your order is empty.', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your order is empty.', exact: true })).toHaveCSS('color', 'rgb(17, 17, 17)');
    await expectCenteredRoute(page);
    await waitForNativeMotion(page);
    await page.screenshot({ path: join(testInfo.project.outputDir, `design-${viewport.width}-empty-cart.png`), fullPage: true, animations: 'disabled' });
    await startFinder(page);
    await page.getByRole('button', { name: 'Clear optional preferences', exact: true }).click();
    await showPicks(page);
    await expect(picks(page)).toHaveCount(3);
    await expectTopAlignedLongRoute(page);
    await page.getByRole('button', { name: 'Browse the menu', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Browse the menu', exact: true })).toBeVisible();
  });
}

test('short mobile viewports preserve long-route scroll access and the fixed finder action', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expectTopAlignedLongRoute(page);
  await page.locator('.finder-banner').getByRole('button', { name: 'Try it now', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Warm and comforting/ })).toBeVisible();
  await expectTopAlignedLongRoute(page);
  await page.getByRole('button', { name: /^Warm and comforting/ }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /^Warm and comforting/ }).click();
  await expect(page.getByRole('heading', { name: 'Preferences', level: 1, exact: true })).toBeVisible();
  await expectAdaptiveRoutePlacement(page);
  await page.getByRole('button', { name: 'Clear optional preferences', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Clear optional preferences', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show my drink picks', exact: true })).toBeVisible();
  await showPicks(page);
  await expect(picks(page)).toHaveCount(3);
  await expectTopAlignedLongRoute(page);
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1024, height: 600 },
  { width: 844, height: 390 },
  { width: 600, height: 600 },
]) {
  test(`desktop phone and caption fit the viewport at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.evaluate(async () => { await document.fonts.ready; });
    const frame = await page.locator('.device').boundingBox();
    const caption = await page.locator('.desktop-caption').boundingBox();
    expect(frame).not.toBeNull();
    expect(caption).not.toBeNull();
    expect(frame!.x).toBeGreaterThanOrEqual(0);
    expect(frame!.y).toBeGreaterThanOrEqual(0);
    expect(frame!.x + frame!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(frame!.y + frame!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(caption!.y + caption!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(Math.abs(frame!.x + frame!.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
    const screen = await page.locator('.device-screen').evaluate(element => {
      const box = element.getBoundingClientRect();
      return { width: element.clientWidth, height: element.clientHeight, scale: box.width / element.clientWidth, scaleY: box.height / element.clientHeight };
    });
    expect(screen.width).toBe(393);
    expect(screen.height).toBe(852);
    expect(screen.scale).toBeGreaterThan(0);
    expect(screen.scale).toBeLessThanOrEqual(1);
    expect(Math.abs(screen.scale - screen.scaleY), 'The preview must scale uniformly instead of distorting the phone').toBeLessThanOrEqual(0.005);
    const pageOverflow = await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth - innerWidth,
      vertical: document.documentElement.scrollHeight - innerHeight,
    }));
    expect(pageOverflow.horizontal, 'The desktop preview must not scroll horizontally').toBeLessThanOrEqual(1);
    expect(pageOverflow.vertical, 'The complete desktop phone must fit without outer page scrolling').toBeLessThanOrEqual(1);
    const target = await page.getByRole('button', { name: 'Demo settings', exact: true }).boundingBox();
    expect(target).not.toBeNull();
    expect(target!.width / screen.scale, 'Scaled controls must retain a logical 44px touch target').toBeGreaterThanOrEqual(43.5);
    expect(target!.height / screen.scale).toBeGreaterThanOrEqual(43.5);
    await expectTopAlignedLongRoute(page);
    await main(page).evaluate(element => { element.scrollTop = 220; });
    await expect.poll(async () => Math.abs(await main(page).evaluate(element => element.scrollTop) - 220) * screen.scale,
      { message: 'The main content must scroll to the requested position within one rendered pixel' }).toBeLessThanOrEqual(1);
    expect(await page.locator('.device-screen').evaluate(element => element.scrollTop)).toBe(0);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await main(page).evaluate(element => { element.scrollTop = 0; });
    if (viewport.width === 1280 || viewport.width === 844) {
      await expect.poll(() => page.locator('.banner-drink').evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
      await page.screenshot({ path: join(testInfo.project.outputDir, `design-${viewport.width}-${viewport.height}-fit.png`), fullPage: true, animations: 'disabled' });
    }
    if (viewport.width === 1280) {
      await main(page).evaluate(element => { element.scrollTop = 220; });
      const scrollBeforeResize = await main(page).evaluate(element => element.scrollTop);
      const routeBeforeResize = page.url();
      await page.setViewportSize({ width: 1024, height: 600 });
      const resizedFrame = await page.locator('.device').boundingBox();
      const resizedCaption = await page.locator('.desktop-caption').boundingBox();
      expect(resizedFrame).not.toBeNull();
      expect(resizedCaption).not.toBeNull();
      expect(resizedFrame!.x).toBeGreaterThanOrEqual(0);
      expect(resizedFrame!.y).toBeGreaterThanOrEqual(0);
      expect(resizedFrame!.x + resizedFrame!.width).toBeLessThanOrEqual(1025);
      expect(resizedFrame!.y + resizedFrame!.height).toBeLessThanOrEqual(601);
      expect(resizedCaption!.y + resizedCaption!.height).toBeLessThanOrEqual(601);
      await expect(page).toHaveURL(routeBeforeResize);
      const resizedScale = await page.locator('.device-screen').evaluate(element => element.getBoundingClientRect().width / element.clientWidth);
      await expect.poll(async () => Math.abs(await main(page).evaluate(element => element.scrollTop) - scrollBeforeResize) * resizedScale,
        { message: 'Resizing must retain the same content position within one rendered pixel' }).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => scrollY)).toBe(0);
    }
  });
}

for (const width of [375, 1440]) {
  for (const initialScroll of [0, 220]) {
    test(`drawer opening does not scroll its hidden ancestors at ${width}px and main scroll ${initialScroll}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
      await page.goto('/');
      await page.evaluate(async () => { await document.fonts.ready; });
      await main(page).evaluate((element, scroll) => { element.scrollTop = scroll; }, initialScroll);
      await expect.poll(() => main(page).evaluate(element => element.scrollTop)).toBe(initialScroll);
      const selectors = ['.device', '.device-screen', '.app-body', '.app-header', '.app-scroll', '.pickup-strip', '.bottom-nav'];
      const samplesPromise = page.evaluate(async targets => {
        const samples: { selector: string; x: number; y: number; width: number; height: number; scrollTop: number }[][] = [];
        for (let frame = 0; frame < 32; frame++) {
          samples.push(targets.map(selector => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLElement)) throw new Error(`Missing layout element: ${selector}`);
            const box = element.getBoundingClientRect();
            return { selector, x: box.x, y: box.y, width: box.width, height: box.height, scrollTop: element.scrollTop };
          }));
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
        return samples;
      }, selectors);
      await page.getByRole('button', { name: 'Demo settings', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Demo settings' })).toBeVisible();
      const samples = await samplesPromise;
      const baseline = samples[0];
      expect(samples).toHaveLength(32);
      for (const [frame, sample] of samples.entries()) {
        for (const [index, measured] of sample.entries()) {
          const initial = baseline[index];
          expect(measured.scrollTop, `${measured.selector} scrollTop changed during drawer frame ${frame}`).toBe(initial.scrollTop);
          for (const dimension of ['x', 'y', 'width', 'height'] as const) {
            expect(Math.abs(measured[dimension] - initial[dimension]), `${measured.selector} ${dimension} shifted during drawer frame ${frame}`).toBeLessThanOrEqual(1);
          }
        }
      }
      const drawerContent = page.locator('.sheet-content');
      await expect(page.locator('.app-scroll')).toHaveCSS('scrollbar-width', 'none');
      await expect(drawerContent).toHaveCSS('scrollbar-width', 'none');
      const scrollbarGutter = await drawerContent.evaluate(element => element instanceof HTMLElement ? element.offsetWidth - element.clientWidth : -1);
      expect(scrollbarGutter, 'A drawer scrollbar must not consume a visible gutter').toBe(0);
      await page.getByRole('dialog').getByRole('button', { name: 'Reset demo', exact: true }).scrollIntoViewIfNeeded();
      await expect.poll(() => drawerContent.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      expect(await page.locator('.device-screen').evaluate(element => element.scrollTop)).toBe(0);
      expect(await page.locator('.app-scroll').evaluate(element => element.scrollTop)).toBe(initialScroll);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }
}

for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 1000 }]) {
  test(`design review captures the core screens at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const capture = async (screen: string) => {
      await waitForNativeMotion(page);
      await page.evaluate(async () => { await document.fonts.ready; });
      await expect.poll(() => page.locator('img').evaluateAll(images => images.filter(image => {
        const box = image.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight;
      }).every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)), { message: 'Visible photographs must be ready before capture' }).toBe(true);
      await page.screenshot({
        path: join(testInfo.project.outputDir, `design-${viewport.width}-${screen}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    };
    await page.goto('/');
    await expect(page.getByRole('searchbox', { name: 'Search drinks' })).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    const loadedFonts = await page.evaluate(() => Array.from(document.fonts).filter(font => font.status === 'loaded').map(font => font.family));
    expect(loadedFonts.some(family => family.replace(/["']/g, '') === 'Manrope'), 'The local Manrope font must finish loading before visual review').toBe(true);
    for (const selector of ['body', '.search-field input', '.category-tabs button']) {
      const families = await page.locator(selector).first().evaluate(element => getComputedStyle(element).fontFamily);
      expect(families, `${selector} must retain the sans-serif font stack`).toMatch(/sans-serif/i);
      expect(families, `${selector} must use the shared local font`).toMatch(/Manrope/);
    }
    const cartButton = page.getByRole('button', { name: 'View order, 0 items', exact: true });
    const cartBounds = await cartButton.boundingBox();
    expect(cartBounds).not.toBeNull();
    expect(cartBounds!.width).toBeGreaterThanOrEqual(44);
    expect(cartBounds!.height).toBeGreaterThanOrEqual(44);
    await expect(cartButton.locator('svg')).toHaveCount(1);
    await expect(cartButton).not.toContainText('0');
    const bannerButton = await page.locator('.finder-banner').getByRole('button', { name: 'Try it now', exact: true }).boundingBox();
    const bannerCopy = await page.locator('.finder-banner-copy').boundingBox();
    expect(bannerButton).not.toBeNull();
    expect(bannerCopy).not.toBeNull();
    const bannerHeadline = await page.locator('.finder-banner h2').boundingBox();
    expect(bannerHeadline).not.toBeNull();
    expect(Math.abs(bannerHeadline!.x + bannerHeadline!.width / 2 - bannerButton!.x - bannerButton!.width / 2), 'The hero heading and action must share the reference center axis').toBeLessThanOrEqual(1);
    expect(Math.abs(bannerHeadline!.y - bannerCopy!.y - (bannerCopy!.y + bannerCopy!.height - bannerButton!.y - bannerButton!.height)), 'The hero copy stack must be vertically centered').toBeLessThanOrEqual(1);
    const bannerArt = page.locator('.banner-drink');
    await expect(bannerArt).toHaveAttribute('src', /^\/media\/images\/finder-drinks-small\.[a-f0-9]{12}\.webp$/);
    await expect(bannerArt).toHaveAttribute('alt', 'Matcha, strawberry and iced coffee drinks');
    await capture('menu');
    await page.getByRole('searchbox', { name: 'Search drinks' }).fill('unicorn');
    await expect(page.getByRole('heading', { name: 'No drinks found' })).toBeVisible();
    await capture('empty-search');
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await page.locator('.finder-banner').getByRole('button', { name: 'Try it now', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
    await capture('goal');
    await page.getByRole('button', { name: /^A coffee boost/ }).click();
    await expect(page).toHaveURL(/#\/preferences$/);
    await group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true }).click();
    await group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true }).click();
    await main(page).evaluate(element => { element.scrollTop = 0; });
    await capture('preferences');
    await page.getByRole('button', { name: 'Clear optional preferences', exact: true }).scrollIntoViewIfNeeded();
    await capture('preferences-bottom');
    await showPicks(page);
    const expectedPicks = drinks.filter(drink => drink.goals.includes('coffee') && drink.temperature === 'iced' && drink.milk === 'dairy');
    await expect(picks(page)).toHaveCount(Math.min(3, expectedPicks.length));
    await capture('results');
    await picks(page).filter({ has: page.getByRole('heading', { name: 'Iced Caffè Latte', exact: true }) }).getByRole('button', { name: 'See drink', exact: true }).click();
    await expect(main(page).getByRole('heading', { name: 'Iced Caffè Latte', exact: true })).toBeVisible();
    await capture('detail');
    await page.getByText('Ingredients and recipe information', { exact: true }).scrollIntoViewIfNeeded();
    await capture('detail-bottom');
    await page.getByRole('button', { name: /^Add to order/ }).click();
    await expect(page.getByRole('button', { name: 'View order, 1 items', exact: true })).toContainText('1');
    await page.getByRole('button', { name: 'View order, 1 items', exact: true }).click();
    await expect(page.locator('.toast > span')).toHaveCount(0);
    await capture('cart');
    await openSettings(page);
    await capture('sheet');
    await page.getByRole('dialog').getByRole('button', { name: 'Reset demo', exact: true }).scrollIntoViewIfNeeded();
    await capture('sheet-bottom');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}
