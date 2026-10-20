# Drink finder MVP research

Checked on 2 October 2026 for the Singapore catalogue. This note supports implementation of the agreed [PRD](drink-finder-prd.md). Wireframes and the group's problem evidence are deferred; this research does not establish demand for the feature.

Implementation update, 3 October: Tall remains the discovery default, but the drink page now offers simulated size options. The [size policy](drink-sizes.md) supersedes the fixed-size implementation proposal below; the recipe and nutrition evidence is unchanged.

## Catalogue findings

There is enough official product information to prepare a small recipe catalogue. The public Singapore product pages publish descriptions and, for most drinks, default-preparation nutrition per 100 mL. They do not expose a complete ingredient list, exact serving-size price or live outlet stock.

Use the 12 rows below as proposed recipe identities. They are verified Singapore menu entries, but the implementation still needs a fixed size and a verified or explicitly simulated price for each. The table is source research, not a claim that every attribute is ready for a strict filter.

Sugar is **total sugar in grams per 100 mL of default preparation, before addition of ice**, exactly the basis stated on the product pages. It is not serving-total sugar, added sugar or a perceived-sweetness score. Do not multiply it by cup capacity, compare it with custom recipes, or label milk drinks sugar-free.

Coffee and milk entries below interpret the stated recipe description. `No coffee listed` and `No milk listed` are weaker than a complete ingredient or allergen declaration. Keep that evidence status in the data. Excluding coffee does not establish caffeine-free.

