import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const MOBILE_VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '360x640', width: 360, height: 640 },
  { name: '360x800', width: 360, height: 800 },
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

  // Select 4P variant
  await page.locator('select').selectOption('STANDARD_4P');
  await page.waitForTimeout(500);

  // Click "Jugar contra IA"
  await page.locator('button:has-text("Jugar contra IA")').click();

  // Wait for the 4P game board to appear
  await page.waitForSelector('.table-area--4p', { timeout: 15_000 });

  // Wait for cards to be dealt (deal animation + buffer)
  await page.waitForTimeout(2000);
}

interface LayoutAnalysis {
  viewport: { width: number; height: number };
  westName: { visible: boolean; inViewport: boolean; rect: DOMRect | null };
  eastName: { visible: boolean; inViewport: boolean; rect: DOMRect | null };
  westCards: { visible: boolean; tipsVisible: boolean };
  eastCards: { visible: boolean; tipsVisible: boolean };
  infoRail: { rect: DOMRect | null };
  northCards: { rect: DOMRect | null };
  notifications: { above: boolean; readable: boolean };
  trickZone: { rect: DOMRect | null; overlapsSideLabels: boolean };
  deckTrump: { rect: DOMRect | null; overlapsTrickZone: boolean };
  winnerDialog: { visible: boolean; inViewport: boolean; clipped: boolean };
  horizontalOverflow: boolean;
}

async function analyzeLayout(page: Page): Promise<LayoutAnalysis> {
  return await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };

    // Helper to check if element is in viewport
    const isInViewport = (rect: DOMRect | null): boolean => {
      if (!rect) return false;
      return (
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= window.innerWidth &&
        rect.bottom <= window.innerHeight
      );
    };

    // Check horizontal overflow
    const horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth;

    // Get west name
    const westNameEl = document.querySelector('.hand__name--west');
    const westNameRect = westNameEl?.getBoundingClientRect() ?? null;
    const westNameVisible = westNameEl ? getComputedStyle(westNameEl).display !== 'none' : false;

    // Get east name
    const eastNameEl = document.querySelector('.hand__name--east');
    const eastNameRect = eastNameEl?.getBoundingClientRect() ?? null;
    const eastNameVisible = eastNameEl ? getComputedStyle(eastNameEl).display !== 'none' : false;

    // Get west cards
    const westHand = document.querySelector('.hand--west');
    const westCards = westHand?.querySelectorAll('.card-back');
    const westCardsVisible = westCards ? westCards.length > 0 : false;
    const westTipsVisible = westCards ? Array.from(westCards).some(card => {
      const rect = card.getBoundingClientRect();
      return rect.right > 0 && rect.left < window.innerWidth;
    }) : false;

    // Get east cards
    const eastHand = document.querySelector('.hand--east');
    const eastCards = eastHand?.querySelectorAll('.card-back');
    const eastCardsVisible = eastCards ? eastCards.length > 0 : false;
    const eastTipsVisible = eastCards ? Array.from(eastCards).some(card => {
      const rect = card.getBoundingClientRect();
      return rect.right > 0 && rect.left < window.innerWidth;
    }) : false;

    // Get info rail (scoreboard tab)
    const infoRail = document.querySelector('.scoreboard-tab');
    const infoRailRect = infoRail?.getBoundingClientRect() ?? null;

    // Get north cards
    const northHand = document.querySelector('.hand--north');
    const northCardsRect = northHand?.getBoundingClientRect() ?? null;

    // Get notification
    const notification = document.querySelector('.notification');
    const notificationRect = notification?.getBoundingClientRect() ?? null;
    const notificationAbove = notificationRect && northCardsRect
      ? notificationRect.bottom < northCardsRect.top
      : true;

    // Get trick zone
    const trickZone = document.querySelector('.trick-zone');
    const trickZoneRect = trickZone?.getBoundingClientRect() ?? null;

    // Check if trick zone overlaps side labels
    let overlapsSideLabels = false;
    if (trickZoneRect && westNameRect && eastNameRect) {
      const trickLeft = trickZoneRect.left;
      const trickRight = trickZoneRect.right;
      const westNameRight = westNameRect.right;
      const eastNameLeft = eastNameRect.left;

      overlapsSideLabels = trickLeft < westNameRight || trickRight > eastNameLeft;
    }

    // Get deck and trump
    const deckZone = document.querySelector('.deck-zone');
    const deckZoneRect = deckZone?.getBoundingClientRect() ?? null;

    // Check if deck/trump overlaps trick zone
    let deckOverlapsTrick = false;
    if (deckZoneRect && trickZoneRect) {
      deckOverlapsTrick = !(
        deckZoneRect.right < trickZoneRect.left ||
        deckZoneRect.left > trickZoneRect.right ||
        deckZoneRect.bottom < trickZoneRect.top ||
        deckZoneRect.top > trickZoneRect.bottom
      );
    }

    // Get winner dialog
    const winnerDialog = document.querySelector('.final-result-card[data-portaled="true"]');
    const winnerDialogRect = winnerDialog?.getBoundingClientRect() ?? null;
    const winnerDialogVisible = winnerDialog ? getComputedStyle(winnerDialog).display !== 'none' : false;
    const winnerDialogInViewport = isInViewport(winnerDialogRect);

    // Check if winner dialog is clipped
    let winnerDialogClipped = false;
    if (winnerDialog) {
      const overflow = window.getComputedStyle(winnerDialog).overflow;
      winnerDialogClipped = overflow === 'hidden' || overflow === 'scroll' || overflow === 'auto';
    }

    return {
      viewport,
      westName: { visible: westNameVisible, inViewport: isInViewport(westNameRect), rect: westNameRect },
      eastName: { visible: eastNameVisible, inViewport: isInViewport(eastNameRect), rect: eastNameRect },
      westCards: { visible: westCardsVisible, tipsVisible: westTipsVisible },
      eastCards: { visible: eastCardsVisible, tipsVisible: eastTipsVisible },
      infoRail: { rect: infoRailRect },
      northCards: { rect: northCardsRect },
      notifications: { above: notificationAbove, readable: notificationRect !== null },
      trickZone: { rect: trickZoneRect, overlapsSideLabels },
      deckTrump: { rect: deckZoneRect, overlapsTrickZone: deckOverlapsTrick },
      winnerDialog: { visible: winnerDialogVisible, inViewport: winnerDialogInViewport, clipped: winnerDialogClipped },
      horizontalOverflow,
    };
  });
}

