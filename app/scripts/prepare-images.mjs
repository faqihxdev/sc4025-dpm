import {createHash} from 'node:crypto';
import {access, mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(appDirectory, 'public/images');
const options = {bannerOnly: false, bannerSource: null};
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--banner-only') options.bannerOnly = true;
  else if (args[index] === '--banner-source' && args[index + 1]) options.bannerSource = args[++index];
  else if (args[index].startsWith('--banner-source=')) options.bannerSource = args[index].slice('--banner-source='.length);
  else throw new Error(`Unknown or incomplete image preparation option: ${args[index]}`);
}
const verifiedOn = '2026-10-02';
const usAsset = 'https://cloudassets.starbucks.com/is/image/sbuxcorp/';
const sgOrigin = 'https://www.starbucks.com.sg';
const regionalNote = 'Official regional product reference. Appearance does not establish an identical Singapore recipe, serving size, nutrition or current stock.';
const editPrompt = 'Use case: precise-object-edit. This is the edit target for an educational drink-finder prototype. Remove ONLY the white Nutri-Grade nutrition badge to the left of the drink, including its letters, percentage and border. Fill that small badge area with the existing matching dark-green backdrop. Keep the entire drink, cup, handle, logo if present, ice, foam, shadows, camera angle, composition, lighting and colours unchanged. Keep the same square framing and drink position. Do not restyle or redesign anything, do not add text. The cup itself must remain unchanged.';
const specialEditPrompts = {
  'chamomile-tea': "Use case: precise-object-edit. Edit this product photograph for an educational prototype. Remove ONLY the white Nutri-Grade nutrition badge left of the drink and the red 'No added sugar' badge overlapping the lower right. Fill those badge areas with matching existing dark-green background and continue the existing glass edge where needed. Keep the drink, transparent glass mug, handle, liquid colour, reflections, shadows, camera angle, scale and composition unchanged. Same square framing. No new elements or text. Do not restyle or change the cup.",
  'iced-chocolate': 'Use case: precise-object-edit. Edit the product photograph for an educational prototype. Remove ONLY the white Nutri-Grade nutrition badge to the left of the drink, including letters, percentage and border. Replace that badge area with matching existing dark-green backdrop. Keep all parts of the iced chocolate, glass, ice, whipped topping, cocoa dusting, shadows, reflection, lighting, colour, camera angle, size, position and square composition unchanged. Do not restyle, alter the cup or add anything.',
};
const reviews = JSON.parse(await readFile(resolve(appDirectory, 'scripts/photo-reviews.json'), 'utf8'));
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const us = (id, productName, productId, form, asset) => ({
  id, productName,
  productSource: `https://www.starbucks.com/menu/product/${productId}/${form}`,
  observedUrl: `${usAsset}${asset}?wid=560&hei=560&qlt=85`,
  discoverySource: 'https://www.starbucks.com/apiproxy/v1/ordering/menu',
  identityStatus: 'official-regional-product-reference', note: regionalNote,
});
const edited = (id, productName, productPath, imagePath, note = '') => ({
  id, productName, productSource: `${sgOrigin}${productPath}`,
  observedUrl: `${sgOrigin}${imagePath}`,
  editedFile: `assets/image-edits/${id}.png`,
  identityStatus: 'label-removal-illustration',
  note: `Built-in image editing removed nutrition badges from the Singapore reference. An illustrative edit, not an unmodified official photo or nutrition evidence. ${note}`.trim(),
});

