import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { response } from '../tests/fixtures/documentation.mjs';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
const browser = await chromium.launch();
try {
  for (const language of ['es', 'en']) {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    await context.addInitScript(({ version, language }) => {
      localStorage.setItem('wakeline-release-shown', version);
      localStorage.setItem('wakeline-lang', language);
      localStorage.setItem('wakeline-daily-summary-enabled', 'false');
    }, { version, language });
    const page = await context.newPage();
    await page.route('**/__wakeline/read', route => route.fulfill({ json: response(route.request().postDataJSON().command) }));
    await page.goto('http://127.0.0.1:3039/');
    await expect(page.locator('.rail-account')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('wakeline:release-history')));
    await page.locator('.wk-release-footer button').first().click();
    await expect(page.locator('.wk-release')).toHaveAttribute('data-view', 'all');
    // Exercise a future entry and longer translated copy without changing shipped notes.
    await page.evaluate(() => {
      const section = document.querySelector('.wk-unified-change').cloneNode(true);
      section.querySelector('h3').textContent += ' — '.repeat(6) + 'LongFutureFeatureNameWithoutSpaces'.repeat(4);
      section.querySelector('p').textContent = section.querySelector('p').textContent.repeat(8);
      document.querySelector('.wk-release-fixes').before(section);
      const fix = document.querySelector('.wk-release-fixes li').cloneNode(true);
      fix.lastElementChild.textContent = fix.lastElementChild.textContent.repeat(10);
      document.querySelector('.wk-release-fixes ul').append(fix);
    });
    for (const viewport of [{ width: 1400, height: 1000 }, { width: 960, height: 600 }, { width: 700, height: 600 }]) {
      await page.setViewportSize(viewport);
      const problems = await page.evaluate(() => {
        const issues = [];
        const rect = element => element.getBoundingClientRect();
        for (const [index, section] of [...document.querySelectorAll('.wk-unified-change')].entries()) {
          const art = section.querySelector('.wk-update-art');
          const a = rect(art), text = rect(section.lastElementChild);
          if (Math.min(a.right, text.right) > Math.max(a.left, text.left) + 1 && Math.min(a.bottom, text.bottom) > Math.max(a.top, text.top) + 1) issues.push(`slide ${index}: text overlaps illustration`);
          for (const content of [...art.querySelectorAll('*')].filter(e => !e.closest('.wk-patch-refresh-track, .wk-patch-progress > i'))) {
            const r = rect(content);
            if (r.width && r.height && (r.left < a.left - 1 || r.right > a.right + 1 || r.top < a.top - 1 || r.bottom > a.bottom + 1)) issues.push(`slide ${index}: clipped ${content.className?.baseVal ?? content.className ?? content.tagName}`);
          }
        }
        const scroll = document.querySelector('.wk-release-scroll');
        if (scroll.scrollWidth > scroll.clientWidth + 1) issues.push('horizontal overflow');
        return issues;
      });
      assert.deepEqual(problems, [], `${language} ${viewport.width}x${viewport.height}`);
      await page.locator('.wk-release-fixes li').last().scrollIntoViewIfNeeded();
      await expect(page.locator('.wk-release-fixes li').last()).toBeInViewport();
      await expect(page.locator('.wk-release-footer button').last()).toBeInViewport();
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const time of [0, 1500, 3000, 4500]) {
      const clipped = await page.evaluate(time => {
        for (const animation of document.querySelector('.wk-release-scroll').getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = time;
        }
        return [...document.querySelectorAll('.wk-unified-change .wk-update-art')].flatMap((art, index) => {
          const frame = art.getBoundingClientRect();
          return [...art.children].filter(e => !e.classList.contains('wk-art-caption')).filter(e => {
            const box = e.getBoundingClientRect();
            return box.left < frame.left - 1 || box.right > frame.right + 1 || box.top < frame.top - 1 || box.bottom > frame.bottom + 1;
          }).map(() => index);
        });
      }, time);
      assert.deepEqual(clipped, [], `${language}: animation bounds at ${time}ms`);
    }
    console.log(`${language}: All changes illustrations, text, final fix and footer fit at all viewports`);
    await context.close();
  }
} finally {
  await browser.close();
}
