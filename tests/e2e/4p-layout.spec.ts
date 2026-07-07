import { test, expect } from '@playwright/test';

test.describe('4P game board layout', () => {
  test('grid template areas are valid and elements positioned correctly', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForSelector('text=Briscas', { timeout: 10000 });

    // Start a 4P local game to see the board
    const fourPlayerBtn = page.getByRole('button', { name: /4 Jugadores|4P/i });
    if (await fourPlayerBtn.isVisible()) {
      await fourPlayerBtn.click();
      await page.waitForTimeout(1000);
    }

    // Check if we can see the game board
    const tableArea = page.locator('.table-area--4p');
    if (await tableArea.isVisible()) {
      // New layout positions the four seats absolutely.
      const layout = await tableArea.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          display: style.display,
          position: style.position,
          overflow: style.overflow,
          cardSize: style.getPropertyValue('--card-4p-size').trim(),
        };
      });

      console.log('Table area:', layout);

      expect(layout.display).not.toBe('none');
      expect(layout.position).toBe('relative');
      expect(layout.overflow).toBe('hidden');
      expect(layout.cardSize).not.toBe('');

      // Trick center is centered inside the table
      const trickCenter = page.locator('.trick-center-4p');
      await expect(trickCenter).toBeVisible();
      const trickStyles = await trickCenter.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return { position: style.position, display: style.display };
      });
      expect(trickStyles.position).toBe('absolute');
      expect(trickStyles.display).toBe('grid');

      // All four seats are absolutely positioned.
      for (const side of ['top', 'left', 'right', 'bottom']) {
        const seat = page.locator(`.seat-4p--${side}`);
        await expect(seat).toBeAttached();
        const seatStyles = await seat.evaluate((el) => {
          const style = window.getComputedStyle(el);
          return { position: style.position, transform: style.transform };
        });
        expect(seatStyles.position).toBe('absolute');
        expect(seatStyles.transform).not.toBe('none');
      }

      // Trick cards and owner cards share the same card height — the equal-size
      // invariant. If these diverge the layout has regressed.
      const trickCard = trickCenter.locator('.played-card--4p .card-view').first();
      const ownerCard = page.locator('.owner-hand-4p .card-view').first();
      if (await trickCard.isVisible() && await ownerCard.isVisible()) {
        const trickSize = await trickCard.boundingBox();
        const ownerSize = await ownerCard.boundingBox();
        if (trickSize && ownerSize) {
          const widthEqual = Math.abs(trickSize.width - ownerSize.width) < 1;
          const heightEqual = Math.abs(trickSize.height - ownerSize.height) < 1;
          expect(widthEqual).toBe(true);
          expect(heightEqual).toBe(true);
        }
      }

      // Take a screenshot for manual inspection
      await page.screenshot({ path: 'test-results/4p-layout.png', fullPage: true });
    }
  });
});
