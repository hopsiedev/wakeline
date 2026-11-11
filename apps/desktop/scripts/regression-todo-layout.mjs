import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { response } from '../tests/fixtures/documentation.mjs';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
const longText = 'verylongprojectandbranchname'.repeat(12);
const browser = await chromium.launch();
try {
  for (const language of ['es', 'en']) {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    await context.addInitScript(({ language, version }) => {
      localStorage.setItem('wakeline-lang', language);
      localStorage.setItem('wakeline-release-shown', version);
      localStorage.setItem('wakeline-daily-summary-enabled', 'false');
    }, { language, version });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.route('**/__wakeline/read', async route => {
      const { command } = route.request().postDataJSON();
      let data = response(command);
      if (command === 'get_dashboard_data') data = {
        ...data,
        cards: [{ ...data.cards[0], title: longText, project: longText,
          location: 'https://github.com/example/project/actions/runs/123456/job/' + longText,
          evidence: longText, code_excerpt: longText }],
      };
      await route.fulfill({ json: data });
    });
    for (const width of [1280, 834, 390]) {
      await page.setViewportSize({ width, height: 972 });
      await page.goto('http://127.0.0.1:3039/cards');
      await page.locator('.wk-kanban-card').first().click({ position: { x: 24, y: 24 } });
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const sizes = await dialog.evaluate(element => {
        const body = element.querySelector('.wk-todo-side-body');
        return { width: element.clientWidth, scroll: element.scrollWidth,
          right: element.getBoundingClientRect().right,
          contentRight: body.getBoundingClientRect().right };
      });
      assert.ok(sizes.scroll <= sizes.width + 1,
        `${language}/${width}: detail overflows horizontally: ${JSON.stringify(sizes)}`);
      assert.ok(sizes.contentRight <= sizes.right + 1, 'detail body stays inside dialog');
      await dialog.locator('.real-actions').last().scrollIntoViewIfNeeded();
      mkdirSync('../../packages/todo-layout', { recursive: true });
      await page.screenshot({ path: `../../packages/todo-layout/${language}-${width}.png` });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      console.log(`${language}/${width}: long To do content fits and dialog closes`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
