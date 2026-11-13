import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FolderRemovals } from '../src/services/folder-removal.ts';

test('removal progress starts immediately and repeated clicks share the operation', async () => {
  const removals = new FolderRemovals();
  let finish;
  let calls = 0;
  const snapshots = [];
  const unsubscribe = removals.subscribe(() => snapshots.push(removals.getSnapshot()));
  const action = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const first = removals.run('project', action);
  const second = removals.run('project', action);
  assert.equal(first, second);
  assert.deepEqual(removals.getSnapshot(), ['project']);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish();
  await first;
  assert.deepEqual(snapshots, [['project'], []]);
  unsubscribe();
});

test('failed removal clears progress and permits a retry without hiding another operation', async () => {
  const removals = new FolderRemovals();
  let finish;
  const other = removals.run('other', () => new Promise(resolve => { finish = resolve; }));
  await assert.rejects(removals.run('project', async () => { throw new Error('disk busy'); }), /disk busy/);
  assert.deepEqual(removals.getSnapshot(), ['other']);
  await removals.run('project', async () => {});
  finish();
  await other;
  assert.deepEqual(removals.getSnapshot(), []);
});
