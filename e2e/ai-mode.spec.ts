import { expect, test } from '@playwright/test';
import { squareIndex } from './helpers';

test('a vs-AI game lets the human move and the AI responds in turn', async ({ page }) => {
  await page.goto('/');

  // Setup screen: choose vs AI, play Red, Easy difficulty (fastest to resolve).
  await page.getByRole('button', { name: 'vs AI', exact: true }).click();
  await page.getByRole('button', { name: 'Red', exact: true }).click();
  await page.getByRole('button', { name: 'Easy', exact: true }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();

  const squares = page.locator('.board > .sq');
  await expect(squares.first()).toBeVisible();

  // Sanity: it's the human's (red's) turn before any move is made.
  await expect(page.locator('.turn-value')).toHaveText('Red');

  // Standard starting position: (5,2) holds a red man that can move to (4,1) or (4,3).
  await squares.nth(squareIndex(5, 2)).click();
  await squares.nth(squareIndex(4, 1)).click();

  // The move hands the turn to the AI (black); board input should be disabled and
  // the rail should reflect the AI thinking, then the turn should return to red.
  await expect(page.locator('.board')).toHaveClass(/disabled/);
  await expect(page.locator('.turn-label')).toHaveText('AI is thinking');

  // The turn can only return to red once the AI's dispatched PLAY_MOVE has
  // actually resolved -- nothing else flips currentPlayer back. Sanity-check
  // piece count too: still exactly 12 black men, proving the AI made an
  // ordinary move rather than corrupting the board (this opening position has
  // no capture available to black, so no piece should have been removed).
  await expect(page.locator('.turn-value')).toHaveText('Red', { timeout: 10_000 });
  await expect(page.locator('.board')).not.toHaveClass(/disabled/);
  await expect(page.locator('.piece.black')).toHaveCount(12);
});

test('AI moves first when the human plays Black', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'vs AI', exact: true }).click();
  await page.getByRole('button', { name: 'Black', exact: true }).click();
  await page.getByRole('button', { name: 'Easy', exact: true }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();

  // The AI (Red) must move immediately, with no human click, since currentPlayer
  // already equals aiColor on mount.
  await expect(page.locator('.turn-value')).toHaveText('Black', { timeout: 10_000 });
  await expect(page.locator('.board')).not.toHaveClass(/disabled/);
  await expect(page.locator('.piece.red')).toHaveCount(12);
});

test('New Game returns to the setup screen from a vs-AI game', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'vs AI', exact: true }).click();
  await page.getByRole('button', { name: 'Black', exact: true }).click();
  await page.getByRole('button', { name: 'Easy', exact: true }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();

  await expect(page.locator('.board')).toBeVisible();

  await page.getByRole('button', { name: 'New Game' }).click();

  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect(page.locator('.board')).toHaveCount(0);
});
