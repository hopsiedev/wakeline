import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ExternalLink } from 'lucide-react';

import { invoke } from 'src/services/wakeline';

const editors = [
  { id: 'vscode', name: 'VS Code' },
  { id: 'cursor', name: 'Cursor' },
  { id: 'antigravity', name: 'Antigravity' },
];
export function EditorOpen({ repository }: { repository: string }) {
  const { t } = useTranslation();
  const [editor, setEditor] = useState(() => {
    const saved = localStorage.getItem('wakeline-preferred-editor');
    return editors.find((e) => e.id === saved) ?? editors[0];
  });
  const [error, setError] = useState('');
  return (
    <div className="wk-editor-open">
      <div>
        <button
          type="button"
          className="btn press"
          onClick={async () => {
            setError('');
            try {
              await invoke('open_pr_editor', { repository, editor: editor.id });
            } catch (cause) {
              const message = String(cause);
              setError(
                t(
                  message.includes('LOCAL_REPOSITORY_NOT_WATCHED')
                    ? 'prEditor.noLocal'
                    : message.includes('EDITOR_NOT_INSTALLED')
                      ? 'prEditor.notInstalled'
                      : 'prEditor.failed'
                )
              );
            }
          }}
        >
          <img src={'/assets/icons/editors/' + editor.id + '.svg'} width="18" height="18" alt="" />
          {t('prEditor.open', { editor: editor.name })}
          <ExternalLink size={14} />
        </button>
        <details>
          <summary className="btn" aria-label={t('prEditor.choose')}>
            <ChevronDown size={15} />
          </summary>
          <div className="wk-editor-options">
            {editors.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={editor.id === item.id}
                onClick={(e) => {
                  setEditor(item);
                  localStorage.setItem('wakeline-preferred-editor', item.id);
                  e.currentTarget.closest('details')?.removeAttribute('open');
                }}
              >
                <img
                  src={'/assets/icons/editors/' + item.id + '.svg'}
                  width="18"
                  height="18"
                  alt=""
                />
                {item.name}
              </button>
            ))}
          </div>
        </details>
      </div>
      <small>{t('prEditor.localOnly')}</small>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
