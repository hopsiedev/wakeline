import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { response } from '../tests/fixtures/documentation.mjs';
const base = process.env.WAKELINE_DOCS_URL ?? 'http://localhost:3039';
const output = resolve('../../assets/screenshots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const language of ['en', 'es']) {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      locale: language,
      reducedMotion: 'reduce',
      colorScheme: 'dark',
    });
    await context.addInitScript(
      ({ language }) => {
        localStorage.setItem('wakeline-lang', language);
        localStorage.setItem('wakeline-release-shown', '0.1.5');
        localStorage.setItem('wakeline-daily-summary-enabled', 'false');
        localStorage.setItem('wakeline-accent', 'teal');
        localStorage.setItem('wakeline-nav-collapsed', 'false');
        sessionStorage.setItem('wakeline-review-chat-open', 'true');
      },
      { language }
    );
    const page = await context.newPage();
    const requests = [];
    await page.route('**/__wakeline/read', async (route) => {
      const { command, args } = route.request().postDataJSON();
      requests.push({ command, args });
      await route.fulfill({ json: response(command) });
    });
    const capture = async (name) => {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: resolve(output, name + '-' + language + '.png'),
        animations: 'disabled',
      });
    };
    await page.goto(base + '/');
    await expect(page.locator('.stats')).toBeVisible();
    await capture('summary');
    await page.goto(base + '/cards');
    await expect(page.locator('.wk-kanban-card')).toHaveCount(6);
    await capture('cards');
    await page.locator('.wk-kanban-card').first().click();
    await expect(page.locator('[role=dialog],dialog').first()).toBeVisible();
    await capture('card-detail');
    await page.goto(base + '/pull-requests');
    await expect(page.locator('.wk-pr-chat')).toBeVisible();
    const overview = await page.locator('.wk-pr-chat').boundingBox();
    await page.locator('.review-row').first().click();
    await expect(page.locator('.wk-pr-body')).toBeVisible();
    const pr = await page.locator('.wk-pr-chat').boundingBox();
    const summary = await page.locator('.wk-pr-body>.MuiBox-root').boundingBox();
    assert.ok(Math.abs(pr.y - summary.y) < 2, 'PR summary and chat must align');
    assert.ok(Math.abs(pr.x - overview.x) < 2, 'Chat must retain x between overview and PR');
    assert.ok(Math.abs(pr.y - overview.y) < 2, 'Chat must retain y between overview and PR');
    assert.ok(Math.abs(pr.width - overview.width) < 2, 'Chat must retain width');
    await expect(page.locator('.composer-input')).toHaveCSS('resize', 'none');
    const emptyHeight = (await page.locator('.composer-input').boundingBox()).height;
    await page.locator('.composer-input').fill('Review this line.\n'.repeat(16));
    await expect
      .poll(async () => (await page.locator('.composer-input').boundingBox()).height)
      .toBeGreaterThan(emptyHeight);
    await page.locator('.composer-input').fill('');
    await expect(page.locator('.composer-input')).toHaveCSS('height', '72px');
    await page.locator('.wk-pr-head button[aria-expanded]').click();
    await expect(page.locator('.wk-pr-chat')).toHaveCount(0);
    await page.locator('.wk-pr-head button[aria-expanded]').click();
    await expect(page.locator('.wk-pr-chat')).toBeVisible();
    await capture('pr-review');
    await page.goto(base + '/repositories');
    await expect(page.getByRole('button',{name:'orbit/checkout',exact:true})).toBeVisible();
    await capture('repositories');
    await page.goto(base + '/connections');
    await expect(page.getByRole('heading',{name:'Claude Code',exact:true})).toBeVisible();
    await capture('connections');
    await page.goto(base + '/settings');
    await expect(page.locator('.wk-settings-layout')).toBeVisible();
    await capture('settings');
    await page.evaluate(() => window.dispatchEvent(new Event('wakeline:open-summary')));
    await expect(page.locator('dialog,[role=dialog]').first()).toBeVisible();
    await capture('daily-summary');
    await page.reload();
    await expect(page.locator('.wk-settings-layout')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('wakeline:release-history')));
    await expect(page.locator('.wk-release')).toBeVisible();
    await capture('updates');
    await page.goto(base + '/pull-requests');
    await page.setViewportSize({ width: 900, height: 1000 });
    await expect(page.locator('.wk-pr-chat')).toBeVisible();
    const before = (await page.locator('.wk-pr-chat').boundingBox()).height;
    await page.locator('.main-scroll').evaluate((el) => (el.scrollTop = 300));
    assert.equal(
      (await page.locator('.wk-pr-chat').boundingBox()).height,
      before,
      'scroll must not resize chat'
    );
    assert.ok(requests.every((r) => !r.command.includes('token')));
    console.log(language + ': screenshots and review-layout checks passed');
    await context.close();
  }
} finally {
  await browser.close();
}
