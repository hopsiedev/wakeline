import { readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { response } from '../tests/fixtures/documentation.mjs';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
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
    await page.route('**/__wakeline/read', async route => {
      await route.fulfill({ json: response(route.request().postDataJSON().command) });
    });
    await page.goto('http://127.0.0.1:3039/pull-requests/orbit/checkout/42');
    const picker = page.locator('.wk-editor-open details');
    const open = async () => {
      await picker.locator('summary').click();
      await expect(picker).toHaveAttribute('open', '');
    };
    await open();
    await page.locator('.wk-editor-open > small').click({ position: { x: 5, y: 5 } });
    await expect(picker).not.toHaveAttribute('open', '');
    await open();
    await page.locator('.wk-pr-title').click();
    await expect(picker).not.toHaveAttribute('open', '');
    await open();
    await page.keyboard.press('Escape');
    await expect(picker).not.toHaveAttribute('open', '');
    await open();
    await picker.getByRole('button', { name: 'Cursor', exact: true }).click();
    await expect(picker).not.toHaveAttribute('open', '');
    await expect(page.locator('.wk-editor-open > div > button')).toContainText('Cursor');
    console.log(`${language}: outside click, adjacent helper, Escape and editor selection passed`);
    await context.close();
  }
} finally {
  await browser.close();
}
