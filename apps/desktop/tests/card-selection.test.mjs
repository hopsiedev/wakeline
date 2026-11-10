import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  toggleCardSelection,
  togglePageSelection,
  selectedStatusInputs,
} from '../src/sections/cards/card-selection.ts';

test('individual selection toggles independently without mutating the previous selection', () => {
  const previous = new Set(['a']);
  assert.deepEqual([...toggleCardSelection(previous, 'b')], ['a', 'b']);
  assert.deepEqual([...toggleCardSelection(previous, 'a')], []);
  assert.deepEqual([...previous], ['a']);
});

test('select page adds missing cards and deselects that page while preserving other pages', () => {
  const initial = new Set(['earlier', 'a']);
  const selected = togglePageSelection(initial, ['a', 'b']);
  assert.deepEqual([...selected], ['earlier', 'a', 'b']);
  assert.deepEqual([...togglePageSelection(selected, ['a', 'b'])], ['earlier']);
  assert.deepEqual([...togglePageSelection(initial, [])], ['earlier', 'a']);
});

test('bulk status includes every origin of selected groups and ignores unselected cards', () => {
  const cards = [
    { fingerprint: 'group', fingerprints: ['origin-a', 'origin-b'] },
    { fingerprint: 'other', fingerprints: [] },
  ];
  assert.deepEqual(selectedStatusInputs(cards, new Set(['group', 'missing']), 'done'), [
    { fingerprint: 'group', fingerprints: ['origin-a', 'origin-b'], status: 'done' },
  ]);
});
