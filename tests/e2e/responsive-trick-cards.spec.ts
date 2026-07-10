import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const TRICK_CARD_VIEWPORTS = [
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
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

for (const vp of TRICK_CARD_VIEWPORTS) {
  test.describe(`Trick card sizing at ${vp.name}`, () => {
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

    test('trick card width is computed by ResizeObserver', async () => {
      const trickWidth = await page.evaluate(() => {
        const tableArea = document.querySelector('.table-area--4p');
        if (!tableArea) return null;
        const style = (tableArea as HTMLElement).style;
        return parseInt(style.getPropertyValue('--trick-card-width'), 10);
      });
      expect(trickWidth).not.toBeNull();
      expect(trickWidth!).toBeGreaterThanOrEqual(46);
      expect(trickWidth!).toBeLessThanOrEqual(160);
    });

    test('all four trick slots exist', async () => {
      const slots = await page.locator('.trick-slot').count();
      expect(slots).toBe(4);
    });

    test('trick zone does not overlap side labels', async () => {
      const analysis = await page.evaluate(() => {
        const trickZone = document.querySelector('.trick-zone');
        const westName = document.querySelector('.hand__name--west');
        const eastName = document.querySelector('.hand__name--east');
        if (!trickZone || !westName || !eastName) return { overlaps: false };
        const trickRect = trickZone.getBoundingClientRect();
        const westRect = westName.getBoundingClientRect();
        const eastRect = eastName.getBoundingClientRect();
        const overlapsWest = trickRect.left < westRect.right && trickRect.right > westRect.left &&
          trickRect.top < westRect.bottom && trickRect.bottom > westRect.top;
        const overlapsEast = trickRect.left < eastRect.right && trickRect.right > eastRect.left &&
          trickRect.top < eastRect.bottom && trickRect.bottom > eastRect.top;
        return { overlaps: overlapsWest || overlapsEast };
      });
      expect(analysis.overlaps).toBe(false);
    });

    test('deck and trump do not overlap the trick zone', async () => {
      const analysis = await page.evaluate(() => {
        const trickZone = document.querySelector('.trick-zone');
        const deckZone = document.querySelector('.deck-zone');
        if (!trickZone || !deckZone) return { overlaps: false };
        const trickRect = trickZone.getBoundingClientRect();
        const deckRect = deckZone.getBoundingClientRect();
        const overlaps = trickRect.left < deckRect.right && trickRect.right > deckRect.left &&
          trickRect.top < deckRect.bottom && trickRect.bottom > deckRect.top;
        return { overlaps };
      });
      expect(analysis.overlaps).toBe(false);
    });

    test('trick cards scale up when usable space increases', async () => {
      const trickWidth = await page.evaluate(() => {
        const tableArea = document.querySelector('.table-area--4p');
        if (!tableArea) return 0;
        return parseInt((tableArea as HTMLElement).style.getPropertyValue('--trick-card-width'), 10);
      });
      /* On larger viewports, trick cards should be wider */
      if (vp.width >= 1024) {
        expect(trickWidth!).toBeGreaterThanOrEqual(76);
      }
    });

    test('no horizontal page overflow exists', async () => {
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasOverflow).toBe(false);
    });
  });
}
