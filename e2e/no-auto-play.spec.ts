import { expect, test } from '@playwright/test';
import { setUpMandatoryCapture, squareIndex } from './helpers';

test('a mandatory single capture does not auto-play -- it waits for a click', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'vs Human', exact: true }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();

  await setUpMandatoryCapture(page);
  await expect(page.locator('.turn-value')).toHaveText('Red');

  const squares = page.locator('.board > .sq');
  const blackCountBefore = await page.locator('.piece.black').count();
  expect(blackCountBefore).toBe(12);

  // Select the piece with the sole mandatory capture. If this auto-played, the
  // turn would already show Black and the capture already resolved.
  await squares.nth(squareIndex(4, 5)).click();
  await expect(page.locator('.turn-value')).toHaveText('Red'); // still red's turn -- NOT auto-played
  await expect(page.locator('.sq.selected')).toHaveCount(1);
  await expect(page.locator('.sq .dot')).toHaveCount(1); // exactly one legal destination
  const blackCountStillBefore = await page.locator('.piece.black').count();
  expect(blackCountStillBefore).toBe(12); // capture has NOT happened yet

  // Now explicitly click the highlighted destination to actually make the capture.
  await squares.nth(squareIndex(2, 3)).click();
  await expect(page.locator('.turn-value')).toHaveText('Black'); // NOW the turn passes
  await expect(page.locator('.piece.black')).toHaveCount(11); // capture resolved
});
