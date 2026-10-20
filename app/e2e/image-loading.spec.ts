import { expect, test } from '@playwright/test';

const isFullAmericano = (url: URL) => /^\/(?:media\/)?images\/iced-americano(?:\.[a-f\d]{12})?\.webp$/.test(url.pathname);

test('keeps the loaded menu photo visible while the detail photo is pending', async ({ page }) => {
  let releaseFull!: () => void;
  let fullRequested!: () => void;
  const pendingFull = new Promise<void>(resolve => { releaseFull = resolve; });
  const fullRequest = new Promise<void>(resolve => { fullRequested = resolve; });

  await page.route(isFullAmericano, async route => {
    fullRequested();
    await pendingFull;
    await route.continue();
  });

  await page.goto('/');
  const menuPhoto = page.locator('.product-row [data-drink-image="iced-americano"]');
  await expect.poll(() => menuPhoto.evaluate(image =>
    image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
  )).toBe(true);

  try {
    await page.getByRole('button', { name: /^Iced Americano/ }).click();
    await fullRequest;
    await expect.poll(() => page.locator('html').evaluate(element =>
      element.hasAttribute('data-drink-transition'),
    )).toBe(false);

    await expect.poll(() => page.locator('.detail-hero img').evaluateAll(images =>
      images.some(image => image instanceof HTMLImageElement && image.complete &&
        image.naturalWidth > 0 && getComputedStyle(image).visibility !== 'hidden' &&
        Number(getComputedStyle(image).opacity) > 0),
    ), { message: 'The cached menu photo should fill the crop while the larger photo is delayed', timeout: 1500 }).toBe(true);

    const frame = page.locator('.detail-hero [data-drink-frame="iced-americano"]');
    await expect(frame).toHaveCSS('border-radius', '50%');
    await expect(frame).toHaveCSS('overflow', 'hidden');
    await expect(page.getByRole('img', { name: 'Iced Americano', exact: true })).toHaveCount(1);

    releaseFull();
    const detailPhoto = page.locator('.detail-hero [data-drink-image="iced-americano"]');
    await expect.poll(() => detailPhoto.evaluate(image =>
      image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
    )).toBe(true);
    await expect(detailPhoto).toHaveCSS('opacity', '1');
    await expect(page.locator('.detail-hero img')).toHaveCount(1);
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('pending-detail.png') });
    throw error;
  } finally {
    releaseFull();
  }
});

test('a failed detail upgrade keeps the accessible image fallback and usable drink page', async ({ page }) => {
  await page.route(isFullAmericano, route => route.abort('failed'));
  await page.goto('/');
  const menuPhoto = page.locator('.product-row [data-drink-image="iced-americano"]');
  await expect.poll(() => menuPhoto.evaluate(image =>
    image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
  )).toBe(true);

  await page.getByRole('button', { name: /^Iced Americano/ }).click();
  await expect(page.getByRole('img', { name: 'Iced Americano, image unavailable', exact: true })).toBeVisible();
  await expect(page.locator('.detail-hero img')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Iced Americano', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to order', exact: false })).toBeEnabled();
});

test('a direct detail visit stays accessible without requesting an unseen thumbnail', async ({ page }) => {
  let releaseFull!: () => void;
  let fullRequested!: () => void;
  const pendingFull = new Promise<void>(resolve => { releaseFull = resolve; });
  const fullRequest = new Promise<void>(resolve => { fullRequested = resolve; });
  const thumbnailRequests: string[] = [];
  page.on('request', request => {
    if (/\/iced-americano-small(?:\.[a-f\d]{12})?\.webp(?:\?|$)/.test(request.url())) thumbnailRequests.push(request.url());
  });
  await page.route(isFullAmericano, async route => {
    fullRequested();
    await pendingFull;
    await route.continue();
  });

  try {
    await page.goto('/#/drink/iced-americano?from=menu', { waitUntil: 'domcontentloaded' });
    await fullRequest;
    await expect(page.getByRole('heading', { name: 'Iced Americano', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Iced Americano', exact: true })).toBeVisible();
    await expect(page.locator('.detail-hero img')).toHaveCount(1);
    expect(thumbnailRequests).toEqual([]);

    releaseFull();
    await expect.poll(() => page.locator('.detail-hero img').evaluate(image =>
      image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
    )).toBe(true);
  } finally {
    releaseFull();
  }
});

test('opening a detail page does not prefetch other full drink photos', async ({ page }) => {
  const fullDrinkRequests: string[] = [];
  page.on('request', request => {
    const match = new URL(request.url()).pathname.match(/^\/(?:media\/)?images\/([a-z-]+)(?:\.[a-f\d]{12})?\.webp$/);
    if (match && !match[1].endsWith('-small') && match[1] !== 'finder-drinks') fullDrinkRequests.push(match[1]);
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^Iced Americano/ }).click();
  await expect.poll(() => page.locator('.detail-hero [data-drink-image="iced-americano"]').evaluate(image =>
    image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
  )).toBe(true);
  expect([...new Set(fullDrinkRequests)]).toEqual(['iced-americano']);
});
