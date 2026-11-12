import assert from 'node:assert/strict';
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
    await expect(page.locator('.wk-story-dots button')).toHaveCount(9);
    const titles = language === 'es'
      ? ["Más espacio para conversar.","Todas las capturas que necesites.","La tarjeta se queda donde la dejas.","Números completos, siempre.","Rutas largas, dentro de su tarjeta.","Actualizar, en la mitad de tiempo.","Listo desde que enciendes.","Tu día, en una notificación.","Ocho cambios, listos."]
      : ["More room to talk it through.","Every screenshot you need.","Cards stay where you put them.","Whole numbers, every time.","Long paths stay inside their card.","Refresh in half the time.","Ready when you switch on.","Your day in one notification.","Eight changes, done."];
    for (const [index, title] of titles.entries()) {
      await page.locator('.wk-story-dots button').nth(index).click();
      await expect(page.locator('#wk-release-title')).toHaveText(title);
      await expect(page.locator('.wk-release-footer > span')).toHaveText(`${index + 1} / 9`);
    }
    await expect(page.locator('.wk-release-head')).toContainText(`v${version}`);
    await page.locator('.wk-story-next').click();
    await expect(page.locator('.wk-release')).toHaveCount(0);
    // Escape closes it too, and it reopens on the first slide.
    await page.evaluate(() => window.dispatchEvent(new Event('wakeline:release-history')));
    await page.locator('.wk-story-dots button').nth(4).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.wk-release')).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event('wakeline:release-history')));
    await expect(page.locator('#wk-release-title')).toHaveText(titles[0]);
    // Every scene fits its frame and leaves room for its text, still and moving, at each size.
    await page.evaluate(() => window.dispatchEvent(new Event('wakeline:release-history')));
    for (const viewport of [{ width: 1400, height: 1000 }, { width: 960, height: 600 }, { width: 700, height: 600 }]) {
      await page.setViewportSize(viewport);
      for (let index = 0; index < titles.length; index++) {
        await page.locator('.wk-story-dots button').nth(index).click();
        await expect(page.locator('#wk-release-title')).toHaveText(titles[index]);
        // The slide text is never cut: it fits or the slide scrolls to it.
        await page.locator('.wk-story-copy p').scrollIntoViewIfNeeded();
        await expect(page.locator('.wk-story-copy p')).toBeInViewport({ ratio: 0.99 });
        await page.locator('.wk-story-viewport').evaluate((element) => element.scrollTo(0, 0));
        for (const motion of ['reduce', 'no-preference']) {
          await page.emulateMedia({ reducedMotion: motion });
          for (const time of motion === 'reduce' ? [0] : [0, 1500, 3000, 4500, 5900]) {
            const problems = await page.evaluate((time) => {
              const art = document.querySelector('.wk-story-viewport .wk-update-art');
              for (const animation of art.getAnimations({ subtree: true })) {
                animation.pause();
                animation.currentTime = time;
              }
              const frame = art.getBoundingClientRect();
              const copy = document.querySelector('.wk-story-copy').getBoundingClientRect();
              const issues = [];
              // Hidden while it waits to slide in: not a visible clip.
              const hidden = (element) => {
                for (let node = element; node && node !== art; node = node.parentElement)
                  if (Number(getComputedStyle(node).opacity) < 0.05) return true;
                return false;
              };
              for (const element of art.querySelectorAll('*')) {
                if (hidden(element)) continue;
                const box = element.getBoundingClientRect();
                if (box.width && box.height && (box.left < frame.left - 1 || box.right > frame.right + 1 || box.top < frame.top - 1 || box.bottom > frame.bottom + 1)) issues.push('clipped ' + (element.className?.baseVal ?? element.className));
              }
              if (Math.min(frame.bottom, copy.bottom) > Math.max(frame.top, copy.top) + 1 && Math.min(frame.right, copy.right) > Math.max(frame.left, copy.left) + 1) issues.push('text overlaps scene');
              const surface = document.querySelector('.wk-release-surface');
              if (surface.scrollWidth > surface.clientWidth + 1) issues.push('horizontal overflow');
              const counter = document.querySelector('.wk-release-footer > span').getBoundingClientRect();
              const footer = document.querySelector('.wk-release-footer').getBoundingClientRect();
              if (Math.abs(counter.left + counter.width / 2 - (footer.left + footer.width / 2)) > 2) issues.push('counter not centred');
              return issues;
            }, time);
            assert.deepEqual(problems, [], `${language} ${viewport.width}x${viewport.height} slide ${index + 1} ${motion} ${time}ms`);
          }
        }
      }
    }
    await page.keyboard.press('Escape');
    console.log(`${language}: 0.1.9 presentation: nine slides, titles, counter, Escape, reopening and scene bounds at three sizes passed`);
    await context.close();
  }
} finally {
  await browser.close();
}