| Proposed entry and official source | Temperature evidence | Coffee evidence | Milk basis | Ingredient or sweetness evidence | Published total sugar |
| --- | --- | --- | --- | --- | ---: |
| [Iced Americano](https://www.starbucks.com.sg/menu/beverages/espresso-beverages/iced-americano) | Iced explicitly | Espresso | No milk listed | Espresso, water, ice. Added-sweetener status not separately declared. | 0 |
| [Caffè Americano](https://www.starbucks.com.sg/menu/beverages/espresso-beverages/caffe-americano) | Hot water explicitly | Espresso | No milk listed | Espresso, hot water. Added-sweetener status not separately declared. | 0 |
| [Iced Caffè Latte](https://www.starbucks.com.sg/menu/beverages/espresso-beverages/iced-caffe-latte) | Iced explicitly | Espresso | Milk, lactose reported | Espresso and milk. Exact milk fat level and added-sweetener status unknown. | 4 |
| [Caffè Latte](https://www.starbucks.com.sg/menu/beverages/espresso-beverages/caffe-latte) | Steamed milk, warm description | Espresso | Milk, lactose reported | Espresso, steamed milk, foam. Exact milk fat level and added-sweetener status unknown. | 3.5 |
| [Oatmilk Latte](https://www.starbucks.com.sg/oatmilk-latte) | Product description does not state serving temperature | Espresso | Oatmilk | Espresso and oatmilk. This is already a named oat recipe. Added-sweetener status unknown. | 2.2 |
| [Vanilla Oatmilk Iced Shaken Latte (Less Sweet)](https://www.starbucks.com.sg/menu/beverages/espresso-beverages/vanilla-oatmilk-iced-shaken-latte-less-sweet) | Iced explicitly | Espresso | Oatmilk | Espresso, oatmilk and vanilla. `Less Sweet` is the official recipe name, not our taste measurement. | 3.9 |
| [Cold Brew](https://www.starbucks.com.sg/menu/beverages/nitro-cold-brew-brewed-coffee/cold-brew) | Cool-water brewing verified; serving temperature not explicitly stated | Coffee product and category | No milk listed | Brewed for 20 hours. Added-sweetener status not separately declared. | 0 |
| [Iced Shaken Black Tea Lemonade](https://www.starbucks.com.sg/menu/beverages/teavana-tea/iced-shaken-black-tea-lemonade) | Iced explicitly | No coffee listed | No milk listed | Black tea, ice and lemonade named in title. Full formulation unavailable. Tea does not establish caffeine-free. | 7.8 |
| [Strawberry Açai with Lemonade](https://www.starbucks.com.sg/strawberry-acai-with-lemonade) | Refreshment wording; iced serving not explicitly stated in description | **Green coffee extract explicitly present** | No milk listed | Fruit juice, strawberry, açai, lemonade, green coffee extract. Must fail coffee exclusion. | 7.1 |
| [Iced Matcha Latte](https://www.starbucks.com.sg/menu/beverages/other-beverages/iced-matcha-latte) | Iced explicitly | No coffee listed | Milk, lactose reported | Microground matcha and milk. An unsweetened option is explicitly offered; its nutrition and price are not supplied. | 9 |
| [Signature Hot Chocolate](https://www.starbucks.com.sg/menu/beverages/other-beverages/signature-hot-chocolate) | Hot explicitly | No coffee listed | Steamed milk and whipped cream | Vanilla, mocha-flavoured syrup, sweetened whipped cream. Mocha syrup here does not establish espresso. | 11.4 |
| [Chamomile Tea](https://www.starbucks.com.sg/menu/beverages/teavana-tea/chamomile-tea) | Full-leaf brewed tea category; hot serving not explicitly stated | No coffee listed | No milk listed | Chamomile, rose petals and herbs. No nutrition values or added-sweetener declaration supplied. | Unknown |

For better coverage of iced, oat and no-coffee preferences, I recommend replacing Cold Brew with [Iced Pistachio Oatmilk Matcha Latte](https://www.starbucks.com.sg/menu/coffee-products/teavana-teas/iced-pistachio-oatmilk-matcha-latte). It explicitly uses matcha and pistachio-flavoured oatmilk, with no coffee listed, and publishes 4.4 g total sugar per 100 mL on the same default basis. The [Singapore launch page](https://www.starbucks.com.sg/menu/beverages/matcha-love) calls it a permanent menu item. Nut and complete allergen status remain unverified.

## Size, milk and stock

- Use **Tall, 12 oz** as the proposed fixed demo size. The [store FAQ](https://www.starbucks.com.sg/frequently-asked-questions-in-our-stores) defines Tall as 355 mL; the [Mobile Order & Pay FAQ](https://www.starbucks.com.sg/frequently-asked-questions-mobile-order-pay) gives 354 mL. Displaying 12 oz avoids this rounding discrepancy. These general size definitions do not prove each recipe's current outlet availability in that size.
- The [Singapore customisation page](https://www.starbucks.com.sg/menu/beverages/starbucks-for-me) offers soy, coconut, almond and oat alternatives, and Not Sweet, Less Sweet and Regular choices. This proves customisation is offered, not the exact composition or nutrition of every customised recipe. Prefer named oat recipes for this MVP.
- The [store FAQ](https://www.starbucks.com.sg/frequently-asked-questions-in-our-stores) says replacing a beverage's original milk is chargeable. It does not state the surcharge. Do not derive preset-variant prices by adding an invented amount.
- `Milk basis = oat` describes the selected recipe. It must not become `allergen safe`, `dairy-free certified` or `vegan`. The [official menu](https://www.starbucks.com.sg/menu/beverages/) says shared equipment prevents Starbucks from guaranteeing products free of allergens. Milk fat level, syrup composition and cross-contact cannot be filled from another country's menu.
- The [Mobile Order & Pay FAQ](https://www.starbucks.com.sg/frequently-asked-questions-mobile-order-pay) says menu availability depends on the selected store. The MVP's one-store inventory must therefore remain a prepared simulation, consistently used by browsing, finder and cart.

## Data and question implications

Keep two records per attribute: its value and its basis, such as product description, default nutrition, team classification or demo fixture. Store exact source URL and the verification date. Use `unknown` rather than a guessed value.

| Preference | Practical implementation implication |
| --- | --- |
| Temperature | Iced and hot are strict requirements only when established for the stored recipe. Confirm remaining recipe temperatures from a merchant or app view, or document simulated recipe settings. Cold brewing alone does not prove serving temperature. |
| Coffee | Treat espresso, brewed coffee and green coffee extract as coffee ingredients. Explain that tea, matcha and chocolate can differ from coffee in caffeine content. Do not infer caffeine-free. |
| Sweetness | Proposed labels are Less sweet, Sweeter and Any. Published default sugar concentration can order comparable default recipes within a goal group, but it does not measure perceived sweetness. Preserve official recipe labels such as Less Sweet separately. Never apply a default value to an unsweetened customisation. |
| Milk | Use recipe-basis choices such as Any, Dairy milk, Oatmilk and No milk in the described recipe. Match the stated recipe basis, and exclude unknown milk status when a specific basis is requested. Oatmilk does not guarantee all sauces or toppings lack dairy, and is not an allergen or vegan certification. |
| Budget | Compare against the selected recipe's fixed price. Source size, store, channel and date together. A `from` price with unknown size cannot verify a fixed-size quote. Clearly marked simulated prices can support coding and tests. |

Goals are team classifications. An initial `refreshing` tag can use iced tea, fruity descriptions and cold recipe settings; `coffee boost` can use coffee recipes; `warm and comforting` can use verified warm recipes, chocolate or the source's comforting tea description. Neither goal tags nor ranking scores are first-party measurements, health claims or evidence of an energy effect. Keep them separate from sourced ingredients.

| Goal | Sample direct fit | Team rationale and boundary |
| --- | --- | --- |
| Refreshing | Iced Shaken Black Tea Lemonade; Iced Pistachio Oatmilk Matcha Latte | Iced tea, citrus or a product description explicitly describing refreshment. Iced latte is an alternative creamy choice. Confirm the recipe's cold serving setting first. |
| A coffee boost | Iced Americano; Caffè Americano; Caffè Latte | These are espresso drinks. The label indicates a coffee choice, not measured energy or a caffeine dose. Green coffee extract in a fruity Refresher does not establish an equivalent coffee experience. |
| Warm and comforting | Caffè Latte; Signature Hot Chocolate | Warm milk or hot chocolate is a direct fit for this team classification. Chamomile's official description supports comforting, but its serving temperature still needs confirmation. |

Apply hard filters before goal grouping. Exclude a recipe from confirmed matches when an attribute required by a selected preference is unknown. Explain recipe facts and partial goal fits from the stored evidence. A team classification must not become a measured match percentage.

## Product image references

These are the image URLs embedded in each official page's HTML, observed without downloading images. The team must decide how to use product images in the demo. An observed URL does not establish licensing permission or guarantee that the image shows the selected size or recipe.

| Recipe | Observed image URL |
| --- | --- |
| Iced Americano | https://www.starbucks.com.sg/media/nutri-grade/website/website%20iced%20americano.jpg |
| Caffè Americano | https://www.starbucks.com.sg/media/nutri-grade/website/website%20americano%20a0.jpg |
| Iced Caffè Latte | https://www.starbucks.com.sg/media/nutri-grade/website/website%20iced%20latte%20c0.jpg |
| Caffè Latte | https://www.starbucks.com.sg/media/nutri-grade/website/website%20latte%20c0.jpg |
| Oatmilk Latte | https://www.starbucks.com.sg/media/nutri-grade/website/website%20oatmilk%20latte%20b2.jpg |
| Vanilla Oatmilk Iced Shaken Latte (Less Sweet) | https://www.starbucks.com.sg/media/2025/winter/site%20salted%20caramel%20isl%20w%20NG%20.jpg |
| Cold Brew | https://www.starbucks.com.sg/media/nutri-grade/website/website%20cold%20brew%20a0.jpg |
| Iced Shaken Black Tea Lemonade | https://www.starbucks.com.sg/media/nutri-grade/website/website%20iced%20shaken%20black%20tea%20lemonade%20c8.jpg |
| Strawberry Açai with Lemonade | https://www.starbucks.com.sg/media/nutri-grade/website/website%20strawberry%20acai%20w%20lemonade%20c7.jpg |
| Iced Matcha Latte | https://www.starbucks.com.sg/media/nutri-grade/website/website%20iced%20pure%20matcha%20latte%20c5.jpg |
| Signature Hot Chocolate | https://www.starbucks.com.sg/media/nutri-grade/website/website%20chocolate%20d8.jpg |
| Chamomile Tea | https://www.starbucks.com.sg/media/nutri-grade/website/website%20brewed%20chamomile%20tea%20a0.jpg |
| Iced Pistachio Oatmilk Matcha Latte, proposed replacement | https://www.starbucks.com.sg/media/2025/Autumn/Drinks/Iced-Pistachio-Oatmilk-Matcha-Latte-Green_750x750.jpg |

The Vanilla page embeds a filename mentioning salted caramel. Visually verify that image before assigning it to the vanilla recipe. Do not infer a recipe change from the filename.

Catalogue evidence coverage: 13 official product pages, one official menu index, one official customisation page, two official FAQs and one official launch page, **18 distinct Singapore first-party pages** cited above. Exact fixed-size prices, full ingredient/allergen lists and live stock remain unverified. This does not block work with explicit demo fixtures.

## Price findings

The strongest accessible price source was the [Starbucks AMK Hub merchant menu on foodpanda](https://www.foodpanda.sg/restaurant/n9py/starbucks-amk-hub), checked on 2 October 2026. These are delivery-channel **starting prices**, not verified fixed-size or in-store quotes. Product-size options were not accessible during the research.

| Merchant recipe | Displayed starting price, SGD |
| --- | ---: |
| Caffè Americano / Iced Caffè Americano | 6.20 each |
| Caffè Latte / Iced Caffè Latte | 7.60 each |
| Oatmilk Latte | 8.70 |
| Vanilla Oatmilk Iced Shaken Latte, Less Sweet | 8.10 |
| Cold Brew | 7.00 |
| Iced Shaken Black Tea Lemonade | 7.20 |
| Strawberry Acai with Lemonade Starbucks Refreshers | 7.70 |
| Iced Matcha Latte | 8.60 |
| Signature Hot Chocolate | 8.30 |
| Chamomile Tea | 6.20 |

Recommendation: keep verified size-specific prices unknown until an app, menu-board or receipt source supplies recipe, size, store, channel and date together. Use separately marked simulated fixed-size prices for the demo and its budget tests. Do not copy these starting prices into a field labelled verified Tall price. The implementation now assigns separate simulated prices in `app/src/domain/catalogue.ts`; verified price and size fields remain unknown.

## Stack findings and decisions

The agreed catalogue, matching rules, prepared stock and demo cart can all run in the browser. This is an architectural inference from our scope, not a course requirement. A backend or database would become useful for shared editable data, real inventory, accounts or cross-device order storage, none of which is currently agreed.

| Part | Proposed choice | Reason |
| --- | --- | --- |
| Interface | React + TypeScript + Vite | Component-based UI and rapid iteration; types keep recipe data, answers and cart consistent. |
| Styling | Tailwind CSS | Responsive styling in the same components without a separate design export step. |
| Data and matching | Versioned typed catalogue + a pure TypeScript ranking function | One data source shared by Browse, Finder, details and cart; deterministic, testable recommendations. |
| Demo state | React state + sessionStorage | Chosen for same-tab refresh persistence, with a demo reset and no account. |
| Hosting | Cloudflare Workers Static Assets | Serve the compiled client app; a server-side Worker function is optional. |
| Verification | Rule tests and critical browser-flow checks | Cover the PRD acceptance criteria, especially hard filters, recovery and cart consistency. |

[Vite's deployment guide](https://vite.dev/guide/static-deploy.html) documents a static production build in `dist`; its preview server is for local inspection. [Tailwind's current Vite installation](https://tailwindcss.com/docs/installation/using-vite) uses the first-party Vite plugin and a CSS import. Exact package versions should be pinned when implementation starts, not inferred from old examples.

[Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/) supports a static-only app and SPA route fallback. Its [billing documentation](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) states that static requests are free and unlimited, with no additional asset-storage charge. Server-side Worker requests have separate limits/pricing; our scope does not require them. Deployment and account setup are deferred.

Faqih chose React + TypeScript + Vite with Tailwind, browser-only data/matching/cart, and current-session persistence on 2 October 2026. [sessionStorage documentation](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) confirms same-tab page-reload persistence and explains blocked-storage exceptions. Add a demo reset and an in-memory fallback. Cloudflare hosting configuration and deployment remain deferred.

Next.js was considered but the agreed scope has no identified need for server rendering, live APIs, a database or an AI service. The app is now implemented with pinned dependencies, Vitest rule/session tests and Playwright browser-flow checks. Deployment remains deferred.

## App visual reference

Checked on 2 October 2026 using the publisher's [Singapore Google Play listing](https://play.google.com/store/apps/details?id=com.starbucks.singapore) and [Singapore App Store listing](https://apps.apple.com/sg/app/starbucks-singapore/id574621564). Their public promotional screenshots show matching ordering screens. They are a visual reference, not proof of every current app screen or exact native design token.

| Observed Singapore pattern | Implication for this demo |
| --- | --- |
| White content canvas, dark green product/greeting panels, compact sans-serif text and small uppercase section labels. | Use a restrained green-and-white ordering interface with clear hierarchy. |
| Bottom navigation reads Home, Pay, Order, Shop and Stores; Order is green when active. A dark green pickup/store strip sits immediately above it, with a bag icon on the right. | Preserve the ordering context and accessible cart entry. Implement only the agreed demo destinations. |
| Product detail has a large centered drink image on dark green, followed by a white name/description panel. Its Add to Order control is a compact green pill near the bottom. | Let the drink and match explanation lead; keep the action easy to reach. |
| Customisation uses lightly rounded grey-outlined fields and size cards, with a green selected border/check. | Use similar selected states for finder choices, with text/icon cues in addition to colour. |
| Home shows a pale reorder card and a horizontal row of drinks pictured inside green circles. | Borrow these product-card cues for the optional finder entry and browse catalogue. |

Direct visual references: [home and product circles](https://play-lh.googleusercontent.com/1Iv_YmcPp9gr6uz3qRYcPjYyMVMxxBO1LLL-hxIfA-_IWmdyOPK_LGLU0dWLrMh6Tjnx1QSp-SYDXhjIW2XdJA=w1080-h1920), [outlined choices and navigation](https://play-lh.googleusercontent.com/r0uKkebKpmtgi3FZaDnoufeNrFAOBKHl9fVqArfsjQ9C1YOknvr-IEFt5A3pXjka2iwGKIi1a__pIZOW75-gqw=w1080-h1920), [drink detail](https://play-lh.googleusercontent.com/nWpXwe1Rk9UAK9K68m7zaUWTksXxpd_rxjJZD8UJnwowU81Bu6jsyzlcvTUuKigMlaxhnrrKfYtV_BfF3Z06wQ=w1080-h1920). The [official Singapore app guide](https://www.starbucks.com.sg/starbucks-mobile-app-0) also explicitly identifies the bottom Order icon and ordering methods. Screenshot prices and milk surcharges remain historical promotional examples, not verified current prices for our catalogue.

Starbucks' global [typography guide](https://creative.starbucks.com/typography/) names SoDo Sans for body copy, Lander for expressive serif accents and Pike for condensed headings. It does not establish the exact Singapore app font or grant redistribution rights. The revised UI bundles [Manrope from Google Fonts](https://github.com/google/fonts/tree/main/ofl/manrope), an open-licensed stylistic substitute, not an exact brand match. One 24.8 KB Latin variable WOFF2 supports weights 400–700; its SIL Open Font License is retained. No proprietary font files were downloaded.

Implementation approximations, not measured native tokens: deep green `#1e3932`, action green `#00754a`, white, pale grey surfaces and dark text; 12–16 px side gutters, 20–24 px section gaps and 44–48 px touch controls. The [brand colour guide](https://creative.starbucks.com/color/) supports a family of greens with neutral backgrounds, but exact screenshot colour values were not verified. Use one mobile layout around 390–430 px wide, filling narrow phones and appearing in a centered phone frame on tablet/desktop. Frame dimensions and spacing are our responsive design choices. Avoid image-heavy backgrounds and third-party font requests for performance.

The refined desktop frame uses the iPhone 15 Pro's 393 × 852 logical screen from [Apple's layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout). A 426 × 885 CSS-pixel shell is calculated from the physical proportions and pixel density in [Apple's specifications](https://support.apple.com/en-gb/111829), not an official CSS measurement. The bezel, side buttons and 126 × 37 Dynamic Island remain visual approximations. Narrow screens show only the app, without simulated hardware. Short, directional transitions, button feedback and sheet motion use CSS; reduced-motion preferences disable them.
