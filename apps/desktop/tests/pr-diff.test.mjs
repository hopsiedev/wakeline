import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseDiff, splitDiff, highlightCode } from '../src/sections/pull-requests/pr-diff.ts';

test('diff distinguishes hunk headers, replacements and unchanged lines with correct numbers', () => {
  const lines = parseDiff(
    '@@ -10,3 +20,4 @@ function total()\n const total = 1;\n-old()\n+newCall()\n+extra()\n end()\n\\ No newline at end of file\n'
  );
  assert.deepEqual(
    lines.map(({ kind, oldNumber, newNumber, code }) => [kind, oldNumber, newNumber, code]),
    [
      ['hunk', null, null, '@@ -10,3 +20,4 @@ function total()'],
      ['context', 10, 20, 'const total = 1;'],
      ['removed', 11, null, 'old()'],
      ['added', null, 21, 'newCall()'],
      ['added', null, 22, 'extra()'],
      ['context', 12, 23, 'end()'],
      ['note', null, null, '\\ No newline at end of file'],
    ]
  );
});

test('split diff pairs old and new replacement lines without shifting later context', () => {
  const rows = splitDiff(parseDiff('@@ -1,2 +1,3 @@\n-before\n+after\n+extra\n same'));
  assert.equal(rows[1].left.code, 'before');
  assert.equal(rows[1].right.code, 'after');
  assert.equal(rows[2].left, null);
  assert.equal(rows[2].right.code, 'extra');
  assert.equal(rows[3].left.oldNumber, 2);
  assert.equal(rows[3].right.newNumber, 3);
});

test('code highlighting colors TypeScript tokens while escaping HTML from a PR', () => {
  const html = highlightCode('const value: string = "<img onerror=alert(1)>";', 'view.tsx');
  assert.match(html, /hljs-keyword/);
  assert.match(html, /hljs-string/);
  assert.doesNotMatch(html, /<img/);
});

test('unknown file extensions remain readable and escape HTML', () => {
  assert.equal(highlightCode('<unsafe>&', 'file.unknown'), '&lt;unsafe&gt;&amp;');
});
