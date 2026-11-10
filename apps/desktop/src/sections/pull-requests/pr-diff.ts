import hljs from 'highlight.js/lib/common';

export type DiffLine = {
  kind: 'hunk' | 'context' | 'added' | 'removed' | 'note';
  oldNumber: number | null;
  newNumber: number | null;
  code: string;
};

export function parseDiff(patch: string): DiffLine[] {
  let oldNumber = 0;
  let newNumber = 0;
  return patch
    .split('\n')
    .filter((line, index, all) => line !== '' || index !== all.length - 1)
    .map((line) => {
      const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (hunk) {
        oldNumber = Number(hunk[1]);
        newNumber = Number(hunk[2]);
        return { kind: 'hunk', oldNumber: null, newNumber: null, code: line };
      }
      if (line.startsWith('\\'))
        return { kind: 'note', oldNumber: null, newNumber: null, code: line };
      const kind = line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : 'context';
      return {
        kind,
        oldNumber: kind === 'added' ? null : oldNumber++,
        newNumber: kind === 'removed' ? null : newNumber++,
        code: line.slice(1),
      };
    });
}

export function splitDiff(lines: DiffLine[]): { left: DiffLine | null; right: DiffLine | null }[] {
  const rows: { left: DiffLine | null; right: DiffLine | null }[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (line.kind !== 'added' && line.kind !== 'removed') {
      rows.push({ left: line, right: line });
      index++;
      continue;
    }
    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (index < lines.length && ['removed', 'added'].includes(lines[index].kind)) {
      const next = lines[index++];
      (next.kind === 'removed' ? removed : added).push(next);
    }
    for (let n = 0; n < Math.max(removed.length, added.length); n++) {
      rows.push({ left: removed[n] ?? null, right: added[n] ?? null });
    }
  }
  return rows;
}

export function highlightCode(code: string, filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const language =
    (
      {
        tsx: 'typescript',
        ts: 'typescript',
        jsx: 'javascript',
        js: 'javascript',
        mjs: 'javascript',
        rs: 'rust',
        py: 'python',
        sh: 'bash',
        yml: 'yaml',
        htm: 'xml',
        html: 'xml',
        svg: 'xml',
      } as Record<string, string>
    )[extension] ?? extension;
  if (hljs.getLanguage(language))
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
