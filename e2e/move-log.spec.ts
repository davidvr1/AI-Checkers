import { expect, test } from '@playwright/test';
import { setUpMandatoryCapture, squareIndex } from './helpers';

test('move log: each real move (and each capture reason) is recorded exactly once, in the console and on window.__checkersMoveLog', async ({ page }) => {
  const consoleLines: string[] = [];
  page.on('console', (msg) => {
    if (msg.text().includes('[checkers]')) consoleLines.push(msg.text());
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'vs Human', exact: true }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();

  await setUpMandatoryCapture(page); // moves 1-2, no captures
  await page.locator('.board > .sq').nth(squareIndex(4, 5)).click();
  await page.locator('.board > .sq').nth(squareIndex(2, 3)).click(); // move 3: red CAPTURES black at (3,4)

  const log = await page.evaluate(() => (window as any).__checkersMoveLog);

  expect(log).toHaveLength(3); // exactly the 3 real moves -- no duplicates
  expect(log[2].captured).toBeTruthy();
  expect(log[2].captured.reason).toContain('jumped');
  expect(consoleLines.length).toBe(3);
  expect(consoleLines[2]).toContain('removed black man');
});
