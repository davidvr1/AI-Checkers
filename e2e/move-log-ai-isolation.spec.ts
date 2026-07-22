import { expect, test } from '@playwright/test';
import { squareIndex } from './helpers';

test('AI Hard-difficulty search does not flood the log with speculative moves', async ({ page }) => {
  const checkersLines: string[] = [];
  page.on('console', (msg) => {
    if (msg.text().includes('[checkers]')) checkersLines.push(msg.text());
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'vs AI', exact: true }).click();
  await page.getByRole('button', { name: 'Red', exact: true }).click();
  await page.getByRole('button', { name: 'Hard', exact: true }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();

  const squares = page.locator('.board > .sq');
  await squares.nth(squareIndex(5, 2)).click();
  await squares.nth(squareIndex(4, 1)).click(); // one human move -> triggers a real Hard-difficulty AI search

  await expect(page.locator('.turn-value')).toHaveText('Red', { timeout: 10_000 }); // wait for AI's move to resolve

  const log = await page.evaluate(() => (window as any).__checkersMoveLog);
  expect(log).toHaveLength(2); // exactly the human move + the AI's one real move
  expect(checkersLines).toHaveLength(2);
});
