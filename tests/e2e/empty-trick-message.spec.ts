import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const VIEWPORTS = [
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
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
  test.describe(`Empty-trick message at ${vp.name}`, () => {
    let context: BrowserContext;
    let page: Page;

    test.beforeEach(async ({ browser }) => {
      context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      page = await context.newPage();
    });

    test.afterEach(async () => {
      await context.close();
    });

    test('"Baza está vacía" is never rendered in 4-player mode', async () => {
      await start4PlayerGame(page);
      const text = await page.textContent('body');
      expect(text).not.toContain('Baza está vacía');
      expect(text).not.toContain('baza está vacía');
      expect(text).not.toContain('La baza está vacía');
    });

    test('no equivalent empty-trick toast appears', async () => {
      await start4PlayerGame(page);
      /* Wait a few seconds to ensure no toast appears */
      await page.waitForTimeout(3000);
      const toasts = await page.locator('.notification').count();
      /* There should be no notification with empty-trick text */
      for (let i = 0; i < toasts; i++) {
        const text = await page.locator('.notification').nth(i).textContent();
        expect(text).not.toContain('vacía');
      }
    });
  });
}
