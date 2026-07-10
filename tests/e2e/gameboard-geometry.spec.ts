import { mkdirSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const GEOMETRY_VIEWPORTS = [
  { name: '390x844', width: 390, height: 844, minTrickWidth: 62 },
  { name: '1280x720', width: 1280, height: 720, minTrickWidth: 120 },
  { name: '1440x900', width: 1440, height: 900, minTrickWidth: 140 },
  { name: '1920x1080', width: 1920, height: 1080, minTrickWidth: 150 },
] as const;

const NOTIFICATION_MODES = [
  { name: '2p', variant: 'STANDARD_2P' },
  { name: '4p', variant: 'STANDARD_4P' },
] as const;

async function startGame(page: Page, variant: string): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('text=Briscas', { timeout: 10_000 });
  await page.locator('select').selectOption(variant);
  await page.locator('button:has-text("Jugar contra IA")').click();
  await page.waitForSelector('.game-shell', { timeout: 15_000 });
  await page.waitForTimeout(1_000);
}

async function showStableTrick(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('briscas:e2e:show-trick', { detail: { longNames: true } }));
  });
  await expect(page.locator('.trick-zone .played-card')).toHaveCount(4, { timeout: 10_000 });
  await page.waitForTimeout(100);
}

async function completeTrick(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('briscas:e2e:show-trick', { detail: { completed: true, longNames: true } }));
  });
  await expect(page.locator('.notification:has-text("Baza para")')).toBeVisible({ timeout: 10_000 });
}

