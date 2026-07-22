import type { Page } from '@playwright/test';

export const BOARD_SIZE = 8;

export function squareIndex(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

/**
 * Drives two real opening moves -- red (5,4)->(4,5), black (2,3)->(3,4) -- that
 * leave red's man at (4,5) diagonally adjacent to black's man at (3,4), with
 * (2,3) now vacated. Red's ONLY legal move on turn 3 is then the mandatory
 * capture (4,5) -jump-> (2,3). Shared by any spec that needs a real (not
 * synthetic) single-forced-capture scenario.
 */
export async function setUpMandatoryCapture(page: Page): Promise<void> {
  const squares = page.locator('.board > .sq');
  await squares.nth(squareIndex(5, 4)).click();
  await squares.nth(squareIndex(4, 5)).click();
  await squares.nth(squareIndex(2, 3)).click();
  await squares.nth(squareIndex(3, 4)).click();
}