// URLs were observed on the named official page or the public US menu API.
// Regional photos are not evidence for Singapore ingredients or nutrition.
const sources = [
  us('iced-americano', 'Iced Americano', 406, 'iced', 'IcedCaffeAmericano'),
  us('americano', 'Caffè Americano', 406, 'hot', 'CaffeAmericano'),
  us('iced-latte', 'Iced Caffè Latte', 407, 'iced', 'IcedCaffeLatte'),
  us('latte', 'Caffè Latte', 407, 'hot', 'CaffeLatte'),
  edited('oat-latte', 'Oatmilk Latte', '/oatmilk-latte', '/media/nutri-grade/website/website%20oatmilk%20latte%20b2.jpg'),
  edited('vanilla-oat-iced-latte', 'Vanilla Oatmilk Iced Shaken Latte (Less Sweet)', '/menu/beverages/espresso-beverages/vanilla-oatmilk-iced-shaken-latte-less-sweet', '/media/2025/winter/site%20salted%20caramel%20isl%20w%20NG%20.jpg', 'The vanilla and salted-caramel pages share this source; it is a shared iced-shaken-latte reference, not exact-flavour proof.'),
  us('black-tea-lemonade', 'Iced Shaken Black Tea Lemonade', 458, 'iced', 'IcedBlackTeaLemonade'),
  us('strawberry-acai-lemonade', 'Strawberry Açai with Lemonade', 2122677, 'iced', 'StrawberryAcaiLemonadeRefreshers'),
  us('iced-matcha-latte', 'Iced Matcha Latte', 468, 'iced', 'IcedMatchaTeaLatte'),
  us('hot-chocolate', 'Signature Hot Chocolate', 471, 'hot', 'SBX20190617_SignatureHotChocolate'),
  edited('chamomile-tea', 'Chamomile Tea', '/menu/beverages/teavana-tea/chamomile-tea', '/media/nutri-grade/website/website%20brewed%20chamomile%20tea%20a0.jpg'),
  edited('pistachio-oat-matcha', 'Iced Pistachio Oatmilk Matcha Latte', '/menu/coffee-products/teavana-teas/iced-pistachio-oatmilk-matcha-latte', '/media/2025/Autumn/Drinks/Iced-Pistachio-Oatmilk-Matcha-Latte-Green_750x750.jpg'),
  us('cold-brew', 'Cold Brew', 2121255, 'iced', 'ColdBrew'),
  us('vanilla-sweet-cream-cold-brew', 'Vanilla Sweet Cream Cold Brew', 2121859, 'iced', 'SBX20190607_VanillaSweetCreamColdBrew'),
  us('caramel-macchiato', 'Caramel Macchiato', 413, 'hot', 'SBX20211029_CaramelMacchiato'),
  us('iced-mocha', 'Iced Mocha', 408, 'iced', 'IcedCaffeMocha%E2%80%8B'),
  us('flat-white', 'Flat White', 565, 'hot', 'SBX20230406_FlatWhite'),
  us('chai-latte', 'Chai Tea Latte', 466, 'hot', 'SBX20190624_ChaiLatte'),
  us('iced-chai-latte', 'Iced Chai Tea Latte', 466, 'iced', 'IcedChaiTeaLatte'),
  {...us('hibiscus-tea-lemonade', 'Iced Shaken Hibiscus Tea Lemonade', 462, 'iced', 'IcedPassionTangoTeaLemonade'), note: `${regionalNote} US Passion Tango is a representative hibiscus-tea-lemonade photo, not proof of the same tea blend.`},
  us('mango-dragonfruit-lemonade', 'Mango Dragonfruit with Lemonade', 2122726, 'iced', 'MangoDragonfruitLemonadeRefreshers'),
  edited('iced-chocolate', 'Signature Iced Chocolate', '/menu/beverages/other-beverages/signature-iced-chocolate', '/media/nutri-grade/website/website%20iced%20chocolate%20d8.jpg'),
  {...us('vanilla-creme-frappuccino', 'Vanilla Crème Frappuccino', 440, 'iced', 'SBX20181113_VanillaBeanFrapp'), note: `${regionalNote} US Vanilla Bean Crème is a representative vanilla crème photo.`},
  {
    id: 'chocolate-chip-creme-frappuccino', productName: 'Chocolate Chip Crème Frappuccino',
    productSource: 'https://www.starbucks.com.au/product/double-chocolate-chip-frappuccino/',
    observedUrl: 'https://bunny-wp-pullzone-8lgzf5kyx3.b-cdn.net/assets/uploads/2023/08/sbx20190528-30305-doublechocolatychipcremefrapp-onwhite-corelib-srgb-1.png',
    identityStatus: 'official-regional-product-reference',
    note: `${regionalNote} Australian Double Chocolate Chip is a representative regional chocolate-chip photo. Genuine transparency is retained so the full cup sits on the app's green background.`,
  },
];

