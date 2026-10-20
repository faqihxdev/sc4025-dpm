import { describe, expect, it } from 'vitest';
import { fingerprint } from '../scripts/static-assets';
import { assetUrl } from './assets';

describe('content-versioned assets', () => {
  it('keeps the same URL when bytes are unchanged', () => {
    const bytes = Buffer.from('the same image bytes');
    expect(fingerprint('images/drink-small.webp', bytes)).toBe(fingerprint('images/drink-small.webp', Buffer.from(bytes)));
  });

  it('changes the URL when bytes change', () => {
    expect(fingerprint('images/drink.webp', Buffer.from('old'))).not.toBe(fingerprint('images/drink.webp', Buffer.from('new')));
  });

  it('preserves the media directory, filename and type around its digest', () => {
    expect(fingerprint('fonts/manrope.woff2', Buffer.from('font'))).toMatch(/^\/media\/fonts\/manrope\.[a-f0-9]{12}\.woff2$/);
  });

  it('uses canonical public URLs outside a production build', () => {
    expect(assetUrl('/images/iced-americano.webp')).toBe('/images/iced-americano.webp');
    expect(assetUrl('/images/missing.webp')).toBe('/images/missing.webp');
  });
});
