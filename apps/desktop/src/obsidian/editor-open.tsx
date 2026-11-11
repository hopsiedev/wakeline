import { useTranslation } from 'react-i18next';
import { useRef, useState, useEffect } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';

import { EDITORS, preferredEditor } from 'src/services/editor-preference';
import { invoke, type UiCard, openCardInEditor } from 'src/services/wakeline';

export function EditorOpen({
  repository,
  card,
}:
  | { repository: string; card?: never }
  | { card: Pick<UiCard, 'project' | 'location' | 'title'>; repository?: never }) {
  const { t } = useTranslation();
  const [editor, setEditor] = useState(preferredEditor);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      if (event.type === 'keydown' && (event as KeyboardEvent).key !== 'Escape') return;
      if (event.type === 'pointerdown' && root.current?.contains(event.target as Node)) return;
      root.current?.querySelector('details')?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, []);
  return (
    <div className="wk-editor-open" ref={root}>
      <div>
        <button
          type="button"
          className="btn press"
          onClick={async () => {
            setError('');
            try {
              if (card) await openCardInEditor(card, editor.id);
              else await invoke('open_pr_editor', { repository, editor: editor.id });
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
            {EDITORS.map((item) => (
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
      {!card && <small>{t('prEditor.localOnly')}</small>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
