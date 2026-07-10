import { test, expect, type Page } from '@playwright/test';

const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '360x640', width: 360, height: 640 },
  { name: '375x667', width: 375, height: 667 },
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: '393x852', width: 393, height: 852 },
  { name: '414x896', width: 414, height: 896 },
  { name: '430x932', width: 430, height: 932 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
] as const;

const GAME_MODES = [
  { name: '2p-local-ai', variant: 'STANDARD_2P', presentationMode: 'local', teamMode: false },
  { name: '2p-online', variant: 'STANDARD_2P', presentationMode: 'online', teamMode: false },
  { name: '4p-local-ai', variant: 'STANDARD_4P', presentationMode: 'local', teamMode: true },
  { name: '4p-online', variant: 'STANDARD_4P', presentationMode: 'online', teamMode: true },
] as const;

async function startEndedGame(page: Page, variant: string, presentationMode: 'local' | 'online'): Promise<void> {
  await page.goto('http://localhost:5173');
  await page.waitForSelector('text=Briscas', { timeout: 10_000 });
  await page.locator('select').selectOption(variant);
  await page.locator('button:has-text("Jugar contra IA")').click();
  await page.waitForSelector('.game-shell', { timeout: 15_000 });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate((mode) => {
      window.dispatchEvent(new CustomEvent('briscas:e2e:end-game', { detail: { mode } }));
    }, presentationMode);
    if (await page.locator('.final-result-card[data-portaled="true"]').isVisible().catch(() => false)) {
      break;
    }
    await page.waitForTimeout(250);
  }
  await expect(page.locator('.final-result-card[data-portaled="true"]')).toBeVisible({ timeout: 10_000 });
}

async function collectFinalScores(page: Page): Promise<number[]> {
  return page.locator('.final-result-card dd').evaluateAll((nodes) =>
    nodes.map((node) => Number((node.textContent ?? '').match(/\d+/)?.[0] ?? '0')),
  );
}

async function expectInsideViewport(page: Page, selector: string): Promise<void> {
  const result = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(result.width).toBeGreaterThan(0);
  expect(result.height).toBeGreaterThan(0);
  expect(result.left).toBeGreaterThanOrEqual(0);
  expect(result.top).toBeGreaterThanOrEqual(0);
  expect(result.right).toBeLessThanOrEqual(result.viewportWidth);
  expect(result.bottom).toBeLessThanOrEqual(result.viewportHeight);
}

for (const mode of GAME_MODES) {
  for (const viewport of VIEWPORTS) {
    test(`score graph workflow works for ${mode.name} at ${viewport.name}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();

      await startEndedGame(page, mode.variant, mode.presentationMode);

      const summary = page.locator('.final-result-card[data-portaled="true"]');
      await expect(summary).toBeVisible();
      const finalScores = await collectFinalScores(page);
      expect(finalScores).toEqual(expect.arrayContaining([63, 57]));

      await page.getByRole('button', { name: /Ver gráfica/i }).click();

      const graphDialog = page.locator('.score-modal[role="dialog"]');
      await expect(graphDialog).toBeVisible();
      await expect(summary).toHaveCount(0);
      await expectInsideViewport(page, '.score-modal');

      const activeElementLabel = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
      expect(activeElementLabel).toContain('Cerrar');

      const chartContainer = page.locator('[data-testid="score-evolution-chart-container"]');
      const chartBox = await chartContainer.boundingBox();
      expect(chartBox).not.toBeNull();
      expect(chartBox!.width).toBeGreaterThan(0);
      expect(chartBox!.height).toBeGreaterThanOrEqual(260);

      const series = page.locator('[data-testid="score-series"]');
      expect(await series.count()).toBeGreaterThanOrEqual(2);
      await expect(page.locator('.score-chart__line').first()).toBeVisible();

      const plottedScores = await series.evaluateAll((nodes) => nodes.map((node) => Number((node as HTMLElement).dataset.finalScore ?? '0')));
      expect(plottedScores).toEqual(expect.arrayContaining(finalScores));

      const graphText = await graphDialog.textContent();
      expect(graphText).toContain('Totales finales acumulados');
      expect(graphText).toContain('63 pts');
      expect(graphText).toContain('57 pts');
      if (mode.teamMode) {
        expect(graphText).toContain('Equipo A');
        expect(graphText).toContain('Equipo B');
      } else {
        expect(graphText).toContain('Jugador');
        expect(graphText).toContain('IA');
      }

      const closeButtonReceivesPointer = await page.locator('.score-modal__close').evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return target === button || button.contains(target);
      });
      expect(closeButtonReceivesPointer).toBe(true);

      await page.getByRole('button', { name: /Cerrar estadisticas/i }).click();
      await expect(summary).toBeVisible();
      await expect(page.locator('.score-modal')).toHaveCount(0);
      const restoredFocus = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
      expect(restoredFocus).toContain('Ver gráfica');

      await page.getByRole('button', { name: /Ver gráfica/i }).click();
      await expect(graphDialog).toBeVisible();
      await expect(page.locator('.score-chart__line').first()).toBeVisible();

      await context.close();
    });
  }
}
