export const EDITORS = [
  { id: 'vscode', name: 'VS Code' },
  { id: 'cursor', name: 'Cursor' },
  { id: 'antigravity', name: 'Antigravity' },
] as const;

export function preferredEditor() {
  const saved = localStorage.getItem('wakeline-preferred-editor');
  return EDITORS.find((editor) => editor.id === saved) ?? EDITORS[0];
}
