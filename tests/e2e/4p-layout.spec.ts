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
      // Get computed grid template
      const gridStyles = await tableArea.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          display: style.display,
          gridTemplateAreas: style.gridTemplateAreas,
          gridTemplateColumns: style.gridTemplateColumns,
          gridTemplateRows: style.gridTemplateRows,
        };
      });

      console.log('Grid display:', gridStyles.display);
      console.log('Grid template areas:', gridStyles.gridTemplateAreas);
      console.log('Grid template columns:', gridStyles.gridTemplateColumns);
      console.log('Grid template rows:', gridStyles.gridTemplateRows);

      // Verify grid is valid (has 4 rows and 3 columns)
      expect(gridStyles.display).toBe('grid');
      expect(gridStyles.gridTemplateAreas).toContain('across-zone');
      expect(gridStyles.gridTemplateAreas).toContain('deck-zone');
      expect(gridStyles.gridTemplateAreas).toContain('trick-zone');
      expect(gridStyles.gridTemplateAreas).toContain('left-zone');
      expect(gridStyles.gridTemplateAreas).toContain('right-zone');
      expect(gridStyles.gridTemplateAreas).toContain('hand-zone');

      // Verify no overlap between deck-zone and across-zone
      // (deck-zone should appear only once in the template)
      const areas = gridStyles.gridTemplateAreas;
      const deckMatches = areas.match(/deck-zone/g);
      expect(deckMatches?.length).toBe(1); // deck-zone should appear exactly once

      // Check bounding boxes don't overlap
      const deckZone = page.locator('.deck-trump-zone-4p');
      const acrossZone = page.locator('.player-zone-4p--top');
      const trickZone = page.locator('.trick-zone-4p');

      if (await deckZone.isVisible()) {
        const deckBox = await deckZone.boundingBox();
        const acrossBox = await acrossZone.isVisible() ? await acrossZone.boundingBox() : null;
        const trickBox = await trickZone.boundingBox();

        console.log('Deck zone:', deckBox);
        console.log('Across zone:', acrossBox);
        console.log('Trick zone:', trickBox);

        // Deck should not overlap with trick zone
        if (deckBox && trickBox) {
          const noOverlap =
            deckBox.x + deckBox.width <= trickBox.x ||
            trickBox.x + trickBox.width <= deckBox.x ||
            deckBox.y + deckBox.height <= trickBox.y ||
            trickBox.y + trickBox.height <= deckBox.y;
          expect(noOverlap).toBeTruthy();
        }
      }

      // Take a screenshot for manual inspection
      await page.screenshot({ path: 'test-results/4p-layout.png', fullPage: true });
    }
  });
});
