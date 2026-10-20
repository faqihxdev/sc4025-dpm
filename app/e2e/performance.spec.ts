import { expect, test } from '@playwright/test';

for (const deviceScaleFactor of [1, 2]) {
  test(`responsive banner is discovered before delayed JavaScript at DPR ${deviceScaleFactor}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 }, deviceScaleFactor, reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const requestedBanners: string[] = [];
    let releaseJavaScript: () => void = () => {};
    const javaScriptGate = new Promise<void>(resolve => { releaseJavaScript = resolve; });
    let scriptBlocked = false;
    page.on('request', request => {
      if (/\/finder-drinks(?:-small)?(?:\.[\w-]+)?\.webp(?:\?|$)/.test(request.url())) {
        requestedBanners.push(request.url());
      }
    });
    await page.route('**/assets/*.js', async route => {
      scriptBlocked = true;
      await javaScriptGate;
      await route.continue();
    });
    const navigation = page.goto(baseURL!, { waitUntil: 'load' });
    try {
      await expect.poll(() => scriptBlocked, { message: 'The test must intercept the real production JavaScript response' }).toBe(true);
      await expect.poll(() => requestedBanners.length, {
        timeout: 1500,
        message: 'The responsive hero must be requested while the React JavaScript is still held back',
      }).toBe(1);
      expect(scriptBlocked).toBe(true);
    } finally {
      releaseJavaScript();
      await navigation;
    }
    const image = page.locator('.banner-drink');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
    const selectedUrl = await image.evaluate(element => element instanceof HTMLImageElement ? element.currentSrc : '');
    const preload = page.locator('link[rel="preload"][as="image"]');
    await expect(preload).toHaveAttribute('imagesrcset', (await image.getAttribute('srcset'))!);
    await expect(preload).toHaveAttribute('imagesizes', (await image.getAttribute('sizes'))!);
    expect(requestedBanners, 'Responsive preload and the rendered img must share exactly one selected request').toEqual([selectedUrl]);
    expect(new URL(selectedUrl).pathname).toMatch(deviceScaleFactor === 1 ? /finder-drinks-small(?:\.[\w-]+)?\.webp$/ : /finder-drinks(?:\.[\w-]+)?\.webp$/);
    await expect(image).toHaveAttribute('fetchpriority', 'high');
    await context.close();
  });
}

for (const path of ['/#/goal', '/#/preferences', '/#/drink/iced-americano?from=menu', '/#/cart']) {
  test(`direct ${path} navigation does not preload an unused menu banner`, async ({ page, baseURL }) => {
    const requestedBanners: string[] = [];
    page.on('request', request => {
      if (/\/finder-drinks(?:-small)?(?:\.[\w-]+)?\.webp(?:\?|$)/.test(request.url())) {
        requestedBanners.push(request.url());
      }
    });
    await page.goto(new URL(path, baseURL).href);
    await expect(page.getByRole('main').locator('.route-content')).toBeVisible();
    await expect(page.locator('.banner-drink')).toHaveCount(0);
    expect(requestedBanners, 'The document should not spend image bandwidth on a menu hero absent from this route').toEqual([]);
  });
}
