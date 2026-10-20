# Drink sizes

Requested on 3 October 2026. Size selection is on the drink page, in the
cart's Edit drawer, and in a drawer opened by chat's Add to order button.
Finder questions and chat recommendation cards remain compact and size-free.

## Data basis

The [Starbucks Singapore store FAQ](https://www.starbucks.com.sg/frequently-asked-questions-in-our-stores),
checked on 3 October 2026, lists Short 8 oz for hot drinks only, Tall 12 oz,
Grande 16 oz and Venti 20 oz. Its general size definitions do not establish
size availability or exact prices for every recipe at a real outlet.

All per-recipe size options and prices remain demo fixtures. Tall retains the
existing catalogue price. The prepared adjustments are Short minus S$0.75,
Grande plus S$0.75 and Venti plus S$1.50. These are chosen for the prototype,
not sourced Starbucks surcharges. Short is offered only for prepared hot recipes.
Verified size and price fields remain unknown.

## Interaction policy

- Menu, finder results and chat cards keep the Tall price. Chat Add to order
  opens a size drawer with Tall initially selected. Choosing a size previews its
  price; only confirming adds it to the cart. Closing discards the draft and
  returns focus to the card's Add button. Chat remains open and no API call is made.
- The drink page starts at Tall, or the size of the cart line being reopened.
  Size selection updates the visible price and sticky add action immediately.
- A cart line is a drink recipe and a size. Tall and Grande of the same drink
  are separate lines; only identical pairs merge. Quantity changes affect one
  line. Prices and totals come from the shared size quotes, not browser-stored prices.
- Selecting another size from a cart-origin detail page adds that size; it does
  not silently replace an existing cart line.
- The cart's explicit Edit action opens a bottom drawer with a size draft and
  price preview. Update order changes that line's size and retains its full
  quantity. Closing the drawer discards the draft. If the destination size is
  already in the cart, the lines merge at the destination's position. A combined
  quantity above 99 blocks saving rather than discarding drinks. Unavailable
  recipes cannot be updated. Focus returns to the resulting line's Edit action.
- Stock remains recipe-level and blocks additions in every size. There is no
  size-specific inventory claim or extra stock switch.
- Old carts without sizes migrate to Tall. Unknown explicit sizes and iced Short
  entries are discarded. Valid preferences and stock survive migration.
- Shared image/title transitions identify the originating cart line so two sizes
  of one drink cannot create duplicate transition names.

## Matching and chat

The finder ranks named recipes and does not ask for size. Temperature, coffee and
milk requirements remain unchanged. Sugar values retain the source's default
recipe per-100-mL basis. Never multiply them by cup capacity to invent serving
totals or size-specific nutrition. Shots, caffeine and ingredient ratios are not
inferred from size.

The assistant receives the default size and prepared size quotes as catalogue
facts. It can explain them but cannot select a size or place an order. Its
recommendation contract remains a drink ID. Chat budget filtering still uses the
Tall price; an explicitly selected larger size has its own visible price and
is not a claim that the prior chat budget is still met.

Sizes and the cart Edit drawer were deployed on 3 October 2026 in production
deployment `422371dd`. Live mobile and desktop checks verified updates, merging
and refresh persistence. See [deployment checks](../tests/README.md).
The chat size picker was deployed later that day in `a4f1d870`.
