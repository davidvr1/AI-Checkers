import { expect, test } from '@playwright/test';

/**
 * Verifies the language toggle actually flips the running app between English
 * and Hebrew (and back), including the document's RTL direction, while the board
 * itself stays LTR so its grid never mirrors.
 */

test('toggles the whole UI between English and Hebrew, and back', async ({ page }) => {
  await page.goto('/');

  // Starts in English, LTR.
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('button', { name: 'vs Human', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();

  // The toggle advertises the language it switches TO.
  const toggle = page.locator('.lang-toggle');
  await expect(toggle).toContainText('עברית');

  await toggle.click();

  // Now Hebrew, RTL, and the strings have changed.
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.getByRole('button', { name: 'מול אדם', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'התחל משחק' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('דמקה, ברשת');
  // The toggle now offers the way back.
  await expect(toggle).toContainText('English');

  // Toggling back restores English + LTR.
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
});

test('language choice persists into an in-progress game and the board stays LTR', async ({ page }) => {
  await page.goto('/');
  await page.locator('.lang-toggle').click(); // switch to Hebrew on the setup screen

  await page.getByRole('button', { name: 'מול אדם', exact: true }).click(); // vs Human
  await page.getByRole('button', { name: 'התחל משחק' }).click(); // Start Game

  // In-game UI is Hebrew...
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('button', { name: 'משחק חדש' })).toBeVisible(); // New Game
  await expect(page.locator('.rail')).toContainText('אדום אכל'); // "Red captured"

  // ...but the board is explicitly pinned LTR so its 8x8 grid never mirrors.
  await expect(page.locator('.board-card')).toHaveAttribute('dir', 'ltr');
});
