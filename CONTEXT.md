# Drink discovery and ordering

This prototype helps a customer discover a drink recipe and prepare a simulated
order. Its catalogue facts, demo prices and demo availability have distinct bases.

## Language

**Drink recipe**:
A named catalogue beverage with a described temperature, milk and coffee basis.
_Avoid_: Size variant, order line

**Drink size**:
A selectable serving label and cup capacity for a drink recipe. Size availability
and size-specific prices in this prototype are prepared demo fixtures.
_Avoid_: Recipe variant

**Default size**:
Tall, the serving used for discovery prices and direct chat additions. A
customer can choose another size on the drink page or when editing a cart line.

**Cart line**:
One drink recipe and one selected size, with a quantity. Different sizes of the
same recipe are different cart lines.
_Avoid_: Drink, purchase
