import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1920x1080', width: 1920, height: 1080 },
] as const;

async function start4PlayerGame(page: Page): Promise<void> {
  await page.goto('http://localhost:5173');
  await page.waitForSelector('text=Briscas', { timeout: 10_000 });
  await page.locator('select').selectOption('STANDARD_4P');
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Jugar contra IA")').click();
  await page.waitForSelector('.table-area--4p', { timeout: 15_000 });
  await page.waitForTimeout(2000);
}

for (const vp of VIEWPORTS) {
  test.describe(`Game board layout at ${vp.name}`, () => {
    let context: BrowserContext;
    let page: Page;

    test.beforeEach(async ({ browser }) => {
      context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      page = await context.newPage();
      await start4PlayerGame(page);
    });

    test.afterEach(async () => {
      await context.close();
    });

    test('game board fills the viewport', async () => {
      const board = await page.locator('.table-area--4p').boundingBox();
      expect(board).not.toBeNull();
      if (board) {
        expect(board.width).toBeGreaterThan(vp.width * 0.5);
        expect(board.height).toBeGreaterThan(vp.height * 0.3);
      }
    });

    test('all four player hands exist', async () => {
      const hands = await page.locator('.hand').count();
      expect(hands).toBe(4);
    });

    test('south hand is the local player', async () => {
      const southHand = await page.locator('.hand--south').count();
      expect(southHand).toBe(1);
    });

    test('north hand exists', async () => {
      const northHand = await page.locator('.hand--north').count();
      expect(northHand).toBe(1);
    });

    test('east and west hands exist', async () => {
      const eastHand = await page.locator('.hand--east').count();
      const westHand = await page.locator('.hand--west').count();
      expect(eastHand).toBe(1);
      expect(westHand).toBe(1);
    });

    test('trick zone exists', async () => {
      const trickZone = await page.locator('.trick-zone').count();
      expect(trickZone).toBe(1);
    });

    test('deck zone exists', async () => {
      const deckZone = await page.locator('.deck-zone').count();
      expect(deckZone).toBe(1);
    });

    test('info rail exists', async () => {
      const infoRail = await page.locator('.scoreboard-drawer').count();
      expect(infoRail).toBe(1);
    });

    test('no horizontal overflow', async () => {
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasOverflow).toBe(false);
    });

    test('board has overflow: hidden', async () => {
      const overflow = await page.evaluate(() => {
        const board = document.querySelector('.table-area--4p');
        return board ? getComputedStyle(board).overflow : null;
      });
      expect(overflow).toBe('hidden');
    });

    test('trick card width is set via CSS custom property', async () => {
      const trickWidth = await page.evaluate(() => {
        const tableArea = document.querySelector('.table-area--4p');
        if (!tableArea) return null;
        const style = (tableArea as HTMLElement).style;
        const val = style.getPropertyValue('--trick-card-width');
        return val ? parseInt(val, 10) : null;
      });
      expect(trickWidth).not.toBeNull();
      expect(trickWidth!).toBeGreaterThan(0);
    });
  });
}