test.describe('4P gameboard geometry', () => {
  for (const viewport of GEOMETRY_VIEWPORTS) {
    test(`labels and trick cards render correctly at ${viewport.name}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();

      try {
        await startGame(page, 'STANDARD_4P');
        await showStableTrick(page);

        mkdirSync('test-results/geometry-after', { recursive: true });
        await page.screenshot({ path: `test-results/geometry-after/after-${viewport.name}-trick.png`, fullPage: false });

        const geometry = await page.evaluate(() => {
          const rectFor = (element: Element | null) => {
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            };
          };
          const intersects = (a: ReturnType<typeof rectFor>, b: ReturnType<typeof rectFor>) => {
            if (!a || !b) return false;
            return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          };
          const inViewport = (rect: ReturnType<typeof rectFor>) => Boolean(rect)
            && rect!.left >= 0
            && rect!.top >= 0
            && rect!.right <= window.innerWidth
            && rect!.bottom <= window.innerHeight;
          const labelLayer = document.querySelector('.player-label-layer');
          const labels = Array.from(document.querySelectorAll<HTMLElement>('.player-label'));
          const labelData = labels.map((label) => ({
            seat: label.dataset.playerLabel ?? '',
            rect: rectFor(label),
            parentClass: label.parentElement?.className ?? '',
            writingMode: getComputedStyle(label).writingMode,
            zIndex: Number.parseInt(getComputedStyle(labelLayer as HTMLElement).zIndex, 10),
          }));
          const cardRects = Array.from(document.querySelectorAll<HTMLElement>('.hand .card-view, .hand .card-back, .trick-zone .played-card'))
            .map((card) => ({ className: card.className, rect: rectFor(card) }));
          const labelOverlapsCard = labelData.some((label) => cardRects.some((card) => intersects(label.rect, card.rect)));
          const overlapPairs = labelData.flatMap((label) => cardRects
            .filter((card) => intersects(label.rect, card.rect))
            .map((card) => ({ seat: label.seat, label: label.rect, cardClass: card.className, card: card.rect })));
          const playedCards = Array.from(document.querySelectorAll<HTMLElement>('.trick-zone .played-card')).map((playedCard) => {
            const cardView = playedCard.querySelector<HTMLElement>('.card-view');
            const img = cardView?.tagName === 'IMG' ? cardView : cardView?.querySelector<HTMLElement>('img') ?? null;
            return {
              played: rectFor(playedCard),
              cardView: rectFor(cardView),
              image: rectFor(img),
              cardViewTag: cardView?.tagName ?? null,
            };
          });
          const table = document.querySelector<HTMLElement>('.table-area--4p');

          return {
            labelCount: labels.length,
            labelData,
            allLabelsInLayer: labels.every((label) => label.parentElement === labelLayer),
            allLabelsInViewport: labelData.every((label) => inViewport(label.rect)),
            labelOverlapsCard,
            overlapPairs,
            layerZ: {
              deck: Number.parseInt(getComputedStyle(document.querySelector<HTMLElement>('.deck-layer')!).zIndex, 10),
              hands: Number.parseInt(getComputedStyle(document.querySelector<HTMLElement>('.hand-clipping-layer')!).zIndex, 10),
              trick: Number.parseInt(getComputedStyle(document.querySelector<HTMLElement>('.trick-layer')!).zIndex, 10),
              labels: Number.parseInt(getComputedStyle(document.querySelector<HTMLElement>('.player-label-layer')!).zIndex, 10),
              notifications: Number.parseInt(getComputedStyle(document.querySelector<HTMLElement>('.notification-layer')!).zIndex, 10),
            },
            playedCards,
            trickCardCssWidth: Number.parseInt(table?.style.getPropertyValue('--trick-card-width') ?? '0', 10),
            trickTextInZone: document.querySelector('.trick-zone')?.textContent?.includes('Baza para') ?? false,
          };
        });

        expect(geometry.labelCount).toBe(4);
        expect(geometry.allLabelsInLayer).toBe(true);
        expect(geometry.allLabelsInViewport).toBe(true);
        expect(geometry.labelOverlapsCard, JSON.stringify(geometry.overlapPairs, null, 2)).toBe(false);
        expect(geometry.labelData.find((label) => label.seat === 'east')?.writingMode).toBe('vertical-rl');
        expect(geometry.labelData.find((label) => label.seat === 'west')?.writingMode).toBe('vertical-rl');
        expect(geometry.layerZ).toEqual({ deck: 10, hands: 20, trick: 30, labels: 40, notifications: 50 });
        expect(geometry.trickTextInZone).toBe(false);
        expect(geometry.trickCardCssWidth).toBeGreaterThanOrEqual(viewport.minTrickWidth);
        expect(geometry.playedCards).toHaveLength(4);

        for (const card of geometry.playedCards) {
          expect(card.played?.width ?? 0).toBeGreaterThanOrEqual(viewport.minTrickWidth);
          expect(card.cardView?.width ?? 0).toBeCloseTo(card.played?.width ?? 0, 1);
          expect(card.image?.width ?? 0).toBeCloseTo(card.played?.width ?? 0, 1);
          expect(card.cardView?.height ?? 0).toBeCloseTo(card.played?.height ?? 0, 1);
          expect(card.image?.height ?? 0).toBeCloseTo(card.played?.height ?? 0, 1);
          expect(card.cardViewTag).toBe('IMG');
        }
      } finally {
        await context.close();
      }
    });
  }
});

test.describe('trick resolution notifications', () => {
  for (const mode of NOTIFICATION_MODES) {
    for (const viewport of [GEOMETRY_VIEWPORTS[0], GEOMETRY_VIEWPORTS[1]]) {
      test(`winner notification stays outside trick cards for ${mode.name} at ${viewport.name}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        const page = await context.newPage();

        try {
          await startGame(page, mode.variant);
          await completeTrick(page);

          const result = await page.evaluate(() => {
            const notification = document.querySelector<HTMLElement>('.notification');
            const notificationRect = notification?.getBoundingClientRect() ?? null;
            const cardRects = Array.from(document.querySelectorAll<HTMLElement>('.trick-zone .played-card')).map((card) => card.getBoundingClientRect());
            const overlapsCard = notificationRect ? cardRects.some((card) => (
              notificationRect.left < card.right
              && notificationRect.right > card.left
              && notificationRect.top < card.bottom
              && notificationRect.bottom > card.top
            )) : false;

            return {
              text: notification?.textContent ?? '',
              insideTrickZone: Boolean(notification?.closest('.trick-zone')),
              parentClass: notification?.parentElement?.className ?? '',
              trickWinnerLabelCount: document.querySelectorAll('.trick-winner-label').length,
              trickTextInZone: document.querySelector('.trick-zone')?.textContent?.includes('Baza para') ?? false,
              overlapsCard,
            };
          });

          expect(result.text).toContain('Baza para');
          expect(result.insideTrickZone).toBe(false);
          expect(result.trickWinnerLabelCount).toBe(0);
          expect(result.trickTextInZone).toBe(false);
          expect(result.overlapsCard).toBe(false);
          if (mode.variant === 'STANDARD_4P') {
            expect(result.parentClass).toContain('notification-layer');
          }
        } finally {
          await context.close();
        }
      });
    }
  }
});
