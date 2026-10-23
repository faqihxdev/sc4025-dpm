import { expect, test } from '@playwright/test';

const route = (id: string) => `/#/wireframes?view=screens&screen=${id}`;
const phone = (page: import('@playwright/test').Page) => page.locator('.wf-phone');

test('wireframes leave saved customer data untouched and do not mount the app shell', async ({ page }) => {
  const calls: string[] = [];
  await page.route('**/api/**', route => {
    calls.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('sc4025-drink-feedback:v1', '{"questionVersion":1,"vote":"yes"}');
    sessionStorage.setItem('sc4025-drink-finder:v1', '{"cart":[{"drinkId":"iced-latte","sizeId":"grande","quantity":2}]}');
    sessionStorage.setItem('sc4025-drink-chat:v1', '{"messages":[{"role":"user","content":"An iced tea"}]}');
  });
  await page.goto(route('goal'));
  const savedState = () => page.evaluate(() => ({
    local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage),
  }));
  const before = await savedState();
  await phone(page).getByRole('button', { name: /Something refreshing/ }).click();
  await page.goto(route('chat'));
  await phone(page).getByRole('button', { name: 'Reset example chat', exact: true }).click();
  await phone(page).getByRole('button', { name: 'Help me choose', exact: true }).click();
  await phone(page).getByRole('button', { name: 'Add to order', exact: true }).first().click();
  await phone(page).getByRole('dialog').getByRole('button', { name: /^Add to order/ }).click();
  await expect(phone(page).getByRole('status')).toContainText('added to your order');
  await expect(page.locator('.desktop-shell')).toHaveCount(0);
  await expect(page.locator('.feedback-sheet')).toHaveCount(0);
  expect(await savedState()).toEqual(before);
  expect(calls).toEqual([]);
  await page.getByRole('link', { name: 'Open prototype' }).click();
  await expect(page.locator('.desktop-shell')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/wf-document/);
});
