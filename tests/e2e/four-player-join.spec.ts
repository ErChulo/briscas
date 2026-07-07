import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';
const PLAYERS = ['Host', 'Tito', 'Maria', 'Chucho'];

async function waitForMenu(page: Page) {
  await page.waitForSelector('text=Tu nombre', { timeout: 15_000 });
  await expect(page.locator('button:has-text("Crear sala online")')).toBeEnabled();
}

async function fillName(page: Page, name: string) {
  const input = page.locator('input[maxlength="24"]');
  await input.fill(name);
}

test.describe('4-player online join', () => {
  test('host creates room and 3 players join with correct names', async ({ browser }) => {
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];

    try {
      // Launch 4 separate browser contexts
      for (let i = 0; i < 4; i++) {
        const context = await browser.newContext();
        contexts.push(context);
        const page = await context.newPage();

        const playerName = PLAYERS[i];
        page.on('console', (msg) => {
          if (msg.text().includes('[')) {
            console.log(`  [${playerName}] ${msg.text()}`);
          }
        });
        pages.push(page);
      }

      // --- PLAYER 1: HOST creates the room ---
      const hostPage = pages[0];
      await hostPage.goto(BASE_URL);
      await waitForMenu(hostPage);

      await hostPage.locator('select').selectOption('STANDARD_4P');
      await fillName(hostPage, PLAYERS[0]);
      await hostPage.locator('button:has-text("Crear sala online")').click();

      await hostPage.waitForSelector('.lobby-shell', { timeout: 20_000 });

      const gameCode = await hostPage.locator('.lobby-card h1').textContent();
      console.log(`\n=== Room created: ${gameCode} ===\n`);
      expect(gameCode).toBeTruthy();

      await expect(hostPage.locator('.player-list')).toContainText(PLAYERS[0]);
      console.log(`✓ Host "${PLAYERS[0]}" in lobby`);

      // --- PLAYERS 2-4: JOIN the room ---
      for (let i = 1; i < 4; i++) {
        const joinerPage = pages[i];
        const joinerName = PLAYERS[i];

        await joinerPage.goto(BASE_URL);
        await waitForMenu(joinerPage);

        await fillName(joinerPage, joinerName);
        await joinerPage.locator('input[name="roomCode"]').fill(gameCode!);
        await joinerPage.locator('button:has-text("Unirse online")').click();

        await joinerPage.waitForSelector('.lobby-shell', { timeout: 20_000 });
        console.log(`✓ Player "${joinerName}" joined`);
      }

      // Wait for Firestore subscriptions to propagate to all pages
      console.log('\nWaiting for subscriptions to propagate...');
      await hostPage.waitForTimeout(5000);

      // --- VERIFY: Each player's lobby shows ALL 4 names ---
      console.log('\n=== Verification ===\n');

      for (let i = 0; i < 4; i++) {
        const page = pages[i];
        const playerName = PLAYERS[i];

        // Get all player names from the lobby
        const lobbyText = await page.locator('.player-list').textContent();
        console.log(`[${playerName}] lobby text: ${lobbyText?.trim()}`);

        // Verify each expected player name is present
        for (const expectedName of PLAYERS) {
          const items = page.locator('.player-list li');
          const count = await items.count();
          const names: string[] = [];
          for (let j = 0; j < count; j++) {
            const span = items.nth(j).locator('span');
            const text = await span.textContent();
            if (text) names.push(text.trim());
          }
          expect(names).toContain(expectedName);
        }
        console.log(`✓ [${playerName}] sees all 4 names`);

        // Verify this player has the is-local marker
        const localPlayer = page.locator('.player-list li.is-local span');
        await expect(localPlayer).toHaveText(playerName);
        console.log(`✓ [${playerName}] sees own name "${playerName}" as local`);
      }

      console.log('\n=== ALL 4 PLAYERS VERIFIED ===\n');
    } finally {
      for (const ctx of contexts) {
        await ctx.close();
      }
    }
  });
});
