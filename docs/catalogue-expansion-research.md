# Catalogue expansion and photo research

Checked on 2 October 2026. The approved catalogue is **24 Singapore recipes**, not a combined international menu. Keep recipe descriptions and published nutrition tied to Singapore product pages. International photos are regional visual references, not evidence that the Singapore recipe has the same ingredients, toppings, nutrition, size or price.

## Twelve additions

The [Singapore beverage index](https://www.starbucks.com.sg/menu/beverages/) links to all twelve entries below. Sugar values are published **total sugar in grams per 100 mL of default preparation before addition of ice**. This matches the original catalogue's basis. It does not measure perceived sweetness, serving-total sugar or customisation nutrition.

`No coffee listed` and `No milk listed` describe the source's stated recipe. They do not guarantee a complete ingredient list, an allergen-free product or a caffeine-free drink. Milk in an otherwise sparse description can be supported by the page's published lactose value. Do not infer a milk fat level unless the description supplies it.

| ID | Official Singapore name and source | Temperature basis | Coffee basis | Milk basis | Source-supported recipe summary | Sugar, g/100 mL |
| --- | --- | --- | --- | --- | --- | ---: |
| `cold-brew` | [Cold Brew](https://www.starbucks.com.sg/menu/beverages/nitro-cold-brew-brewed-coffee/cold-brew) | Iced is a prepared demo setting, not stated serving temperature | Coffee | No milk listed | Coffee steeped in cool water for 20 hours | 0 |
| `vanilla-sweet-cream-cold-brew` | [Vanilla Sweet Cream Cold Brew](https://www.starbucks.com.sg/menu/beverages/nitro-cold-brew-brewed-coffee/vanilla-sweet-cream-cold-brew) | Iced is a prepared demo setting, not stated serving temperature | Cold brew coffee | Sweet cream, lactose 0.4 g/100 mL | Cold brew with house-made vanilla sweet cream | 7.2 |
| `caramel-macchiato` | [Caramel Macchiato](https://www.starbucks.com.sg/menu/beverages/espresso-beverages/caramel-macchiato) | Steamed milk | Espresso | Steamed milk | Espresso, steamed milk, vanilla-flavoured syrup and caramel drizzle | 8.5 |
| `iced-mocha` | [Iced Mocha](https://www.starbucks.com.sg/menu/beverages/espresso-beverages/iced-mocha) | Iced title and ice in description | Espresso | Milk | Espresso, bittersweet mocha sauce, milk and ice. Whipped cream is not stated. | 8.8 |
| `flat-white` | [Flat White](https://www.starbucks.com.sg/menu/beverages/espresso-beverages/flat-white) | Steamed milk | Espresso | Whole milk | Espresso and steamed whole milk. Ristretto is not stated. | 3.3 |
| `chai-latte` | [Chai Tea Latte](https://www.starbucks.com.sg/menu/beverages/teavana-tea/chai-tea-latte) | Steamed milk | No coffee listed | Milk | Black tea, cinnamon, clove, other spices, steamed milk and foam | 7.1 |
| `iced-chai-latte` | [Iced Chai Tea Latte](https://www.starbucks.com.sg/menu/beverages/other-beverages/iced-chai-tea-latte) | Iced title | No coffee listed | Dairy basis from lactose 2.9 g/100 mL | Black tea with cardamom, cinnamon and black pepper. The description is incomplete; it does not name clove. | 14.4 |
| `hibiscus-tea-lemonade` | [Iced Shaken Hibiscus Tea Lemonade](https://www.starbucks.com.sg/menu/beverages/teavana-tea/iced-shaken-hibiscus-tea-lemonade) | Iced title and ice in description | No coffee listed | No milk listed | Hibiscus, lemon, lemonade from the title, and ice. Apple and lemongrass are not stated. | 7.4 |
| `mango-dragonfruit-lemonade` | [Mango Dragonfruit with Lemonade](https://www.starbucks.com.sg/mango-dragonfruit-with-lemonade) | Ice explicitly stated | **Green coffee extract explicitly present** | No milk listed | Mango and dragonfruit, lemonade, ice and fruit chunks. Must fail No coffee. | 7 |
| `iced-chocolate` | [Signature Iced Chocolate](https://www.starbucks.com.sg/menu/beverages/other-beverages/signature-iced-chocolate) | Iced title and description | No coffee listed | Dairy basis from lactose 4.3 g/100 mL | European-style iced chocolate finished with cocoa powder. Whipped cream is not stated. | 11.8 |
| `vanilla-creme-frappuccino` | [Vanilla Crème Frappuccino](https://www.starbucks.com.sg/menu/beverages/frappuccino-blended-beverages/vanilla-creme-frappuccino) | Ice explicitly stated | No coffee listed | Low-fat milk, whipped cream | Vanilla, low-fat milk and ice with whipped cream | 7.7 |
| `chocolate-chip-creme-frappuccino` | [Chocolate Chip Crème Frappuccino](https://www.starbucks.com.sg/menu/beverages/frappuccino-blended-beverages/chocolate-chip-creme-frappuccino) | Ice explicitly stated | No coffee listed | Low-fat milk | Mocha-flavoured sauce, chocolate chips, low-fat milk and ice. Whipped cream is not stated. | 8.3 |

For implementation, use `coffee` for the five coffee additions, `tea` for both chai drinks and hibiscus tea, `refreshers` for mango dragonfruit, `chocolate` for iced chocolate, and a separate `blended` category for both crème Frappuccinos. Vanilla is not a chocolate or tea recipe. Goal tags remain team classifications. A cold drink can be tagged refreshing without claiming a measured effect.

All twelve have unknown verified fixed-size prices and verified outlet availability. Preserve `verifiedPriceCents: null` and `verifiedSize: null`. Separate simulated Tall prices and stock can support the prototype. The page's nutrition must not be multiplied by cup capacity to fabricate serving totals.

## Clean-photo sources

The first-party [US menu API](https://www.starbucks.com/apiproxy/v1/ordering/menu) publishes each product's name, form, product URI and `imageURL`. Asset URLs below were observed in that response, not generated from guessed filenames. The [UK drink index](https://www.starbucks.co.uk/menu/drinks) and its category pages also expose named product-image pairs on `digitalassets.starbucks.eu`. UK nutrition uses serving totals, with `amountPer100` null in the inspected product data. Australia also supplies serving-total nutrition. Neither replaces Singapore's per100mL data.

An official international product with the same name is a **regional recipe reference**, not proof of an identical Singapore formulation. Retain the Singapore source URL for ingredients and sugar. An image with the Nutri-Grade label removed must be described as an **illustrative edited photo for the prototype**, not an unmodified official asset. Do not use a label in a source photo as a substitute for the product page's nutrition table.

### Mapping the original twelve

| Existing ID | Observed clean international candidate | Status |
| --- | --- | --- |
| `iced-americano` | [US Iced Caffè Americano photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/IcedCaffeAmericano) | Same named regional drink family |
| `americano` | [US Caffè Americano photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/CaffeAmericano) | Same named regional drink family |
| `iced-latte` | [US Iced Caffè Latte photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/IcedCaffeLatte) | Same named regional drink family |
| `latte` | [US Caffè Latte photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/CaffeLatte) | Same named regional drink family |
| `oat-latte` | No exact named clean recipe photo established | Keep the Singapore recipe identity. An edited [original SG source](https://www.starbucks.com.sg/media/nutri-grade/website/website%20oatmilk%20latte%20b2.jpg) is illustrative, or explicitly label a generic latte photo as representative. |
| `vanilla-oat-iced-latte` | [AU Vanilla Iced Shaken Espresso photo](https://bunny-wp-pullzone-8lgzf5kyx3.b-cdn.net/assets/uploads/2024/02/product-beverage-iced-shaken-vanilla.png) | Visually clean, but the [AU recipe](https://www.starbucks.com.au/product/vanilla-iced-shaken-espresso/) adds cinnamon and a choice of milk. Not exact oat or Less Sweet. An edit of the original SG photo preserves visual recipe identity more closely. |
| `black-tea-lemonade` | [US Iced Black Tea Lemonade photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/IcedBlackTeaLemonade) | Same named regional drink family |
| `strawberry-acai-lemonade` | [US Strawberry Açaí Lemonade Refresher photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/StrawberryAcaiLemonadeRefreshers) | Same named regional drink family, not the newer Energy Refresher recipe |
| `iced-matcha-latte` | [US Iced Matcha Latte photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/IcedMatchaTeaLatte) | Same named regional drink family; use SG sugar, not US nutrition |
| `hot-chocolate` | [US Hot Chocolate photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/SBX20190617_SignatureHotChocolate) | Regional reference; a filename does not verify the exact Singapore Signature recipe |
| `chamomile-tea` | [HK Chamomile photo](https://www.starbucks.com.hk/media/catalog/product/5/d/5d00cfcb-acc7-4bbb-8237-f875ada082c9.jpg) | Clean image from [HK Chamomile Tea](https://www.starbucks.com.hk/en/chamomile-tea134.html), but only 143px and has a mug/flowers background. Do not substitute US Chamomile Mint Blossom, a different blend. An edit of the original SG photo is illustrative. |
| `pistachio-oat-matcha` | [AU Iced Pistachio Matcha photo](https://bunny-wp-pullzone-8lgzf5kyx3.b-cdn.net/assets/uploads/2026/08/product-beverage-iced-pistachio-matcha.png) | Visually clean but **not exact**. The [AU recipe](https://www.starbucks.com.au/product/iced-pistachio-flavoured-matcha-latte/) has milk-containing white-chocolate sauce and a thick pistachio cold foam. The [SG original](https://www.starbucks.com.sg/media/2025/Autumn/Drinks/Iced-Pistachio-Oatmilk-Matcha-Latte-Green_750x750.jpg) visibly embeds Nutri-Grade. Prefer an illustrative edit of that SG original over an unlabelled regional substitution. |

### Mapping the twelve additions

| New ID | Observed clean candidate | Status |
| --- | --- | --- |
| `cold-brew` | [US Cold Brew photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/ColdBrew) | Same named regional drink family |
| `vanilla-sweet-cream-cold-brew` | [US Vanilla Sweet Cream Cold Brew photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/SBX20190607_VanillaSweetCreamColdBrew) | Same named regional drink family, not the separate nondairy variant |
| `caramel-macchiato` | [US Caramel Macchiato photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/SBX20211029_CaramelMacchiato) | Same named regional drink family |
| `iced-mocha` | [US Iced Caffè Mocha photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/IcedCaffeMocha%E2%80%8B), from [US product](https://www.starbucks.com/menu/product/408/iced) | Adopted regional reference, not proof of SG toppings. The encoded trailing zero-width character belongs to the published asset URL. |
| `flat-white` | [US Flat White photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/SBX20230406_FlatWhite) | Regional reference; US ristretto wording must not be copied into SG recipe notes |
| `chai-latte` | [US Chai Latte photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/SBX20190624_ChaiLatte) | Regional reference |
| `iced-chai-latte` | [US Iced Chai Latte photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/IcedChaiTeaLatte) | Regional reference |
| `hibiscus-tea-lemonade` | [US Passion Tango Tea Lemonade photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/IcedPassionTangoTeaLemonade), from [US product](https://www.starbucks.com/menu/product/462/iced) | Adopted representative hibiscus-tea-lemonade photo, not evidence of an identical blend. Do not import another market's tea ingredients. |
| `mango-dragonfruit-lemonade` | [US Mango Dragonfruit Lemonade Refresher photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/MangoDragonfruitLemonadeRefreshers) | Regional reference, not the separate Energy Refresher recipe |
| `iced-chocolate` | [AU Classic Iced Chocolate photo](https://bunny-wp-pullzone-8lgzf5kyx3.b-cdn.net/assets/uploads/2023/11/Classic-Iced-Chocolate.png), from [AU product](https://www.starbucks.com.au/product/classic-iced-chocolate/) | Visually checked and label-free, but it has a whipped-cream heap. SG describes cocoa dusting. Prefer an illustrative edit of the [observed SG original](https://www.starbucks.com.sg/media/nutri-grade/website/website%20iced%20chocolate%20d8.jpg) to preserve visual recipe identity. |
| `vanilla-creme-frappuccino` | [US Vanilla Bean Crème photo](https://cloudassets.starbucks.com/is/image/sbuxcorp/SBX20181113_VanillaBeanFrapp), from [US product](https://www.starbucks.com/menu/product/440/iced) | Adopted label-free regional reference, not established as the exact SG flavour formulation. |
| `chocolate-chip-creme-frappuccino` | [AU Double Chocolate Chip Frappuccino photo](https://bunny-wp-pullzone-8lgzf5kyx3.b-cdn.net/assets/uploads/2023/08/sbx20190528-30305-doublechocolatychipcremefrapp-onwhite-corelib-srgb-1.png), from [AU product](https://www.starbucks.com.au/product/double-chocolate-chip-frappuccino/) | Visually checked, label-free cutout. Regional double-chip version with visible whipped cream and drizzle, neither separately stated on the SG page. |

Visual checks also confirmed label-free UK Iced Americano, Iced Latte and Caramel Macchiato photos. Their backgrounds are green rather than transparent, so they are not interchangeable with a transparent cutout without a layout decision. The US asset list was independently extracted from its first-party API; this note does not claim every US image was individually inspected here.

The implemented set was then reviewed as a whole-photo contact sheet. Five Singapore references (oat latte, vanilla oat shaken latte, chamomile, pistachio oat matcha and iced chocolate) received badge-removal edits through the built-in image tool. The other nineteen use official regional photos. The AU chocolate-chip PNG retains genuine transparency. Per-photo UI framing keeps cups larger and centred inside the same circular crop; source photographs remain unchanged. The banner is a generated composition of three catalogue references. Final sources, SHA-256 hashes, review status and edit prompts are recorded in [the image manifest](../app/public/images/manifest.json). The source edits live in `app/assets/image-edits/`; prepared display assets live in `app/public/images/`.

## Implementation boundaries

- Keep exact source URLs and the Singapore nutrition basis with each recipe. Regional photos need a concise reference-photo caveat. Edited photos need a separate edited/illustrative status.
- Keep source facts separate from team goal tags and simulated prices, sizes and stock. Do not infer ingredients from image filenames or from a recipe in a different country.
- Refreshers with green coffee extract must fail No coffee. Mocha-flavoured sauce in a chocolate crème recipe does not itself establish espresso.
- The [Singapore menu](https://www.starbucks.com.sg/menu/beverages/) and [Australia allergen guidance](https://www.starbucks.com.au/starbucks-our-food-and-nutrition/) warn about shared equipment. Neither a named oat recipe nor a photo proves allergen safety.
- These assets remain Starbucks-owned. Accessible first-party assets are source evidence, not a redistribution licence or a claim of official app affiliation.
