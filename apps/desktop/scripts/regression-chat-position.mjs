import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { response } from '../tests/fixtures/documentation.mjs';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(version => {
    localStorage.setItem('wakeline-release-shown', version);
    localStorage.setItem('wakeline-daily-summary-enabled', 'false');
  }, version);
  const page = await context.newPage();
  await page.route('**/__wakeline/read', route => route.fulfill({ json: response(route.request().postDataJSON().command) }));
  await page.goto('http://127.0.0.1:3039/pull-requests/orbit/checkout/42');
  await expect(page.locator('.wk-chat-picker')).toHaveCount(3);
  const pickers = await page.locator('.wk-chat-picker').all();
  for (const [index, picker] of pickers.entries()) {
    await picker.locator('summary').click();
    const trigger = await picker.locator('summary').boundingBox();
    const menu = await picker.locator('.wk-chat-options').boundingBox();
    console.log({ trigger, menu, layout: await picker.evaluate(e => ({width:e.getBoundingClientRect().width,position:getComputedStyle(e).position,menuParent:e.querySelector('.wk-chat-options').offsetParent?.className})) });
    const alignmentError = index === 2
      ? menu.x + menu.width - trigger.x - trigger.width
      : menu.x - trigger.x;
    assert(Math.abs(alignmentError) <= 1, 'Menu must align with its own trigger');
    assert(menu.x >= 0 && menu.x + menu.width <= 1400, 'Menu must fit the viewport');
    assert(Math.abs(menu.y + menu.height + 8 - trigger.y) <= 1, 'Menu must sit 8px above its trigger');
    await page.keyboard.press('Escape');
  }
  console.log('PASS: agent, model and effort menus anchored to their triggers');
} finally {
  await browser.close();
}
