import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { response } from '../tests/fixtures/documentation.mjs';

const browser = await chromium.launch();
const failures = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 720 },
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    localStorage.setItem('wakeline-lang', 'en');
    localStorage.setItem('wakeline-release-shown', '0.1.6');
    localStorage.setItem('wakeline-daily-summary-enabled', 'false');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let slow = false;
  let slowChat = false;
  await page.route('**/__wakeline/read', async (route) => {
    const { command } = route.request().postDataJSON();
    if (slowChat && command.startsWith('ask_'))
      await new Promise((resolve) => setTimeout(resolve, 1800));
    if (slow && command === 'get_github_workspace')
      await new Promise((resolve) => setTimeout(resolve, 1500));
    let data =
      command === 'ask_review_agent' || command === 'ask_pr_agent'
        ? 'Saved answer for this session'
        : response(command);
    if (command === 'get_github_workspace')
      data = {
        ...data,
        user: { ...data.user, avatar_url: 'https://avatars.githubusercontent.com/u/1' },
      };
    if (command === 'get_account')
      data = {
        ...data,
        github: { ...data.github, avatar_url: 'https://avatars.githubusercontent.com/u/1' },
      };
    await route.fulfill({ json: data });
  });
  const pickSession = async (name) => {
    await page.locator('.wk-session-picker summary').click();
    await page.getByRole('menuitemradio', { name }).first().click();
  };
  const check = async (name, fn) => {
    try {
      await fn();
      console.log(name + ': passed');
    } catch (error) {
      failures.push(name + ': ' + error.message);
    }
  };
  slow = true;
  await page.goto('http://127.0.0.1:3039/pull-requests');
  await expect(page.locator('.wk-loading-skeleton')).toBeVisible();
  await expect(page.locator('.wk-pr-chat button[type="submit"]')).toBeDisabled();
  await expect(page.locator('.review-list')).toBeVisible();
  slow = false;
  await check('chat remains at the right and survives route changes and reload', async () => {
    await page.locator('.wk-pr-chat textarea').fill('Remember this conversation');
    await expect(page.locator('.wk-pr-chat button[type="submit"]')).toBeEnabled();
    await page.locator('.wk-pr-chat textarea').press('Enter');
    await expect(page.getByText('Saved answer for this session', { exact: true })).toBeVisible();
    await page.locator('.rail .rail-btn[href="/"]').click();
    await expect(page.locator('.wk-pr-chat')).toBeVisible();
    await expect(page.getByText('Saved answer for this session', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Saved answer for this session', { exact: true })).toBeVisible();
  });
  await check('PR sessions share one dock and keep separate context', async () => {
    await page.goto('http://127.0.0.1:3039/pull-requests/orbit/checkout/42');
    await expect(page.locator('.wk-pr-chat')).toHaveCount(1);
    await page.locator('.wk-pr-chat textarea').fill('Question only about PR 42');
    await expect(page.locator('.wk-pr-chat button[type="submit"]')).toBeEnabled();
    await page.locator('.wk-pr-chat textarea').press('Enter');
    await expect(page.getByText('Saved answer for this session', { exact: true })).toBeVisible();
    await pickSession('All repositories');
    await expect(page.getByText('Remember this conversation', { exact: true })).toBeVisible();
    await expect(page.getByText('Question only about PR 42', { exact: true })).toHaveCount(0);
    await pickSession('orbit/checkout #42');
    await expect(page.getByText('Question only about PR 42', { exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'Split', exact: true }).click();
    const diffOverflow = await page
      .locator('.wk-diff-scroll')
      .first()
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    assert.ok(diffOverflow <= 1, 'split diff fits with wrapped lines');
  });
  await check('sessions without messages are not kept', async () => {
    await page.goto('http://127.0.0.1:3039/pull-requests/orbit/checkout/41');
    await expect(page.locator('.wk-pr-chat')).toHaveCount(1);
    await page.goto('http://127.0.0.1:3039/pull-requests');
    await page.locator('.wk-session-picker summary').click();
    await expect(page.getByRole('menuitemradio', { name: 'orbit/checkout #42' })).toHaveCount(1);
    await expect(page.getByRole('menuitemradio', { name: 'orbit/checkout #41' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitemradio').first()).toBeHidden();
  });
  await check('saved GitHub workspace is visible before background response', async () => {
    await page.goto('http://127.0.0.1:3039/');
    await expect(page.locator('.stat-value').first()).toBeVisible();
    slow = true;
    await page.reload();
    await expect(page.locator('.stat-value').first()).not.toHaveText('0', { timeout: 800 });
    slow = false;
  });
  await check('an answer arriving after a session switch updates the reopened thread', async () => {
    await pickSession('orbit/checkout #42');
    await page.locator('.wk-pr-chat textarea').fill('Pending answer after session switch');
    await expect(page.locator('.wk-pr-chat button[type="submit"]')).toBeEnabled();
    slowChat = true;
    await page.locator('.wk-pr-chat textarea').press('Enter');
    await pickSession('All repositories');
    await pickSession('orbit/checkout #42');
    await expect(page.getByText('Saved answer for this session', { exact: true })).toHaveCount(2);
    slowChat = false;
  });
  await check('settings tabs remain responsive', async () => {
    await page.goto('http://127.0.0.1:3039/settings');
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const tab of ['Appearance', 'Versions', 'General']) {
        await page
          .locator('.wk-settings-tabs')
          .getByRole('button', { name: tab, exact: true })
          .click();
        await expect(page.locator('.wk-settings-section > h2')).toHaveText(tab);
      }
    }
    assert.deepEqual(errors, []);
  });
  await check('small layouts fit the content viewport', async () => {
    for (const width of [1366, 1024, 960]) {
      const height = width === 960 ? 600 : 720;
      await page.setViewportSize({ width, height });
      for (const route of ['/', '/repositories', '/settings', '/pull-requests']) {
        await page.goto('http://127.0.0.1:3039' + route);
        await expect(page.locator('.page-content')).toBeVisible();
        const overflow = await page
          .locator('.main-scroll')
          .evaluate((el) => el.scrollWidth - el.clientWidth);
        assert.ok(overflow <= 1, `${route} at ${width}px overflows by ${overflow}px`);
      }
      const picker = page.locator('.wk-chat-picker').last();
      await picker.locator('summary').click();
      const menu = picker.getByRole('menu');
      await expect(menu).toBeVisible();
      const bounds = await menu.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'effort menu fits viewport');
      await page.keyboard.press('Escape');
      const send = await page.locator('.wk-pr-chat button[type="submit"]').boundingBox();
      assert.ok(send.y + send.height <= height, 'chat send button remains in view');
      mkdirSync('../../packages/stability', { recursive: true });
      await page.screenshot({ path: `../../packages/stability/review-${width}.png` });
    }
  });
  await context.close();
} finally {
  await browser.close();
}
assert.equal(failures.length, 0, failures.join('\n'));
