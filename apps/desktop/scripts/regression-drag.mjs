import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { response, dashboard } from '../tests/fixtures/documentation.mjs';

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    localStorage.setItem('wakeline-lang', 'en');
    localStorage.setItem('wakeline-release-shown', '0.1.6');
    localStorage.setItem('wakeline-daily-summary-enabled', 'false');
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      invoke: async (command, args) =>
        fetch('/__test/native', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, args }),
        }).then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          return data;
        }),
      transformCallback: () => 1,
      unregisterCallback: () => {},
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  });
  const page = await context.newPage();
  let cards = structuredClone(dashboard.cards);
  const writes = [];
  const opened = [];
  let holdReads = false,
    failHistory = false,
    releaseReads;
  const pending = new Set();
  const blocked = new Promise((resolve) => {
    releaseReads = resolve;
  });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/__test/native', async (route) => {
    const { command, args } = route.request().postDataJSON();
    if (holdReads && ['get_dashboard_data', 'history_import_status'].includes(command)) {
      pending.add(command);
      await blocked;
      pending.delete(command);
    }
    if (failHistory && command === 'history_import_status') {
      await route.fulfill({ status: 500, json: { error: 'SYNTHETIC_HISTORY_READ_FAILURE' } });
      return;
    }
    let data = response(command);
    if (command === 'get_dashboard_data') data = { ...dashboard, cards };
    if (command === 'set_card_status') {
      writes.push(args.input);
      cards = cards.map((card) =>
        card.fingerprint === args.input.fingerprint ? { ...card, status: args.input.status } : card
      );
    }
    if (command === 'plugin:event|listen') data = 1;
    if (command === 'open_in_editor') opened.push(args);
    if (command === 'list_project_files')
      data = [{ name: 'webhook.ts', relative_path: 'src/payments/webhook.ts', is_dir: false }];
    if (command === 'plugin:app|version') data = '0.1.6';
    await route.fulfill({ json: data });
  });
  await page.goto('http://127.0.0.1:3039/cards');
  const card = page
    .locator('.wk-kanban-card')
    .filter({ hasText: 'Handle repeated payment webhooks' });
  const columns = page.locator('.wk-kanban-column');
  await expect(card).toBeVisible();
  await card.dragTo(columns.nth(1), { targetPosition: { x: 30, y: 65 } });
  await expect(
    columns
      .nth(1)
      .locator('.wk-kanban-card')
      .filter({ hasText: 'Handle repeated payment webhooks' })
  ).toBeVisible();
  assert.equal(writes.at(-1).status, 'accepted');
  await card.dragTo(columns.nth(2), { targetPosition: { x: 30, y: 65 } });
  await expect(
    columns
      .nth(2)
      .locator('.wk-kanban-card')
      .filter({ hasText: 'Handle repeated payment webhooks' })
  ).toBeVisible();
  await page.reload();
  await expect(
    columns
      .nth(2)
      .locator('.wk-kanban-card')
      .filter({ hasText: 'Handle repeated payment webhooks' })
  ).toBeVisible();
  console.log('HTML drag sends the status change and review stage survives reload');
  await card.click({ position: { x: 24, y: 24 } });
  await page.getByRole('dialog').getByLabel('Choose editor').click({ timeout: 3000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Cursor', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Open in Cursor', exact: true })
    .click();
  assert.deepEqual(opened.at(-1), {
    project: 'checkout',
    location: 'src/payments/webhook.ts:42',
    title: 'Handle repeated payment webhooks',
    editor: 'cursor',
  });
  await page.reload();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Open in Cursor', exact: true })
    .click();
  assert.equal(opened.length, 2);
  assert.equal(opened.at(-1).editor, 'cursor');
  console.log('To do opens the selected file with Cursor and keeps the editor after reload');
  await page.goto('http://127.0.0.1:3039/projects/checkout');
  await page.getByRole('button', { name: 'Show files', exact: true }).click();
  await page.getByRole('button', { name: 'webhook.ts', exact: true }).click();
  assert.deepEqual(opened.at(-1), {
    project: 'checkout',
    location: 'src/payments/webhook.ts',
    title: '',
    editor: 'cursor',
  });
  console.log('Project file selection also respects the saved Cursor preference');
  holdReads = true;
  await page.goto('http://127.0.0.1:3039/settings');
  await expect.poll(() => pending.size).toBe(2);
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const tab of ['General', 'Versions', 'Appearance']) {
      await page
        .locator('.wk-settings-tabs')
        .getByRole('button', { name: tab, exact: true })
        .click();
      await expect(page.locator('.wk-settings-section > h2')).toHaveText(tab);
      assert.equal(pending.size, 2);
    }
  }
  holdReads = false;
  releaseReads();
  await expect.poll(() => pending.size).toBe(0);
  assert.deepEqual(pageErrors, []);
  failHistory = true;
  await page.goto('http://127.0.0.1:3039/settings');
  await expect(
    page.getByRole('alert').filter({ hasText: 'SYNTHETIC_HISTORY_READ_FAILURE' })
  ).toBeVisible();
  await page
    .locator('.wk-settings-tabs')
    .getByRole('button', { name: 'Appearance', exact: true })
    .click();
  await expect(page.getByText('SYNTHETIC_HISTORY_READ_FAILURE')).toHaveCount(0);
  console.log(
    'Settings remains responsive with scan/history IPC pending, then handles history rejection'
  );
  await context.close();
} finally {
  await browser.close();
}
