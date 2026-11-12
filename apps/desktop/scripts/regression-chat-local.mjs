import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { response } from '../tests/fixtures/documentation.mjs';
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(version => {
    localStorage.setItem('wakeline-release-shown', version);
    localStorage.setItem('wakeline-lang', 'es');
    localStorage.setItem('wakeline-daily-summary-enabled', 'false');
    localStorage.setItem('wakeline-chat:overview:', JSON.stringify([
      {id: 1, role: 'user', text: 'Revisa mis cambios'},
      {id: 2, role: 'assistant', model: 'claude-sonnet-5-5', text: 'Esta es la revisión de tus **cambios**.\n\n- Revisa `src/example.ts`.\n- Conserva las decisiones del usuario.'},
    ]));
  }, version);
  const page = await context.newPage();
  let sentImages=0;
  await page.route('**/__wakeline/read', route => {
    const {command,args}=route.request().postDataJSON();
    if(command==='ask_review_agent')sentImages=args.options.images.length;
    return route.fulfill({json: response(command)});
  });
  await page.goto('http://127.0.0.1:3039/pull-requests');
  const dock = page.locator('.wk-chat-dock');
  await expect(dock).toBeVisible();
  await expect(page.locator('.wk-chat-resize i')).toHaveCount(0);
  const start = await dock.boundingBox();
  const grip = page.getByRole('separator', { name: 'Ampliar chat' });
  const handle = await grip.boundingBox();
  assert(handle, 'Resizable chat handle must exist');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 30);
  await page.mouse.down();
  await page.mouse.move(handle.x - 180, handle.y + 30, {steps: 8});
  await page.mouse.up();
  await expect.poll(async () => (await dock.boundingBox()).width).toBeGreaterThan(start.width + 150);
  assert((await dock.boundingBox()).width > start.width + 150);
  const user = await page.locator('.msg-user').boundingBox();
  const assistant = await page.locator('.msg-assistant').boundingBox();
  assert(user.x > assistant.x, 'Agent must be on the left and user on the right');
  await expect(page.locator('.msg-assistant .wk-message-meta')).toHaveCount(0);
  await expect(page.locator('.msg-assistant .wk-thinking-logo')).toHaveCount(0);
  await expect(page.locator('.msg-assistant')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.msg-assistant')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.msg-assistant p').first()).toHaveCSS('font-weight', '400');
  await expect(page.locator('.msg-assistant strong').first()).toHaveCSS('font-weight', '600');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  await page.locator('input[type=file]').setInputFiles(['sample.png','second.png','third.png','fourth.png'].map(name=>({name,mimeType:'image/png',buffer:png})));
  await page.getByRole('button', {name: 'Ampliar imagen: sample.png'}).click();
  await expect(page.locator('.wk-image-viewer img')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wk-image-viewer')).toHaveCount(0);
  await page.locator('textarea').fill('Revisa esta imagen');
  await page.locator('.composer .send').click();
  await expect.poll(()=>sentImages).toBe(4);
  await page.locator('.msg-user').last().getByRole('button', {name: 'Ampliar imagen: sample.png'}).click();
  await expect(page.locator('.wk-image-viewer img')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('http://127.0.0.1:3039/');
  await expect(page.locator('.overview-grid .chart')).toBeVisible();
  const chart=await page.locator('.overview-grid .chart').boundingBox();
  const chartCard=await page.locator('.overview-grid > .card').first().boundingBox();
  assert(chartCard.y+chartCard.height-chart.y-chart.height<30,'Chart must fill the card without a large empty area');
  await expect(page.locator('.wk-chat-dock')).toHaveCount(0);
  for(const route of ['/cards','/repositories','/settings']){
    await page.goto('http://127.0.0.1:3039'+route);
    await expect(page.locator('.rail-account')).toBeVisible();
    await expect(page.locator('.wk-chat-dock')).toHaveCount(0);
    await expect(page.locator('.main-bar button[title="Chat de revisión"]')).toHaveCount(0);
  }
  await page.goto('http://127.0.0.1:3039/pull-requests');
  await expect(page.locator('.wk-chat-dock')).toBeVisible();
  console.log('PASS: chat resizes left, user/agent align correctly, draft and sent images enlarge');
} finally { await browser.close(); }
