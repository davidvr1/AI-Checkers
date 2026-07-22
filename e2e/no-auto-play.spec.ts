import { expect, test } from '@playwright/test';

const BOARD_SIZE = 8;
function idx(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

test('a mandatory single capture does not auto-play -- it waits for a click', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'vs Human', exact: true }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();

  const squares = page.locator('.board > .sq');

  // Move 1 (red): (5,4) -> (4,5). Move 2 (black): (2,3) -> (3,4).
  // This leaves red's man at (4,5) diagonally adjacent to black's man at (3,4),
  // with (2,3) now vacated -- red's ONLY legal move on turn 3 is the mandatory
  // capture (4,5)->jump->(2,3).
  await squares.nth(idx(5, 4)).click();
  await squares.nth(idx(4, 5)).click();
  await expect(page.locator('.turn-value')).toHaveText('Black');

  await squares.nth(idx(2, 3)).click();
  await squares.nth(idx(3, 4)).click();
  await expect(page.locator('.turn-value')).toHaveText('Red');

  const blackCountBefore = await page.locator('.piece.black').count();
  expect(blackCountBefore).toBe(12);

  // Select the piece with the sole mandatory capture. If this auto-played, the
  // turn would already show Black and the capture already resolved.
  await squares.nth(idx(4, 5)).click();
  await expect(page.locator('.turn-value')).toHaveText('Red'); // still red's turn -- NOT auto-played
  await expect(page.locator('.sq.selected')).toHaveCount(1);
  await expect(page.locator('.sq .dot')).toHaveCount(1); // exactly one legal destination
  const blackCountStillBefore = await page.locator('.piece.black').count();
  expect(blackCountStillBefore).toBe(12); // capture has NOT happened yet

  // Now explicitly click the highlighted destination to actually make the capture.
  await squares.nth(idx(2, 3)).click();
  await expect(page.locator('.turn-value')).toHaveText('Black'); // NOW the turn passes
  await expect(page.locator('.piece.black')).toHaveCount(11); // capture resolved
});