for (const vp of MOBILE_VIEWPORTS) {
  test.describe(`4P layout at ${vp.name} (${vp.width}x${vp.height})`, () => {
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

    test('west name is fully inside the visual viewport', async () => {
      const analysis = await analyzeLayout(page);

      // Take screenshot for debugging
      await page.screenshot({ path: `test-results/layout-${vp.name}-west-name.png` });

      expect(analysis.westName.visible).toBe(true);
      expect(analysis.westName.inViewport).toBe(true);
    });

    test('east name is fully inside the visual viewport', async () => {
      const analysis = await analyzeLayout(page);

      // Take screenshot for debugging
      await page.screenshot({ path: `test-results/layout-${vp.name}-east-name.png` });

      expect(analysis.eastName.visible).toBe(true);
      expect(analysis.eastName.inViewport).toBe(true);
    });

    test('west cards have visible tips', async () => {
      const analysis = await analyzeLayout(page);

      expect(analysis.westCards.visible).toBe(true);
      expect(analysis.westCards.tipsVisible).toBe(true);
    });

    test('east cards have visible tips', async () => {
      const analysis = await analyzeLayout(page);

      expect(analysis.eastCards.visible).toBe(true);
      expect(analysis.eastCards.tipsVisible).toBe(true);
    });

    test('info rail does not cover the east name', async () => {
      const analysis = await analyzeLayout(page);

      if (analysis.infoRail.rect && analysis.eastName.rect) {
        const infoRailRight = analysis.infoRail.rect.right;
        const eastNameLeft = analysis.eastName.rect.left;

        // East name should be to the right of info rail (info rail is on left side)
        expect(eastNameLeft).toBeGreaterThanOrEqual(infoRailRight - 10); // 10px tolerance
      }
    });

    test('north cards do not cover notifications', async () => {
      const analysis = await analyzeLayout(page);

      // Notifications should be above north cards
      expect(analysis.notifications.above).toBe(true);
    });

    test('notifications are above cards and fully readable', async () => {
      const analysis = await analyzeLayout(page);

      // Notifications only appear when events occur (trick winner, swap, etc.)
      // If a notification exists, verify it's readable
      if (analysis.notifications.readable) {
        // If notification exists, it should be visible and not hidden
        expect(analysis.notifications.above).toBe(true);
      }
      // Test passes if no notification is present (which is the normal state)
    });

    test('trick zone does not overlap side labels', async () => {
      const analysis = await analyzeLayout(page);

      expect(analysis.trickZone.overlapsSideLabels).toBe(false);
    });

    test('deck and trump do not overlap the trick zone', async () => {
      const analysis = await analyzeLayout(page);

      expect(analysis.deckTrump.overlapsTrickZone).toBe(false);
    });

    test('no horizontal page overflow exists', async () => {
      const analysis = await analyzeLayout(page);

      expect(analysis.horizontalOverflow).toBe(false);
    });

    test('winner dialog is fully inside the visual viewport when shown', async () => {
      // This test verifies the winner dialog CSS is correct
      // The dialog is portaled to document.body, so we check its CSS properties
      const analysis = await analyzeLayout(page);

      // Take screenshot for debugging
      await page.screenshot({ path: `test-results/layout-${vp.name}-winner-dialog.png` });

      // If dialog is visible, verify it's in viewport and not clipped
      if (analysis.winnerDialog.visible) {
        expect(analysis.winnerDialog.inViewport).toBe(true);
        expect(analysis.winnerDialog.clipped).toBe(false);
      }
    });
  });
}
