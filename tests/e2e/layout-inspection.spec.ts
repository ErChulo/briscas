import { test, expect, type Page } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 800 },
] as const;

async function start4PlayerGame(page: Page) {
  await page.goto('http://localhost:5173');
  await page.waitForSelector('text=Briscas', { timeout: 10_000 });

  // Select 4P variant
  await page.locator('select').selectOption('STANDARD_4P');
  await page.waitForTimeout(500);

  // Click "Jugar contra IA"
  await page.locator('button:has-text("Jugar contra IA")').click();

  // Wait for the 4P game board to appear
  await page.waitForSelector('.table-area--4p', { timeout: 15_000 });

  // Wait for cards to be dealt (deal animation + a little buffer)
  await page.waitForTimeout(1500);
}

async function analyzeLayout(page: Page, viewportName: string) {
  const results = await page.evaluate(() => {
    const table = document.querySelector('.table-area--4p');
    if (!table) return { error: 'No 4P table found' };

    const tableRect = table.getBoundingClientRect();

    // ── Card measurements ──
    const allCardViews = Array.from(table.querySelectorAll<HTMLElement>('.card-view, .card-back'));
    const cardSizes = allCardViews.map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        class: el.className,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      };
    });

    // ── Seat positions ──
    const seats: Record<string, any> = {};
    for (const side of ['top', 'left', 'right', 'bottom']) {
      const seat = table.querySelector<HTMLElement>(`.seat-4p--${side}`);
      if (seat) {
        const rect = seat.getBoundingClientRect();
        const style = window.getComputedStyle(seat);
        seats[side] = {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          transform: style.transform,
          visible: rect.right > 0 && rect.left < window.innerWidth,
        };
      }
    }

    // ── Trump peek position ──
    const trumpPeek = table.querySelector<HTMLElement>('.trump-peek-4p');
    let trumpInfo = null;
    if (trumpPeek) {
      const rect = trumpPeek.getBoundingClientRect();
      const card = trumpPeek.querySelector('.card-view');
      trumpInfo = {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        cardWidth: card ? Math.round(card.getBoundingClientRect().width) : null,
        cardHeight: card ? Math.round(card.getBoundingClientRect().height) : null,
        tableWidth: Math.round(tableRect.width),
        tableRight: Math.round(tableRect.right),
        distanceFromTableRight: Math.round(tableRect.right - rect.right),
      };
    }

    // ── Trick center ──
    const trickCenter = table.querySelector<HTMLElement>('.trick-center-4p');
    let trickInfo = null;
    if (trickCenter) {
      const rect = trickCenter.getBoundingClientRect();
      trickInfo = {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }

    // ── Cards per seat ──
    const ownerHand = table.querySelector<HTMLElement>('.owner-hand-4p');
    const ownerCards = ownerHand
      ? Array.from(ownerHand.querySelectorAll('.card-view')).length
      : 0;

    const topHand = table.querySelector<HTMLElement>('.seat-4p--top .mini-hand');
    const leftHand = table.querySelector<HTMLElement>('.seat-4p--left .mini-hand');
    const rightHand = table.querySelector<HTMLElement>('.seat-4p--right .mini-hand');

    const countCards = (hand: HTMLElement | null) =>
      hand ? Array.from(hand.querySelectorAll('.card-back')).length : 0;

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      table: {
        width: Math.round(tableRect.width),
        height: Math.round(tableRect.height),
        left: Math.round(tableRect.left),
        top: Math.round(tableRect.top),
      },
      cardCounts: {
        owner: ownerCards,
        top: countCards(topHand),
        left: countCards(leftHand),
        right: countCards(rightHand),
      },
      cardSizes: cardSizes.slice(0, 10),
      uniqueCardSizes: [...new Set(cardSizes.map((c) => `${c.width}x${c.height}`))],
      seats,
      trumpPeek: trumpInfo,
      trickCenter: trickInfo,
    };
  });

  return results;
}

test.describe('4P game board layout inspection', () => {
  for (const vp of VIEWPORTS) {
    test(`layout at ${vp.name} (${vp.width}x${vp.height})`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();

      try {
        await start4PlayerGame(page);

        // Take screenshot
        const screenshotPath = `test-results/layout-${vp.name}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: false });

        // Analyze layout
        const analysis = await analyzeLayout(page, vp.name);
        console.log(`\n=== Layout analysis at ${vp.name} ===`);
        console.log(JSON.stringify(analysis, null, 2));

        // ── Card size consistency checks ──
        if (analysis.uniqueCardSizes && analysis.uniqueCardSizes.length > 1) {
          console.log(`\n⚠️  MULTIPLE CARD SIZES DETECTED at ${vp.name}:`);
          console.log(`  Sizes: ${analysis.uniqueCardSizes.join(', ')}`);
          // This is a warning, not a failure — we want to visualize it
        }

        // ── Trump peek position checks ──
        if (analysis.trumpPeek) {
          const tp = analysis.trumpPeek;
          if (tp.distanceFromTableRight !== undefined && tp.distanceFromTableRight < 0) {
            console.log(`\n⚠️  TRUMP PEEK OVERFLOWS TABLE RIGHT edge by ${Math.abs(tp.distanceFromTableRight)}px`);
          }
          console.log(`  Trump peek at right edge: distance from table right = ${tp.distanceFromTableRight}px`);
        }

        // ── Seat visibility ──
        for (const [side, seat] of Object.entries(analysis.seats)) {
          if (seat) {
            console.log(`  ${side} seat: visible=${seat.visible}, pos=(${seat.left},${seat.top}), size=${seat.width}x${seat.height}`);
          }
        }

        console.log(`\nScreenshot saved: ${screenshotPath}`);
      } finally {
        await context.close();
      }
    });
  }
});
