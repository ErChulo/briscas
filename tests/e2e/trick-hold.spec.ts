import { expect, test } from '@playwright/test';

test('completed 2-player trick stays visible before collection starts', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.waitForSelector('text=Briscas', { timeout: 10_000 });
  await page.locator('button:has-text("Jugar contra IA")').click();
  await page.waitForSelector('.table-area', { timeout: 15_000 });

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('briscas:e2e:show-trick', { detail: { completed: true } }));
  });

  const playedCards = page.locator('.trick-zone .played-card');
  await expect(playedCards).toHaveCount(2, { timeout: 5_000 });
  await expect(page.locator('.trick-zone .played-card--capturing')).toHaveCount(0);

  await page.waitForTimeout(900);
  await expect(playedCards).toHaveCount(2);
  await expect(page.locator('.trick-zone .played-card--capturing')).toHaveCount(0);
});
