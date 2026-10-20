import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(appDirectory, 'assets/generated/drink-discovery-v1.png');
const outputDirectory = resolve(appDirectory, 'public/illustrations');
await mkdir(outputDirectory, { recursive: true });
await sharp(source).resize(128, 128, { fit: 'contain' }).webp({ quality: 75, alphaQuality: 90, effort: 6 })
  .toFile(resolve(outputDirectory, 'drink-discovery.webp'));
