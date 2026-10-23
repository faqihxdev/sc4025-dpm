import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { drinks } from '../src/domain/catalogue.js';

const main = (page: Page) => page.getByRole('main');
const group = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const picks = (page: Page) => main(page).getByRole('article');
const stockFixture = (ids: readonly string[]) => Object.fromEntries(drinks.map(drink => [drink.id, ids.includes(drink.id)]));

async function limitStock(page: Page, ids: readonly string[]) {
  await page.addInitScript(availability => {
    const current = JSON.parse(sessionStorage.getItem('sc4025-drink-finder:v1') ?? '{}');
    sessionStorage.setItem('sc4025-drink-finder:v1', JSON.stringify({
      version: 1,
      preferences: { goal: null, temperature: null, avoidCoffee: false, sweetness: 'any', milk: null, budgetCents: null },
      cart: [],
      ...current,
      availability,
    }));
  }, stockFixture(ids));
}

async function startFinder(page: Page, goal = 'Something refreshing') {
  await page.goto('/');
  await page.locator('.finder-banner').getByRole('button', { name: 'Try it now', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${goal}`) }).click();
  await expect(page).toHaveURL(/#\/preferences$/);
  await expect(page.getByRole('heading', { name: 'Preferences', level: 1, exact: true })).toBeVisible();
}

async function showPicks(page: Page) {
  await page.getByRole('button', { name: 'Show my drink picks', exact: true }).click();
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Demo settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Demo settings' })).toBeVisible();
}

async function restoreSavedPreferences(page: Page, preferences: Record<string, string | number | boolean | null>, availableIds?: readonly string[]) {
  await page.addInitScript(({ saved, availability }) => {
    sessionStorage.setItem('sc4025-drink-finder:v1', JSON.stringify({
      version: 1,
      preferences: { goal: null, temperature: null, avoidCoffee: false, sweetness: 'any', milk: null, budgetCents: null, ...saved },
      cart: [],
      availability,
    }));
  }, { saved: preferences, availability: availableIds ? stockFixture(availableIds) : {} });
  await page.goto('/#/results');
}

async function savedPreferences(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('sc4025-drink-finder:v1') ?? '{}').preferences);
}

test('finder requirements, details, cart quantity and same-tab refresh stay consistent', async ({ page }) => {
  await limitStock(page, ['iced-americano']);
  await startFinder(page, 'A coffee boost');
  await group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true }).click();
  await group(page, 'Milk in the recipe').getByRole('button', { name: 'No milk listed', exact: true }).click();
  await group(page, 'Sweetness').getByRole('button', { name: 'Less sweet', exact: true }).click();
  await showPicks(page);
  await expect(picks(page)).toHaveCount(1);
  await expect(picks(page).getByRole('heading', { name: 'Iced Americano', exact: true })).toBeVisible();
  await expect(picks(page)).not.toContainText('Within your');
  expect((await savedPreferences(page)).budgetCents).toBeNull();
  await picks(page).getByRole('button', { name: 'See drink', exact: true }).click();
  await expect(main(page).getByRole('heading', { name: 'Iced Americano', exact: true })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Tall 12 oz', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(main(page).getByText('S$6.20', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add to order · S$6.20', exact: true }).click();
  await page.getByRole('button', { name: 'View order, 1 items', exact: true }).click();
  await expect(main(page).getByRole('article')).toContainText('Iced Americano');
  await page.getByRole('button', { name: 'Add one Iced Americano, Tall', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View order, 2 items', exact: true })).toBeVisible();
  await expect(main(page).getByText('S$12.40', { exact: true })).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your drink order.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View order, 2 items', exact: true })).toBeVisible();
  await main(page).getByRole('button', { name: /^Iced Americano/ }).click();
  await expect(main(page).getByRole('heading', { name: 'Iced Americano', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your drink order.' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove one Iced Americano, Tall', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View order, 1 items', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add another drink', exact: true }).click();
  await page.locator('.finder-banner').getByRole('button', { name: 'Try it now', exact: true }).click();
  await expect(page.getByRole('button', { name: /^A coffee boost/ })).not.toHaveAttribute('aria-pressed');
  await page.getByRole('button', { name: /^A coffee boost/ }).click();
  await expect(group(page, 'Hot or iced?').getByRole('button', { name: 'Iced', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(group(page, 'Budget per drink')).toHaveCount(0);
  expect((await savedPreferences(page)).budgetCents).toBeNull();
});

test('no-match recovery preserves strict choices and lets users change one requirement', async ({ page }) => {
  await restoreSavedPreferences(page, { goal: 'refreshing', temperature: 'hot', avoidCoffee: true, milk: 'dairy' }, ['pistachio-oat-matcha']);
  await expect(page.getByRole('heading', { name: 'No drink fits just yet.' })).toBeVisible();
  await expect(picks(page)).toHaveCount(0);
  await main(page).getByRole('button', { name: 'Edit my preferences', exact: true }).first().click();
  await expect(group(page, 'Hot or iced?')).toHaveCount(0);
  expect((await savedPreferences(page)).temperature).toBe('iced');
  await expect(group(page, 'Coffee ingredients').getByRole('button', { name: 'No coffee', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(group(page, 'Milk in the recipe').getByRole('button', { name: 'Dairy milk', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await group(page, 'Milk in the recipe').getByRole('button', { name: 'No preference', exact: true }).click();
  await showPicks(page);
  await expect(picks(page)).toHaveCount(1);
  await expect(picks(page).getByRole('heading', { name: 'Iced Pistachio Oatmilk Matcha Latte', exact: true })).toBeVisible();
});

test('availability changes after selection disable adding and survive refresh', async ({ page }) => {
  await page.goto('/');
  await main(page).getByRole('button', { name: /^Iced Americano/ }).click();
  await page.getByRole('button', { name: /^Add to order/ }).click();
  await openSettings(page);
  await page.getByRole('dialog').getByRole('checkbox', { name: 'Iced Americano', exact: true }).uncheck();
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Currently unavailable', exact: true })).toBeDisabled();
  await expect(main(page).getByText('This recipe is unavailable in the current demo stock.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Currently unavailable', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'View order, 1 items', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add one Iced Americano, Tall', exact: true })).toBeDisabled();
  await expect(main(page).getByText('No longer available. Remove this drink or choose another.')).toBeVisible();
  await page.getByRole('button', { name: 'Remove one Iced Americano, Tall', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your order is empty.' })).toBeVisible();
});
