import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchesCardFilters } from '../src/sections/cards/card-filters.ts';

const card = {
  title: 'Revisar configuración',
  project: 'contastack',
  kind: 'task',
  status: 'new',
  branch: 'feature/parser',
  location: 'src/parser.ts:42',
  short_id: 'W-074',
  session_id: 'efc-minimalista',
  source_kind: 'session',
  source_label: 'session',
  evidence: 'Falta validar el formulario',
  code_excerpt: null,
  origins: [{ source_kind: 'pull_request', source_label: 'ci', location: 'apps/api.ts:9' }],
};
const base = { kind: 'all', project: 'all', source: 'all', status: 'all', search: '' };

test('search finds a session, identifier, evidence and grouped origin', () => {
  for (const search of [
    ' efc-MINIMALISTA ',
    'W-074',
    'validar formulario',
    'apps/api.ts',
    'configuracion',
  ]) {
    assert.equal(matchesCardFilters(card, { ...base, search }), true, search);
  }
  assert.equal(matchesCardFilters(card, { ...base, search: 'inexistente' }), false);
});

test('source matches every origin of a grouped card', () => {
  assert.equal(matchesCardFilters(card, { ...base, source: 'github' }), true);
  assert.equal(matchesCardFilters(card, { ...base, source: 'session' }), true);
  assert.equal(matchesCardFilters(card, { ...base, source: 'code' }), false);
  assert.equal(
    matchesCardFilters(
      { ...card, origins: [], source_kind: 'command' },
      { ...base, source: 'code' }
    ),
    true
  );
});

test('filters combine instead of overriding each other', () => {
  const filters = {
    kind: 'task',
    project: 'contastack',
    source: 'github',
    status: 'open',
    search: 'efc',
  };
  assert.equal(matchesCardFilters(card, filters), true);
  for (const change of [
    { kind: 'error' },
    { project: 'other' },
    { source: 'document' },
    { status: 'done' },
    { search: 'other' },
  ]) {
    assert.equal(matchesCardFilters(card, { ...filters, ...change }), false);
  }
});

test('open status includes new and accepted, excludes done and dismissed', () => {
  for (const status of ['new', 'accepted', 'done', 'dismissed']) {
    assert.equal(
      matchesCardFilters({ ...card, status }, { ...base, status: 'open' }),
      ['new', 'accepted'].includes(status)
    );
  }
});
