import {RELEASE_PRESENTATION} from '../src/services/release-notes.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createInstance } from 'i18next';

test('new workspace controls resolve in Spanish and English without fallback keys', async () => {
  for (const language of ['es', 'en']) {
    const translation = JSON.parse(await readFile(new URL(`../src/locales/${language}.json`, import.meta.url), 'utf8'));
    const instance = createInstance();
    await instance.init({lng:language,fallbackLng:false,resources:{[language]:{translation}}});
    for (const key of ['shell.exportTodo','shell.settingsSubtitle','shell.findingActivity','shell.viewChanges','board.review','workflow.event.stage','commands.status.passed','settings.themeDark','settings.themeLight','settings.themeSystem','githubDashboard.metrics.commits','githubDashboard.metrics.pulls','githubDashboard.metrics.merged','githubDashboard.metrics.review_hours','githubDashboard.rateLimited','intelligence.key','notificationChannels.prs','shell.settingsTabs.versions','dailySummary.pendingKinds.tasks']) {
      assert.equal(instance.exists(key), true, `${language}: ${key}`);
      assert.notEqual(instance.t(key), key);
    }
    for(const feature of RELEASE_PRESENTATION)for(const field of ['title','text','label'])assert.ok(instance.exists(`releasePresentation.features.${feature.id}.${field}`),`${language}: ${feature.id} ${field}`);
    assert.equal(instance.t('shell.findingCount',{count:3}), language === 'es' ? '3 hallazgos pendientes' : '3 pending findings');
  }
});
