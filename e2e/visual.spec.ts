import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * These tests read the approved design sketch (docs/design/board-sketch.html)
 * as the single source of truth for tokens, then assert the running app's
 * computed styles actually match it -- proving the "must look like the sketch"
 * requirement rather than just asserting our own copy of the tokens.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sketchHtml = fs.readFileSync(
  path.resolve(__dirname, '../docs/design/board-sketch.html'),
  'utf-8',
);

function extractColorVar(name: string): string {
  const match = sketchHtml.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (!match) throw new Error(`Could not find --${name} in board-sketch.html`);
  return match[1];
}

function extractFontFamily(selector: string): string {
  const ruleMatch = sketchHtml.match(new RegExp(`${selector}\\s*\\{([^}]+)\\}`));
  if (!ruleMatch) throw new Error(`Could not find rule "${selector}" in board-sketch.html`);
  const fontMatch = ruleMatch[1].match(/font-family:\s*([^;]+);/);
  if (!fontMatch) throw new Error(`Rule "${selector}" has no font-family in board-sketch.html`);
  return fontMatch[1].trim();
}

function hexToRgb(hex: string): string {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function firstAndLastFamily(stack: string): [string, string] {
  const parts = stack.split(',').map((p) => p.trim().replace(/^['"]|['"]$/g, ''));
  return [parts[0], parts[parts.length - 1]];
}

const moss = extractColorVar('moss');
const buff = extractColorVar('buff');
const garnet = extractColorVar('garnet');
const garnetHi = extractColorVar('garnet-hi');
const ink = extractColorVar('ink');
const inkHi = extractColorVar('ink-hi');
const brass = extractColorVar('brass');
const headingFontStack = extractFontFamily('h1');

test('board square colors match the sketch tokens', async ({ page }) => {
  await page.goto('/');

  const darkSquare = page.locator('.sq.dark').first();
  const lightSquare = page.locator('.sq.light').first();

  await expect(darkSquare).toHaveCSS('background-color', hexToRgb(moss));
  await expect(lightSquare).toHaveCSS('background-color', hexToRgb(buff));
});

test('piece colors match the sketch garnet/ink tokens', async ({ page }) => {
  await page.goto('/');

  const redPiece = page.locator('.piece.red').first();
  const blackPiece = page.locator('.piece.black').first();

  const redBackgroundImage = await redPiece.evaluate((el) => getComputedStyle(el).backgroundImage);
  const blackBackgroundImage = await blackPiece.evaluate((el) => getComputedStyle(el).backgroundImage);

  expect(redBackgroundImage).toContain(hexToRgb(garnetHi));
  expect(redBackgroundImage).toContain(hexToRgb(garnet));
  expect(blackBackgroundImage).toContain(hexToRgb(inkHi));
  expect(blackBackgroundImage).toContain(hexToRgb(ink));
});

test('brass accent is used for the live selection ring and the legend', async ({ page }) => {
  await page.goto('/');

  // Legend swatch: static reference to the brass accent.
  const ringSwatch = page.locator('.legend-swatch.ring');
  await expect(ringSwatch).toHaveCSS('border-color', hexToRgb(brass));

  // Live selection: click a movable red piece and check the resulting ring color.
  // Squares render in row-major order (row * BOARD_SIZE + col); in the standard
  // starting position, (row 5, col 2) holds a red man with legal moves.
  const BOARD_SIZE = 8;
  const STARTING_MOVABLE_RED_SQUARE = { row: 5, col: 2 };
  const squares = page.locator('.board > .sq');
  await squares
    .nth(STARTING_MOVABLE_RED_SQUARE.row * BOARD_SIZE + STARTING_MOVABLE_RED_SQUARE.col)
    .click();

  const selectedSquare = page.locator('.sq.selected');
  await expect(selectedSquare).toHaveCount(1);
  const ringColor = await selectedSquare.evaluate(
    (el) => getComputedStyle(el, '::before').borderColor,
  );
  expect(ringColor).toBe(hexToRgb(brass));
});

test('display heading uses the sketch font stack', async ({ page }) => {
  await page.goto('/');

  const [firstFamily, lastFamily] = firstAndLastFamily(headingFontStack);
  const computedFontFamily = await page.locator('h1').evaluate((el) => getComputedStyle(el).fontFamily);

  expect(computedFontFamily).toContain(firstFamily);
  expect(computedFontFamily).toContain(lastFamily);
});

test('full-page screenshot for manual comparison against the sketch', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: 'e2e/screenshots/app.png', fullPage: true });
});
