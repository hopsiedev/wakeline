import { readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { response } from '../tests/fixtures/documentation.mjs';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
const browser = await chromium.launch();
try {
  for (const language of ['es', 'en']) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript(({ version, language }) => {
      localStorage.setItem('wakeline-release-shown', version);
      localStorage.setItem('wakeline-daily-summary-enabled', 'false');
      localStorage.setItem('wakeline-lang', language);
    }, { version, language });
    const page = await context.newPage();
    await page.route('**/__wakeline/read', route => route.fulfill({ json: response(route.request().postDataJSON().command) }));
    await page.goto('http://127.0.0.1:3039/');
    await page.evaluate(() => window.dispatchEvent(new Event('wakeline:release-history')));
    await expect(page.locator('.wk-story-dots button')).toHaveCount(7);
    const titles = language === 'es'
      ? ['Configuración, siempre a mano.', 'Tus PR, al momento.', 'Mérito a quien lo hizo.', 'Solo las conversaciones reales.', 'Cada día, en su sitio.', 'Vigila desde To do.', 'Seis correcciones, listas.']
      : ['Settings, always responsive.', 'Your PRs, right away.', 'Credit where it is due.', 'Only real conversations.', 'Every day in its place.', 'Watch from To do.', 'Six fixes, done.'];
    for (const [index, title] of titles.entries()) {
      await page.locator('.wk-story-dots button').nth(index).click();
      await expect(page.locator('#wk-release-title')).toHaveText(title);
      await expect(page.locator('.wk-release-footer > span')).toHaveText(`${index + 1} / 7`);
    }
    await expect(page.locator('.wk-release-head')).toContainText(`v${version}`);
    await page.locator('.wk-story-next').click();
    await expect(page.locator('.wk-release')).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event('wakeline:release-history')));
    await expect(page.locator('#wk-release-title')).toHaveText(titles[0]);
    console.log(`${language}: production release opens A + C, seven slides, version and reopening passed`);
    await context.close();
  }
} finally {
  await browser.close();
}
