export const screens = [
  { id: 'menu', title: 'Menu entry', group: 'Discover', notes: ['Find My Drink sits beside normal browsing. Customers who already know what they want can keep using the menu.', 'The banner opens the same set of guided and conversational choices.'] },
  { id: 'goal', title: 'Discovery choices', group: 'Discover', notes: ['Three goals and Help me choose have equal visual weight. No goal is preselected.', 'Plain-language goals help both newcomers and regulars choosing an unfamiliar drink.'] },
  { id: 'preferences', title: 'Optional preferences', group: 'Discover', notes: ['The selected goal stays visible and can be changed without restarting.', 'Only relevant questions appear. Required temperature, coffee and milk choices filter drinks; sweetness ranks them. Impossible options are disabled.', 'Show my drink picks stays at the bottom. Every preference is optional.'] },
  { id: 'picks', title: 'Explained picks', group: 'Discover', notes: ['Up to three available drinks meet the required preferences. A short recipe summary and price support comparison.', 'See drink opens the recipe and size selection. Edit my preferences retains the previous answers.'] },
  { id: 'chat', title: 'Conversational discovery', group: 'Discover', notes: ['Short example replies help customers who do not know what to type. The conversation here is a fixed navigation example.', 'Drink cards open details. Add to order opens a size drawer before adding anything.', 'The composer remains at the bottom. Quick replies reduce typing.'] },
  { id: 'details', title: 'Drink details', group: 'Choose and add', notes: ['Recipe information, size and the corresponding price appear before adding.', 'Adding confirms the action in place. The customer opens the bag separately to review the order.'] },
  { id: 'chat-size', title: 'Chat size drawer', group: 'Choose and add', notes: ['Size selection opens over the conversation, preserving context.', 'Confirming adds the selected size. Closing or cancelling adds nothing and returns focus to the trigger.'] },
  { id: 'added', title: 'Added confirmation', group: 'Choose and add', notes: ['A brief confirmation and updated bag count acknowledge the addition without moving the customer to another page.', 'Open bag is a separate action. Customers can continue browsing or chatting.'] },
  { id: 'cart', title: 'Order review', group: 'Choose and add', notes: ['Each line shows recipe, size, quantity and price. Totals update when quantities change.', 'Edit opens a size drawer. The prototype stops at a demo cart, with no payment or real order.'] },
  { id: 'cart-size', title: 'Cart size drawer', group: 'Choose and add', notes: ['A drawer edits the existing line while keeping the order visible.', 'Saving preserves quantity and recalculates the total. Cancelling leaves the order unchanged.'] },
  { id: 'no-match', title: 'No matching drinks', group: 'Recovery', notes: ['Do not silently relax required preferences or fill the list with incompatible drinks.', 'Retain the answers and offer Edit my preferences or Browse the menu.'] },
  { id: 'chat-error', title: 'Chat request error', group: 'Recovery', notes: ['An error appears beside the composer. Existing messages remain visible.', 'Retry repeats the request. The production app does not invent a reply when a request fails.'] },
  { id: 'unavailable', title: 'Unavailable drink', group: 'Recovery', notes: ['The recipe remains readable, but Add to order is disabled.', 'The customer can return to the previous list and choose another drink.'] },
] as const;

export type ScreenId = typeof screens[number]['id'];
export const screenIds = screens.map(screen => screen.id);
export const screenHref = (id: ScreenId) => `#/wireframes?view=screens&screen=${id}`;
export function readDesignLocation() {
  const params = new URLSearchParams(window.location.hash.split('?')[1]);
  const candidate = params.get('screen');
  return { view: params.get('view') === 'screens' ? 'screens' as const : 'flow' as const,
    screen: screenIds.includes(candidate as ScreenId) ? candidate as ScreenId : 'goal' as const };
}

export const flowNodes: { screen: ScreenId; title: string; subtitle: string; x: number; y: number; state?: boolean }[] = [
  { screen: 'menu', title: 'Menu', subtitle: 'Browse or find a drink', x: 460, y: 20 },
  { screen: 'goal', title: 'What sounds good?', subtitle: 'Three goals or chat', x: 460, y: 136 },
  { screen: 'preferences', title: 'Preferences', subtitle: 'Optional answers', x: 60, y: 290 },
  { screen: 'chat', title: 'Help me choose', subtitle: 'Type or use a quick reply', x: 860, y: 290 },
  { screen: 'picks', title: 'Your drink picks', subtitle: 'Up to three explained matches', x: 60, y: 418 },
  { screen: 'details', title: 'Drink details', subtitle: 'Recipe, size and price', x: 60, y: 546 },
  { screen: 'chat-size', title: 'Choose a size', subtitle: 'Drawer over the conversation', x: 860, y: 546 },
  { screen: 'added', title: 'Drink added', subtitle: 'Stay on the current screen', x: 460, y: 546, state: true },
  { screen: 'cart', title: 'Review order', subtitle: 'Size, quantity and total', x: 460, y: 688 },
];

export const flowEdges = [
  { from: 'menu', to: 'goal', path: 'M580 84V136', label: 'Try it now', x: 636, y: 114 },
  { from: 'menu', to: 'details', path: 'M460 52H20V578H60', label: 'Browse a drink', x: 240, y: 43 },
  { from: 'goal', to: 'preferences', path: 'M460 168H180V290', label: 'Choose a goal', x: 310, y: 157 },
  { from: 'goal', to: 'chat', path: 'M700 168H980V290', label: 'Help me choose', x: 830, y: 157 },
  { from: 'preferences', to: 'picks', path: 'M180 354V418', label: 'Show my drink picks', x: 279, y: 389 },
  { from: 'picks', to: 'details', path: 'M180 482V546', label: 'See drink', x: 234, y: 520 },
  { from: 'chat', to: 'details', path: 'M860 322H780V498H280V546', label: 'Open drink details', x: 566, y: 488, secondary: true },
  { from: 'chat', to: 'chat-size', path: 'M980 354V546', label: 'Add to order', x: 1040, y: 453 },
  { from: 'details', to: 'added', path: 'M300 578H460', label: 'Add to order', x: 381, y: 566 },
  { from: 'chat-size', to: 'added', path: 'M860 578H700', label: 'Confirm size', x: 780, y: 566 },
  { from: 'added', to: 'cart', path: 'M580 610V688', label: 'Open bag', x: 633, y: 655 },
] satisfies { from: ScreenId; to: ScreenId; path: string; label: string; x: number; y: number; secondary?: boolean }[];
