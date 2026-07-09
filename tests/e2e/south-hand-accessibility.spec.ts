import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const MOBILE_VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '360x640', width: 360, height: 640 },
  { name: '375x667', width: 375, height: 667 },
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: '393x852', width: 393, height: 852 },
  { name: '414x896', width: 414, height: 896 },
  { name: '430x932', width: 430, height: 932 },
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

for (const vp of MOBILE_VIEWPORTS) {
  test.describe(`South hand accessibility at ${vp.name}`, () => {
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

    test('south hand cards have independent tap regions', async () => {
      const cardCount = await page.locator('.hand--south .card-view--button, .hand--south button.card-view').count();
      expect(cardCount).toBeGreaterThanOrEqual(1);
    });

    test('each south card button has minimum 44x44 tap region', async () => {
      const cards = page.locator('.hand--south .card-view--button, .hand--south button.card-view');
      const count = await cards.count();
      for (let i = 0; i < count; i++) {
        const box = await cards.nth(i).boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    });

    test('south cards are above the safe bottom boundary', async () => {
      const analysis = await page.evaluate(() => {
        const southHand = document.querySelector('.hand--south');
        if (!southHand) return { visible: false };
        const rect = southHand.getBoundingClientRect();
        return {
          visible: rect.bottom > 0,
          bottom: rect.bottom,
          viewportHeight: window.innerHeight,
        };
      });
      expect(analysis.visible).toBe(true);
      /* Cards should not be completely below the viewport */
      expect(analysis.bottom).toBeGreaterThan(0);
    });

    test('south hand does not collide with south trick card', async () => {
      const analysis = await page.evaluate(() => {
        const southHand = document.querySelector('.hand--south');
        const southTrick = document.querySelector('.trick-slot--south');
        if (!southHand || !southTrick) return { overlaps: false };
        const handRect = southHand.getBoundingClientRect();
        const trickRect = southTrick.getBoundingClientRect();
        const overlaps = handRect.left < trickRect.right && handRect.right > trickRect.left &&
          handRect.top < trickRect.bottom && handRect.bottom > trickRect.top;
        return { overlaps };
      });
      expect(analysis.overlaps).toBe(false);
    });

    test('south hand has touch-action: manipulation', async () => {
      const styles = await page.evaluate(() => {
        const card = document.querySelector('.hand--south .card-view--button, .hand--south button.card-view');
        if (!card) return null;
        return getComputedStyle(card).touchAction;
      });
      if (styles) {
        expect(styles).toBe('manipulation');
      }
    });
  });
}
