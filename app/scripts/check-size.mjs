import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = resolve(appDir, 'dist/assets');
const imageDir = resolve(appDir, 'dist/media/images');
const fontDir = resolve(appDir, 'dist/media/fonts');
const illustrationDir = resolve(appDir, 'dist/media/illustrations');
const assets = await readdir(assetDir);
const images = await readdir(imageDir);
const fonts = await readdir(fontDir);
const illustrations = await readdir(illustrationDir);
async function totalBytes(dir, files, compressed = false) {
  const sizes = await Promise.all(files.map(async file => {
    const data = await readFile(resolve(dir, file));
    return compressed ? gzipSync(data).length : data.length;
  }));
  return sizes.reduce((sum, size) => sum + size, 0);
}
const checks = [
  { name: 'JavaScript (gzip)', bytes: await totalBytes(assetDir, assets.filter(f => f.endsWith('.js')), true), limit: 90_000 },
  { name: 'CSS (gzip)', bytes: await totalBytes(assetDir, assets.filter(f => f.endsWith('.css')), true), limit: 10_000 },
  { name: 'Drink photos (all WebPs)', bytes: await totalBytes(imageDir, images.filter(f => f.endsWith('.webp'))), limit: 250_000 },
  { name: 'Discovery illustrations (WebP)', bytes: await totalBytes(illustrationDir, illustrations.filter(f => f.endsWith('.webp'))), limit: 10_000 },
  { name: 'Local font (WOFF2)', bytes: await totalBytes(fontDir, fonts.filter(f => f.endsWith('.woff2'))), limit: 35_000 },
];
let failed = false;
for (const check of checks) {
  const pass = check.bytes <= check.limit;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${check.name}: ${(check.bytes / 1000).toFixed(1)} KB / ${(check.limit / 1000).toFixed(0)} KB`);
  if (!pass) failed = true;
}
if (failed) process.exitCode = 1;