async function download(url) {
  const response = await fetch(url, {
    headers: {'User-Agent': 'SC4025 educational drink finder image preparation'},
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Image download failed: ${response.status} ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error(`Empty image response: ${url}`);
  return buffer;
}

async function preparePhoto(source) {
  const originalInput = await download(source.observedUrl);
  const input = source.editedFile ? await readFile(resolve(appDirectory, source.editedFile)) : originalInput;
  const original = await sharp(input).metadata();
  const outputs = [];
  for (const width of [560, 240]) {
    const filename = `${source.id}${width === 240 ? '-small' : ''}.webp`;
    const {data, info} = await sharp(input).rotate()
      .resize({width, height: width, fit: 'inside', withoutEnlargement: true})
      .webp({quality: 78, effort: 6}).toBuffer({resolveWithObject: true});
    await writeFile(resolve(outputDirectory, filename), data);
    outputs.push({path: `/images/${filename}`, width: info.width, height: info.height, bytes: data.length, sha256: sha256(data), format: info.format});
  }
  const inputHash = sha256(input);
  const record = {
    id: source.id, productName: source.productName, productSource: source.productSource,
    observedUrl: source.observedUrl, discoverySource: source.discoverySource,
    observedOn: verifiedOn, downloadedOn: new Date().toISOString(),
    source: {width: original.width, height: original.height, bytes: input.length, sha256: inputHash, format: original.format},
    originalPhotoSha256: sha256(originalInput),
    edit: source.editedFile ? {file: source.editedFile, method: 'Built-in image_gen precise-object-edit', prompt: specialEditPrompts[source.id] || editPrompt} : undefined,
    identityStatus: source.identityStatus, note: source.note,
    visualQa: reviews[source.id] === inputHash
      ? `Prepared whole-image photo visually reviewed ${verifiedOn} for this source hash: drink identity, cup fit, proportions, background compatibility and absence of nutrition overlays checked.`
      : 'New or changed image: visual review required before use.',
    outputs,
  };
  console.log(`${source.id}: ${outputs.map(o => `${o.width}px ${o.bytes} B`).join(', ')}`);
  return record;
}

const originalBannerFile = 'assets/image-edits/finder-drinks.png';
const botanicalBannerFile = 'assets/image-edits/finder-drinks-botanical.png';
const originalBannerPrompt = 'Use case: compositing. Create a square product-photo group for a mobile drink-finder banner, using the three supplied drink references. Arrange the same green matcha drink in the front centre, with the same pink strawberry iced drink slightly behind on the right and the same dark iced Americano slightly behind on the left. Preserve each drink\'s appearance, colour, cup shape, contents and existing logo. All three drinks must be clearly recognisable, with only slight overlap; show their full tops and bases. Use the same uniform Starbucks dark-green backdrop (#1e3932), with subtle natural shadows. Tight composition: the group should occupy about 85% of image width and 75% of image height, centred. Keep all cups within a circular safe area so a round UI crop does not cut their tops or bases. No Nutri-Grade badges, captions, extra text, extra props or extra logos. Product photography, not illustration.';
const botanicalBannerPrompt = 'Edit the provided banner reference using background-extraction / compositing. Create ONLY a standalone left-hand botanical drinks illustration from this reference, tightly framed in a square, on a true transparent background. Preserve the attractive composition and realistic product look: a tall dark iced coffee at back-left, tall pink strawberry iced drink at back-right, and a larger green matcha latte in front, all with intact cup tops and bases. Preserve the existing green mermaid emblem on the matcha cup. Keep the dark forest-green organic blob behind the drinks, the pale sage organic blob, tasteful leaves along the left and lower right, four tiny sage dots near the top-left, and the fine curved green stroke at the lower-right. The artwork should fill the square generously with very little empty transparent margin, readable when displayed at 145 pixels. Match the reference\'s warm natural lighting and botanical Starbucks-style palette. REMOVE the entire cream rectangular banner background and REMOVE all title, body text, green CTA button, spark icon, and any other UI. No new text, no watermark, no rectangular backdrop. Only the three drinks and botanical decorative cluster on transparent alpha. This is an editable asset for a mobile banner whose typography and button will be real HTML.';

async function prepareBanner() {
  let sourceFile = options.bannerSource;
  if (sourceFile) {
    sourceFile = [originalBannerFile, botanicalBannerFile].find(file => resolve(appDirectory, file) === resolve(appDirectory, sourceFile));
    if (!sourceFile) throw new Error('Banner source must be the preserved original or botanical sibling PNG.');
  } else {
    try { await access(resolve(appDirectory, botanicalBannerFile)); sourceFile = botanicalBannerFile; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      sourceFile = originalBannerFile;
    }
  }
  const input = await readFile(resolve(appDirectory, sourceFile));
  const source = await sharp(input).metadata();
  const botanical = sourceFile === botanicalBannerFile;
  if (botanical && !source.hasAlpha) throw new Error('The botanical banner must retain its generated transparency.');
  const otherImages = (await readdir(outputDirectory)).filter(file => file.endsWith('.webp') && !/^finder-drinks(?:-small)?\.webp$/.test(file));
  const otherBytes = (await Promise.all(otherImages.map(async file => (await stat(resolve(outputDirectory, file))).size))).reduce((sum, size) => sum + size, 0);
  const allowance = Math.min(22_000, 250_000 - otherBytes);
  const alphaQuality = botanical ? 10 : 100;
  let prepared;
  let quality;
  for (const candidate of [75, 65, 55, 45, 40, 35]) {
    const pair = [];
    for (const width of [400, 200]) {
      const filename = `finder-drinks${width === 200 ? '-small' : ''}.webp`;
      const {data, info} = await sharp(input).rotate()
        .resize({width, height: width, fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}})
        .webp({quality: candidate, alphaQuality, effort: 6}).toBuffer({resolveWithObject: true});
      pair.push({filename, data, info});
    }
    if (pair.reduce((sum, output) => sum + output.data.length, 0) <= allowance) { prepared = pair; quality = candidate; break; }
  }
  if (!prepared) throw new Error(`Banner cannot meet its ${allowance} B allowance without a lower-quality encoding. Existing outputs were left unchanged.`);
  const outputs = [];
  for (const {filename, data, info} of prepared) {
    await writeFile(resolve(outputDirectory, filename), data);
    outputs.push({path: `/images/${filename}`, width: info.width, height: info.height, bytes: data.length, sha256: sha256(data), format: info.format, hasAlpha: (await sharp(data).metadata()).hasAlpha});
  }
  const prompt = botanical ? botanicalBannerPrompt : originalBannerPrompt;
  const sourceSha256 = sha256(input);
  const banner = {
    sourceFile,
    method: botanical ? 'Built-in image_gen background-extraction / compositing of a user-supplied banner reference, with transparent_background true.' : 'Built-in image_gen compositing of three catalogue references: pistachio oat matcha, strawberry acai lemonade and iced Americano.',
    prompt, sourceSha256,
    generatedSource: {
      tool: 'Built-in image_gen', mode: botanical ? 'edit: background-extraction / compositing' : 'compositing',
      sourceFile, sourceSha256, transparentBackground: botanical,
      ...(botanical ? {reference: 'User-supplied banner reference in the current task', originalArtifact: 'exec-8dc97b26-ac9b-4d0e-9bf1-eb1c02f7ea26.png', preservedOriginal: originalBannerFile} : {}),
    },
    source: {width: source.width, height: source.height, bytes: input.length, format: source.format, hasAlpha: source.hasAlpha},
    encoding: {quality, alphaQuality, effort: 6, alphaPreserved: Boolean(source.hasAlpha)},
    note: botanical ? 'Illustrative generated botanical banner art, not official Starbucks campaign photography or recipe evidence. The transparent composition supplies only artwork; banner copy and controls are real HTML.' : 'Illustrative generated composition, not official Starbucks campaign photography. Visually reviewed for three distinct drinks, full cups and circular crop fit.',
    outputs,
  };
  console.log(`Prepared banner only from ${sourceFile}: ${outputs.map(output => `${output.width}px ${output.bytes} B`).join(', ')}; quality ${quality}, alphaQuality ${alphaQuality}. All WebPs: ${otherBytes + outputs.reduce((sum, output) => sum + output.bytes, 0)} B / 250000 B.`);
  return banner;
}

await mkdir(outputDirectory, {recursive: true});
if (options.bannerOnly) {
  const manifestPath = resolve(outputDirectory, 'manifest.json');
  const existing = JSON.parse(await readFile(manifestPath, 'utf8'));
  existing.banner = await prepareBanner();
  await writeFile(manifestPath, `${JSON.stringify(existing, null, 2)}\n`);
  process.exit(0);
}
const photographs = [];
for (const source of sources) photographs.push(await preparePhoto(source));
const banner = await prepareBanner();
const logoUrl = `${sgOrigin}/StarbucksTheme/img/logo.svg`;
const logo = await download(logoUrl);
if (!logo.toString('utf8').includes('<svg')) throw new Error('Official logo did not return SVG');
await writeFile(resolve(outputDirectory, 'starbucks-logo.svg'), logo);
const manifest = {
  title: 'Starbucks reference photos and label-removal illustrations for the SC4025 educational prototype',
  preparedOn: new Date().toISOString(),
  method: 'Whole-image proportional resize and WebP conversion. Five Singapore reference photos were edited with built-in image generation to remove nutrition badges; other photos are official regional references. No photo supplies recipe or nutrition data.',
  nutritionNote: 'Displayed photos have no Nutri-Grade overlays. Nutrition is separately sourced from Singapore product-page tables; regional photos and illustrative edits are not nutrition or serving-size evidence.',
  attribution: 'Starbucks regional websites. Underlying photographs and logo belong to their respective rights holders.',
  licence: 'Unknown. Public availability does not establish reuse permission. Prepared for an educational course prototype.',
  photographs,
  banner,
  logo: {path: '/images/starbucks-logo.svg', observedUrl: logoUrl, productSource: `${sgOrigin}/menu/beverages/`, observedOn: verifiedOn, bytes: logo.length, sha256: sha256(logo), format: 'svg'},
};
await writeFile(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared ${photographs.length} photographs in two local sizes, plus the SVG logo.`);
