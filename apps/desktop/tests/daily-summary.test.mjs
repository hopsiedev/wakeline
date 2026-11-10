import assert from 'node:assert/strict';
import { test } from 'node:test';

import { localDay, snapshotCards, summarizeChanges } from '../src/services/daily-summary-state.ts';

const card = {
  fingerprint: 'first',
  fingerprints: [],
  kind: 'task',
  status: 'new',
  first_seen: '2026-11-09',
};

test('first summary counts today instead of the entire imported history', () => {
  const cards = [card, { ...card, fingerprint: 'old', first_seen: '2020-01-01' }];
  assert.deepEqual(summarizeChanges(cards, null, '2026-11-09'), {
    errors: 0,
    tasks: 1,
    ideas: 0,
    completed: 0,
  });
});

test('summary distinguishes new cards from completed existing cards', () => {
  const previous = snapshotCards([card]);
  const cards = [
    { ...card, status: 'done' },
    { ...card, fingerprint: 'second', kind: 'error' },
  ];
  assert.deepEqual(summarizeChanges(cards, previous, '2026-11-10'), {
    errors: 1,
    tasks: 0,
    ideas: 0,
    completed: 1,
  });
  assert.deepEqual(summarizeChanges(cards, snapshotCards(cards), '2026-11-10'), {
    errors: 0,
    tasks: 0,
    ideas: 0,
    completed: 0,
  });
});

test('regrouped cards are not announced as new when an origin was already seen', () => {
  const previous = snapshotCards([{ ...card, fingerprints: ['second-origin'] }]);
  assert.deepEqual(
    summarizeChanges(
      [{ ...card, fingerprint: 'second-origin', fingerprints: ['first'], status: 'done' }],
      previous,
      '2026-11-10'
    ),
    { errors: 0, tasks: 0, ideas: 0, completed: 1 }
  );
});

test('daily boundary uses the local calendar date', () => {
  assert.equal(localDay(new Date(2026, 10, 9, 23, 59)), '2026-11-09');
});
