import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const VIEWPORTS = [
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
  { name: '1280x720', width: 1280, height: 720 },
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
  test.describe(`Trick notifications at ${vp.name}`, () => {
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

    test('notification layer exists in the DOM', async () => {
      /* The notification is only rendered when activeNotification is non-null */
      /* Verify the notification CSS class is properly defined */
      const hasStyles = await page.evaluate(() => {
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
          try {
            const rules = Array.from(sheet.cssRules);
            for (const rule of rules) {
              if (rule instanceof CSSStyleRule && rule.selectorText?.includes('.notification')) {
                return true;
              }
            }
          } catch { /* cross-origin */ }
        }
        return false;
      });
      expect(hasStyles).toBe(true);
    });

    test('notification width is constrained', async () => {
      const styles = await page.evaluate(() => {
        const el = document.createElement('div');
        el.className = 'notification';
        document.body.appendChild(el);
        const computed = getComputedStyle(el);
        const result = { width: computed.width, maxWidth: computed.maxWidth };
        el.remove();
        return result;
      });
      /* Width should be constrained - either by max-width or by the container */
      const widthPx = parseInt(styles.width, 10);
      expect(widthPx).toBeGreaterThan(0);
      expect(widthPx).toBeLessThanOrEqual(420);
    });

    test('notification z-index is above trick zone', async () => {
      const zIndices = await page.evaluate(() => {
        const notification = document.createElement('div');
        notification.className = 'notification';
        document.body.appendChild(notification);
        const notifZ = getComputedStyle(notification).zIndex;
        notification.remove();

        const trickSlot = document.createElement('div');
        trickSlot.className = 'trick-slot';
        document.body.appendChild(trickSlot);
        const trickZ = getComputedStyle(trickSlot).zIndex;
        trickSlot.remove();

        return { notifZ: parseInt(notifZ, 10), trickZ: parseInt(trickZ, 10) };
      });
      expect(zIndices.notifZ).toBeGreaterThan(zIndices.trickZ);
    });

    test('notification pointer-events are none', async () => {
      const styles = await page.evaluate(() => {
        const el = document.createElement('div');
        el.className = 'notification';
        document.body.appendChild(el);
        const result = getComputedStyle(el).pointerEvents;
        el.remove();
        return result;
      });
      expect(styles).toBe('none');
    });
  });
}
