import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const virtualId = 'virtual:static-assets';
const resolvedId = '\0' + virtualId;
const immutableExtensions = /\.(?:webp|svg|woff2)$/;

export function fingerprint(path: string, content: Uint8Array): string {
  const digest = createHash('sha256').update(content).digest('hex').slice(0, 12);
  return '/media/' + path.replace(/(\.[^.]+)$/, `.${digest}$1`);
}

type PublicAsset = { path: string; content: Buffer; url: string; digest: string | null };

function readAssets(directory: string, prefix = ''): PublicAsset[] {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const path = prefix + entry.name;
    if (entry.isDirectory()) return readAssets(join(directory, entry.name), path + '/');
    if (!entry.isFile()) throw new Error(`Unsupported public asset: ${path}`);
    const content = readFileSync(join(directory, entry.name));
    const digest = immutableExtensions.test(path) ? createHash('sha256').update(content).digest('hex').slice(0, 12) : null;
    return [{ path, content, url: digest ? fingerprint(path, content) : '/' + path, digest }];
  });
}

/** Fingerprint media at build time, without duplicating public files in dist. */
export function staticAssets(): Plugin {
  let building = false;
  let assets: PublicAsset[] = [];
  const rewrite = (text: string) => assets.reduce((result, asset) => asset.digest
    ? result.replaceAll('/' + asset.path + '?asset=' + asset.digest, asset.url).replaceAll('/' + asset.path, asset.url)
    : result, text);

  return {
    name: 'content-versioned-static-assets',
    enforce: 'pre',
    config: () => ({ build: { copyPublicDir: false } }),
    configResolved(config) {
      building = config.command === 'build';
      if (building) assets = readAssets(config.publicDir);
    },
    resolveId(id) { if (id === virtualId) return resolvedId; },
    load(id) {
      if (id !== resolvedId) return;
      const urls = Object.fromEntries(assets.filter(asset => asset.digest).map(asset => ['/' + asset.path, asset.url]));
      return `export default ${JSON.stringify(urls)};`;
    },
    transform(code, id) {
      if (!building || !id.split('?')[0].endsWith('.css')) return;
      // A changed font must also change the CSS URL that refers to it.
      const versioned = assets.filter(asset => asset.digest).reduce((result, asset) =>
        result.replaceAll('/' + asset.path, '/' + asset.path + '?asset=' + asset.digest), code);
      if (versioned !== code) return { code: versioned, map: null };
    },
    transformIndexHtml: { order: 'post', handler(html) { return building ? rewrite(html) : html; } },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'asset' && output.fileName.endsWith('.css')) {
          output.source = rewrite(typeof output.source === 'string' ? output.source : Buffer.from(output.source).toString('utf8'));
        }
      }
      for (const asset of assets) {
        this.emitFile({ type: 'asset', fileName: asset.url.slice(1), source: asset.content });
      }
    },
  };
}
