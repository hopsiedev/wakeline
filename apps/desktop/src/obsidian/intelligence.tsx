import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { invoke } from 'src/services/wakeline';

import { ErrorNotice } from './views';
import { useWorkspace } from './workspace-context';

type Config = { mode: string; endpoint: string; model: string };
type Settings = { config: Config; has_key: boolean; secure_storage: boolean };
export function IntelligenceSettings() {
  const { t } = useTranslation();
  const { notice } = useWorkspace();
  const [value, setValue] = useState<Settings | null>(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const desktop = '__TAURI_INTERNALS__' in window;
  useEffect(() => {
    let active = true;
    invoke<Settings>('get_intelligence')
      .then((data) => {
        if (active) setValue(data);
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, []);
  const update = (patch: Partial<Config>) =>
    setValue((old) => (old ? { ...old, config: { ...old.config, ...patch } } : old));
  const save = async (remove = false) => {
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await invoke('set_intelligence', {
        config: remove ? { ...value.config, mode: 'off' } : value.config,
        apiKey: key || null,
        removeKey: remove,
      });
      setKey('');
      setValue(await invoke<Settings>('get_intelligence'));
      notice(t('intelligence.saved'));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <p className="wk-help">{t('settings.llmOffHint')}</p>
      <ErrorNotice error={error} />
      {!value && !error && <p>{t('common.loading')}</p>}
      {value && (
        <form
          className="real-intelligence"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            {t('intelligence.provider')}
            <select
              value={value.config.mode}
              onChange={(e) =>
                update({
                  mode: e.target.value,
                  endpoint:
                    e.target.value === 'ollama'
                      ? 'http://127.0.0.1:11434'
                      : e.target.value === 'api'
                        ? 'https://api.openai.com/v1'
                        : value.config.endpoint,
                })
              }
            >
              <option value="off">{t('intelligence.off')}</option>
              <option value="ollama">Ollama</option>
              <option value="api">{t('intelligence.api')}</option>
            </select>
          </label>
          {value.config.mode !== 'off' && (
            <>
              <label>
                {t('intelligence.endpoint')}
                <input
                  type="url"
                  required
                  value={value.config.endpoint}
                  onChange={(e) => update({ endpoint: e.target.value })}
                />
              </label>
              <label>
                {t('intelligence.model')}
                <input
                  required
                  value={value.config.model}
                  onChange={(e) => update({ model: e.target.value })}
                />
              </label>
            </>
          )}
          {value.config.mode === 'api' && (
            <>
              <label>
                {t('intelligence.key')}
                <input
                  type="password"
                  autoComplete="off"
                  disabled={!value.secure_storage}
                  value={key}
                  placeholder={t(value.has_key ? 'intelligence.keySaved' : 'intelligence.keyEmpty')}
                  onChange={(e) => setKey(e.target.value)}
                />
              </label>
              <p className="wk-help">
                {t(value.secure_storage ? 'intelligence.secure' : 'intelligence.unavailable')}
              </p>
              {value.has_key && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !desktop}
                  onClick={() => save(true)}
                >
                  {t('intelligence.remove')}
                </button>
              )}
            </>
          )}
          <button className="btn btn-primary" disabled={busy || !desktop} type="submit">
            {t(busy ? 'common.loading' : 'intelligence.save')}
          </button>
          {!desktop && <p className="wk-help">{t('intelligence.desktop')}</p>}
        </form>
      )}
    </>
  );
}
