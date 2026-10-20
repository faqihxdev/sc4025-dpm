import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

const dist = resolve('dist');

test('the deployment artifact limits immutable caching to content-versioned runtime assets', async () => {
  const images = await readdir(resolve(dist, 'media/images')).catch(() => []);
  const fonts = await readdir(resolve(dist, 'media/fonts')).catch(() => []);
  expect(images.length, 'Runtime photos and logo need content-versioned URLs before long caching').toBe(51);
  expect(fonts).toHaveLength(1);
  for (const [folder, files] of [['images', images], ['fonts', fonts]] as const) {
    for (const file of files) {
      const content = await readFile(resolve(dist, 'media', folder, file));
      const digest = createHash('sha256').update(content).digest('hex').slice(0, 12);
      expect(file, 'The URL version must derive from the actual file bytes').toContain(`.${digest}.`);
    }
  }
  const headers = await readFile(resolve(dist, '_headers'), 'utf8');
  expect(headers).toContain('/media/*\n  Cache-Control: public, max-age=31536000, immutable');
  expect(headers).toContain('/assets/*\n  Cache-Control: public, max-age=31536000, immutable');
  expect(headers).toContain('/\n  Cache-Control: public, max-age=0, must-revalidate');
  expect(headers).not.toMatch(/\/(?:images|fonts)\/\*\s+Cache-Control:[^\n]*immutable/);
  const html = await readFile(resolve(dist, 'index.html'), 'utf8');
  const fontUrl = `/media/fonts/${fonts[0]}`;
  expect(html).toContain(fontUrl);
  const assets = await readdir(resolve(dist, 'assets'));
  const css = (await Promise.all(assets.filter(name => name.endsWith('.css')).map(name => readFile(resolve(dist, 'assets', name), 'utf8')))).join('\n');
  expect(css, 'Font preload and font-face must reuse the same versioned URL').toContain(fontUrl);
  expect(css).not.toContain('/fonts/manrope-latin-variable.woff2');
  expect(images.filter(name => name.endsWith('.webp'))).toHaveLength(50);
  for (const name of images.filter(name => /^finder-drinks(?:-small)?\./.test(name))) {
    const banner = sharp(resolve(dist, 'media/images', name));
    expect((await banner.metadata()).hasAlpha, 'The botanical artwork needs genuine transparency').toBe(true);
    const alpha = (await banner.stats()).channels.at(-1)!;
    expect(alpha.min, 'The cream surface must show through the transparent artwork').toBe(0);
    expect(alpha.max, 'The drink artwork must remain visible').toBe(255);
  }
  const canonicalImages = await readdir(resolve(dist, 'images'));
  const canonicalFonts = await readdir(resolve(dist, 'fonts'));
  expect(canonicalImages.filter(name => /\.(webp|svg)$/.test(name)), 'The build must not ship duplicate unversioned photos or logo').toEqual([]);
  expect(canonicalFonts.filter(name => name.endsWith('.woff2')), 'The build must not ship a duplicate unversioned font').toEqual([]);
});
