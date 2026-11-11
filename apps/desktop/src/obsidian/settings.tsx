import type { ReactNode, CSSProperties } from 'react';
import type { UiProjectSummary, UiProjectCommands } from 'src/services/wakeline';

import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Plug,
  Plus,
  Lock,
  Brain,
  Check,
  Shield,
  Folder,
  Unplug,
  Palette,
  Settings,
  Terminal,
  Download,
  RefreshCw,
} from 'lucide-react';

import { useColorScheme } from '@mui/material/styles';

import { CONFIG } from 'src/config-global';
import { hasUpdate, useUpdateStatus } from 'src/services/update-status';
import { dailySummaryEnabled, setDailySummaryEnabled } from 'src/services/daily-summary-state';
import {
  alertsEnabled,
  changeLanguage,
  setAlertsEnabled,
  notificationChannel,
  setNotificationChannel,
} from 'src/locales/i18n';
import {
  checkUpdate,
  openExternal,
  fetchAccount,
  installUpdate,
  getMcpExecutable,
  importAllHistory,
  chooseWatchFolder,
  removeWatchFolder,
  runProjectCommand,
  getProjectCommands,
  getHistoryProgress,
  historyImportStatus,
  approveProjectCommands,
} from 'src/services/wakeline';

import { Github } from './brand-icons';
import { CopyControl, ErrorNotice } from './views';
import { IntelligenceSettings } from './intelligence';
import { ACCENTS, useWorkspace } from './workspace-context';

const TABS = [
  { id: 'general', key: 'shell.settingsTabs.general', Icon: Settings },
  { id: 'appearance', key: 'shell.settingsTabs.appearance', Icon: Palette },
  { id: 'notifications', key: 'shell.settingsTabs.notifications', Icon: Bell },
  { id: 'intelligence', key: 'shell.settingsTabs.intelligence', Icon: Brain },
  { id: 'mcp', key: 'shell.settingsTabs.mcp', Icon: Plug },
  { id: 'privacy', key: 'shell.settingsTabs.privacy', Icon: Shield },
  { id: 'commands', key: 'shell.settingsTabs.commands', Icon: Terminal },
  { id: 'versions', key: 'shell.settingsTabs.versions', Icon: Download },
];
function Row({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <div className="setting-title">{title}</div>
        {detail && <div className="setting-detail">{detail}</div>}
      </div>
      <div className="wk-row-control">{children}</div>
    </div>
  );
}
function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={value}
      className="wk-toggle"
      disabled={disabled}
      onClick={() => onChange(!value)}
    >
      <span />
    </button>
  );
}

export function ProjectCommands({ project }: { project: UiProjectSummary }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<UiProjectCommands | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const load = useCallback(() => {
    void getProjectCommands(project.path)
      .then(setInfo)
      .catch((cause) => setError(String(cause)));
  }, [project.path]);
  useEffect(() => {
    load();
    window.addEventListener('wakeline:rescan', load);
    return () => window.removeEventListener('wakeline:rescan', load);
  }, [load]);
  return (
    <section className="card real-command-section">
      <h3 className="card-title">{project.name}</h3>
      <ErrorNotice error={error ?? info?.error ?? null} />
      {!info && <p className="wk-help">{t('common.loading')}</p>}
      {info && !info.has_config && <p className="wk-help">{t('commands.noConfig')}</p>}
      {info?.trust && (
        <Row
          title={t(info.trust === 'pending' ? 'commands.pendingBadge' : `commands.${info.trust}`)}
          detail={t('commands.subtitle')}
        >
          {info.trust !== 'approved' && (
            <button
              className="btn btn-primary"
              disabled={!!running}
              onClick={async () => {
                if (!info.hash) return;
                try {
                  await approveProjectCommands(project.path, info.hash);
                  setError(null);
                  load();
                } catch (cause) {
                  setError(String(cause));
                }
              }}
            >
              {t('commands.approve')}
            </button>
          )}
        </Row>
      )}
      {info?.commands.map((command) => (
        <div className="wk-code-section" key={command.name}>
          <div>
            <strong>{command.name}</strong>
            {command.last_status && (
              <span className="wk-tag">{t(`commands.status.${command.last_status}`)}</span>
            )}
          </div>
          <pre>
            {JSON.stringify(command.run)}
            {command.cwd ? `\n${command.cwd}` : ''}
          </pre>
          {command.last_detail && <p className="wk-help">{command.last_detail}</p>}
          <button
            className="btn"
            disabled={info.trust !== 'approved' || !!running}
            onClick={async () => {
              setRunning(command.name);
              setError(null);
              try {
                await runProjectCommand(project.path, command.name);
                load();
              } catch (cause) {
                setError(String(cause));
              } finally {
                setRunning(null);
              }
            }}
          >
            {running === command.name ? (
              <RefreshCw size={14} className="wk-update-spin" />
            ) : (
              <Terminal size={14} />
            )}{' '}
            {t(running === command.name ? 'workflow.running' : 'workflow.run')}
          </button>
        </div>
      ))}
    </section>
  );
}

export function UpdateCheck({
  requested = false,
  menu = false,
}: {
  requested?: boolean;
  menu?: boolean;
}) {
  const { notice } = useWorkspace();
  const { t } = useTranslation();
  const [, setParams] = useSearchParams();
  const result = useUpdateStatus();
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!flash) return undefined;
    const timer = setTimeout(() => setFlash(false), 4000);
    return () => clearTimeout(timer);
  }, [flash]);
  const check = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFlash(false);
    setError(null);
    try {
      const value = await checkUpdate();
      // No newer release published means the user already has the latest version.
      if (menu && value && (value.state === 'up_to_date' || value.state === 'unpublished'))
        setFlash(true);
      else if (menu && value && !hasUpdate(value))
        notice(
          t(
            value.state === 'up_to_date'
              ? 'settings.upToDate'
              : value.state === 'manual'
                ? 'settings.updateAvailable'
                : value.state === 'unpublished'
                  ? 'settings.noPublishedUpdates'
                  : 'settings.updatesHint',
            { version: value.state === 'up_to_date' ? value.current_version : value.version }
          )
        );
    } catch (cause) {
      setError(String(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, [menu, notice, t]);
  useEffect(() => {
    if (!requested) return;
    setParams(
      (previous) => {
        previous.delete('checkUpdates');
        return previous;
      },
      { replace: true }
    );
    void check();
  }, [requested, setParams, check]);
  const hint =
    result?.state === 'up_to_date'
      ? t('settings.upToDate', { version: result.current_version })
      : result?.state === 'manual'
        ? t('settings.manualUpdates')
        : result?.state === 'available'
          ? t('settings.updateAvailable', { version: result.version })
          : result?.state === 'unpublished'
            ? t('settings.noPublishedUpdates')
            : result?.state === 'unconfigured'
              ? t('settings.updateSigningMissing')
              : t('settings.updatesHint');
  const update = async () => {
    if (result?.state === 'manual') {
      await openExternal('https://github.com/hopsiedev/wakeline/releases/latest');
      return;
    }
    if (installing || busy) return;
    setInstalling(true);
    setError(null);
    try {
      await installUpdate();
    } catch (cause) {
      setError(String(cause));
      setInstalling(false);
    }
  };
  if (menu)
    return (
      <>
        <button
          role="menuitem"
          className="wk-update-menu"
          data-state={busy ? 'busy' : hasUpdate(result) ? 'available' : flash ? 'done' : 'idle'}
          disabled={busy || installing}
          onClick={(event) => {
            // Keep the menu open so the result is visible.
            event.stopPropagation();
            void (hasUpdate(result) ? update() : check());
          }}
        >
          {hasUpdate(result) ? (
            <Download size={16} className="wk-update-ok" />
          ) : flash ? (
            <Check size={16} className="wk-update-ok" />
          ) : (
            <RefreshCw size={16} className={busy ? 'wk-update-spin' : ''} />
          )}
          <span key={busy ? 'busy' : flash ? 'done' : 'idle'} className="swap-in">
            {installing
              ? t('settings.installingUpdate')
              : hasUpdate(result)
                ? t('account.updateNow')
                : busy
                  ? t('account.checkingUpdates')
                  : flash
                    ? t('account.upToDate')
                    : t('account.checkUpdates')}
          </span>
        </button>
        <ErrorNotice error={error} />
        {result?.state === 'manual' && (
          <button
            role="menuitem"
            onClick={() => openExternal('https://github.com/hopsiedev/wakeline/releases')}
          >
            {t('settings.openDownloads')}
          </button>
        )}
      </>
    );
  return (
    <>
      <Row title={t('settings.updates')} detail={hint}>
        <button
          className="btn wk-update-check"
          disabled={busy || installing}
          onClick={() => (hasUpdate(result) ? update() : check())}
        >
          <RefreshCw size={14} className={busy ? 'wk-update-spin' : ''} />
          {t(
            installing
              ? 'settings.installingUpdate'
              : hasUpdate(result)
                ? 'account.updateNow'
                : busy
                  ? 'settings.checkingUpdates'
                  : 'account.checkUpdates'
          )}
        </button>
      </Row>
      <ErrorNotice error={error} />
      {result?.state === 'manual' && (
        <button
          className="btn"
          onClick={() => openExternal('https://github.com/hopsiedev/wakeline/releases')}
        >
          {t('settings.openDownloads')}
        </button>
      )}
    </>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { data, notice, accent, setAccent } = useWorkspace();
  const { mode, setMode } = useColorScheme();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(
    () => params.get('tab') ?? (params.get('checkUpdates') ? 'versions' : 'general')
  );
  const [error, setError] = useState<string | null>(null);
  const [startup, setStartup] = useState(false);
  const [startupBusy, setStartupBusy] = useState(true);
  const [notifications, setNotifications] = useState(alertsEnabled);
  const [channels, setChannels] = useState(() => ({
    errors: notificationChannel('errors'),
    prs: notificationChannel('prs'),
  }));
  const [daily, setDaily] = useState(dailySummaryEnabled);
  const [executable, setExecutable] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [progress, setProgress] = useState(getHistoryProgress);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [panelDocked, setPanelDocked] = useState(
    () => localStorage.getItem('wakeline-pr-panel-docked') === 'true'
  );
  const desktop = '__TAURI_INTERNALS__' in window;
  useEffect(() => {
    void getMcpExecutable()
      .then(setExecutable)
      .catch((cause) => setError(String(cause)));
    void historyImportStatus().then(setHistory);
    if (desktop && navigator.userAgent.includes('Windows'))
      void invoke<boolean>('get_startup_enabled')
        .then(setStartup)
        .catch((cause) => setError(String(cause)))
        .finally(() => setStartupBusy(false));
    const onProgress = () => setProgress(getHistoryProgress());
    window.addEventListener('wakeline:history-progress', onProgress);
    return () => window.removeEventListener('wakeline:history-progress', onProgress);
  }, [desktop]);
  useEffect(() => {
    if (params.get('checkUpdates')) setTab('versions');
  }, [params]);
  const clients = mcpClients(executable);
  const select = (next: string) => {
    setTab(next);
    setError(null);
    setParams({ tab: next }, { replace: true });
  };
  return (
    <div className="page-content">
      <header className="page-head enter">
        <div>
          <h1 className="page-title">{t('account.settings')}</h1>
          <p className="page-sub">{t('shell.settingsSubtitle')}</p>
        </div>
      </header>
      <div className="wk-settings-layout">
        <nav className="wk-settings-tabs" aria-label={t('shell.settingsSections')}>
          {TABS.map((item) => (
            <button key={item.id} data-active={tab === item.id} onClick={() => select(item.id)}>
              <item.Icon size={16} />
              {t(item.key)}
            </button>
          ))}
        </nav>
        <div className="wk-settings-body" key={tab}>
          <section className="card wk-settings-section">
            <h2 className="card-title">
              {t(TABS.find((item) => item.id === tab)?.key ?? 'account.settings')}
            </h2>
            <ErrorNotice error={error} />
            {tab === 'general' && (
              <>
                <Row title={t('settings.language')} detail={t('settings.languageHint')}>
                  <div className="wk-choices">
                    {(['es', 'en'] as const).map((language) => (
                      <button
                        key={language}
                        data-active={i18n.language.startsWith(language)}
                        onClick={() => changeLanguage(language)}
                      >
                        {language === 'es' ? 'Español' : 'English'}
                      </button>
                    ))}
                  </div>
                </Row>
                {navigator.userAgent.includes('Windows') && (
                  <Row
                    title={t('settings.startWithWindows')}
                    detail={t('settings.startWithWindowsHint')}
                  >
                    <Toggle
                      label={t('settings.startWithWindows')}
                      value={startup}
                      disabled={startupBusy || !desktop}
                      onChange={async (value) => {
                        setStartupBusy(true);
                        try {
                          setStartup(
                            await invoke<boolean>('set_startup_enabled', { enabled: value })
                          );
                        } catch (cause) {
                          setError(String(cause));
                        } finally {
                          setStartupBusy(false);
                        }
                      }}
                    />
                  </Row>
                )}
                <Row title={t('settings.exportPath')} detail={t('settings.exportPathHint')}>
                  <code>docs/TODO.md</code>
                </Row>
                <Row title={t('nav.projects')}>
                  <button
                    className="btn"
                    onClick={() => chooseWatchFolder().catch((cause) => setError(String(cause)))}
                  >
                    <Plus size={14} />
                    {t('nav.watchFolder')}
                  </button>
                </Row>
                <div className="wk-folder-list">
                  {data?.projects.map((p) => (
                    <div key={p.path}>
                      <Folder size={15} />
                      <Link to={`/projects/${encodeURIComponent(p.name)}`}>{p.name}</Link>
                      <code>{p.path}</code>
                      <button
                        aria-label={t('nav.stopWatching') + ': ' + p.name}
                        onClick={() =>
                          removeWatchFolder(p.path).catch((cause) => setError(String(cause)))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <Row
                  title={t('settings.historyStart')}
                  detail={t(history ? 'settings.historyAllHint' : 'settings.historyStartHint')}
                >
                  <button
                    className="btn"
                    disabled={historyBusy}
                    onClick={async () => {
                      setHistoryBusy(true);
                      try {
                        const result = await importAllHistory();
                        setHistory(true);
                        notice(
                          t(
                            result.bad_lines
                              ? 'settings.historyImportedWarnings'
                              : 'settings.historyImported',
                            { count: result.files, bad: result.bad_lines }
                          )
                        );
                      } catch (cause) {
                        setError(String(cause));
                      } finally {
                        setHistoryBusy(false);
                      }
                    }}
                  >
                    {t(historyBusy ? 'settings.historyImporting' : 'settings.importAll')}
                  </button>
                </Row>
                {progress && <p className="wk-help">{t('settings.historyProgress', progress)}</p>}
              </>
            )}
            {tab === 'appearance' && (
              <>
                <Row title={t('settings.theme')}>
                  <div className="wk-choices">
                    {(['dark', 'light', 'system'] as const).map((value) => (
                      <button
                        key={value}
                        data-active={mode === value}
                        onClick={() => setMode(value)}
                      >
                        {t(`settings.theme${value[0].toUpperCase()}${value.slice(1)}`)}
                      </button>
                    ))}
                  </div>
                </Row>
                <Row title={t('shell.accent')} detail={t('shell.accentHint')}>
                  <div className="swatches" role="radiogroup" aria-label={t('shell.accent')}>
                    {Object.entries(ACCENTS).map(([key, color]) => (
                      <button
                        key={key}
                        className="swatch press"
                        role="radio"
                        aria-label={t(`shell.accents.${key}`)}
                        aria-checked={accent === key}
                        style={{ '--swatch': color } as CSSProperties}
                        onClick={() => setAccent(key)}
                      >
                        <Check size={13} />
                      </button>
                    ))}
                  </div>
                </Row>
                <Row title={t('shell.dockPr')} detail={t('shell.dockPrHint')}>
                  <Toggle
                    label={t('shell.dockPr')}
                    value={panelDocked}
                    onChange={(value) => {
                      localStorage.setItem('wakeline-pr-panel-docked', String(value));
                      setPanelDocked(value);
                      window.dispatchEvent(new Event('wakeline:panel-preference'));
                    }}
                  />
                </Row>
                <p className="wk-help">{t('shell.reducedMotion')}</p>
              </>
            )}
            {tab === 'notifications' && (
              <>
                <Row title={t('settings.alertsWin')} detail={t('settings.alertsWinHint')}>
                  <Toggle
                    label={t('settings.alertsWin')}
                    value={notifications}
                    onChange={(value) => {
                      setAlertsEnabled(value);
                      setNotifications(value);
                    }}
                  />
                </Row>
                {(['errors', 'prs'] as const).map((channel) => (
                  <Row
                    key={channel}
                    title={t(`notificationChannels.${channel}`)}
                    detail={t(`notificationChannels.${channel}Hint`)}
                  >
                    <Toggle
                      label={t(`notificationChannels.${channel}`)}
                      value={channels[channel]}
                      disabled={!notifications}
                      onChange={(value) => {
                        setNotificationChannel(channel, value);
                        setChannels((old) => ({ ...old, [channel]: value }));
                      }}
                    />
                  </Row>
                ))}
                <Row title={t('settings.alertsDaily')} detail={t('settings.alertsDailyHint')}>
                  <Toggle
                    label={t('settings.alertsDaily')}
                    value={daily}
                    onChange={(value) => {
                      setDailySummaryEnabled(value);
                      setDaily(value);
                    }}
                  />
                </Row>
                <button
                  className="btn"
                  onClick={() => window.dispatchEvent(new CustomEvent('wakeline:open-summary'))}
                >
                  {t('shell.openSummary')}
                </button>
              </>
            )}
            {tab === 'intelligence' && <IntelligenceSettings />}
            {tab === 'mcp' && (
              <>
                <p className="wk-help">{t('settings.mcpSub')}</p>
                <div className="wk-inline-status">
                  <i style={{ background: executable ? '#43b978' : 'var(--text-3)' }} />
                  {executable ?? t('settings.mcpCliMissing')}
                </div>
                {!executable && <p className="wk-help">{t('settings.mcpBuildHint')}</p>}
                {clients.map((client) => (
                  <div className="wk-code-section" key={client.id}>
                    <div>
                      <strong className="wk-client-name">
                        <img
                          src={`/assets/icons/agents/${client.id}.svg`}
                          width="18"
                          height="18"
                          alt=""
                        />
                        {client.name}
                      </strong>
                      <CopyControl text={client.text} />
                    </div>
                    <pre>{client.text}</pre>
                  </div>
                ))}
                <Link className="btn" to="/connections">
                  <Plug size={14} />
                  {t('account.connections')}
                </Link>
              </>
            )}
            {tab === 'privacy' && (
              <>
                <p className="wk-help">{t('settings.exclusionsSub')}</p>
                {['**/.env*', '~/.claude/sessions/', t('settings.excludedTables')].map((rule) => (
                  <div className="wk-exclusion" key={rule}>
                    <Lock size={14} />
                    <code>{rule}</code>
                    <span>{t('shell.protected')}</span>
                  </div>
                ))}
                <div className="wk-inline-note">
                  <Shield size={17} />
                  <p>{t('settings.redactNotice')}</p>
                </div>
              </>
            )}
            {tab === 'commands' && (
              <>
                <p className="wk-help">{t('commands.subtitle')}</p>
                {!data?.projects.length && <p className="wk-help">{t('commands.noProjects')}</p>}
                {data?.projects.map((p) => (
                  <ProjectCommands key={p.path} project={p} />
                ))}
              </>
            )}
            {tab === 'versions' && (
              <>
                <Row title={`Wakeline ${CONFIG.appVersion}`} detail={t('shell.reviewCandidate')}>
                  <span className="wk-tag">{CONFIG.appVersion}</span>
                </Row>
                <UpdateCheck requested={params.get('checkUpdates') === '1'} />
                <Row title={t('releaseUi.history')} detail={t('releaseUi.historyHint')}>
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      window.dispatchEvent(new CustomEvent('wakeline:release-history'))
                    }
                  >
                    {t('shell.viewChanges')}
                  </button>
                </Row>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function connectCommand(id: string, executable: string | null) {
  if (id === 'github') return 'gh auth login';
  if (id === 'ollama') return 'ollama serve';
  return mcpClients(executable).find((client) => client.id === id)!.text;
}

// Wakeline does not edit other tools' settings: it shows the exact command to run.
function disconnectCommand(id: string) {
  return (
    {
      github: 'gh auth logout',
      claude: 'claude mcp remove wakeline',
      codex: 'codex mcp remove wakeline',
      antigravity: '"mcpServers": { "wakeline": … }',
    }[id] ?? ''
  );
}

function mcpClients(executable: string | null) {
  const command = executable ?? 'wakeline';
  return [
    { id: 'claude', name: 'Claude Code', text: `claude mcp add wakeline -- "${command}" mcp` },
    { id: 'codex', name: 'Codex', text: `codex mcp add wakeline -- "${command}" mcp` },
    {
      id: 'antigravity',
      name: 'Antigravity',
      text: JSON.stringify({ mcpServers: { wakeline: { command, args: ['mcp'] } } }, null, 2),
    },
  ];
}

export function ConnectionsPage() {
  const { t } = useTranslation();
  const { account } = useWorkspace();
  const [current, setCurrent] = useState(account);
  const [executable, setExecutable] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  useEffect(() => {
    getMcpExecutable()
      .then(setExecutable)
      .catch((cause) => setConnectionError(String(cause)));
  }, []);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const items = [
    {
      id: 'github',
      name: 'GitHub',
      on: !!current?.github,
      detail: current?.github ? `@${current.github.login}` : 'gh auth login',
    },
    {
      id: 'claude',
      name: 'Claude Code',
      on: !!current?.claude_code,
      detail: t('shell.sessionsAvailable'),
    },
    { id: 'codex', name: 'Codex', on: !!current?.codex_mcp, detail: t('shell.mcpConfigured') },
    {
      id: 'antigravity',
      name: 'Antigravity',
      on: !!current?.antigravity_mcp,
      detail: t('shell.mcpConfigured'),
    },
    { id: 'ollama', name: 'Ollama', on: !!current?.ollama, detail: '127.0.0.1:11434' },
  ];
  useEffect(() => setCurrent(account), [account]);
  return (
    <div className="page-content">
      <header className="page-head enter">
        <div>
          <h1 className="page-title">{t('account.connections')}</h1>
          <p className="page-sub">{t('shell.connectionsSubtitle')}</p>
        </div>
        <div className="page-actions">
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setCurrent(await fetchAccount(true));
                setConnectionError(null);
              } catch (cause) {
                setConnectionError(String(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw size={14} className={busy ? 'wk-update-spin' : ''} />
            {t('repositories.refresh')}
          </button>
          <Link className="btn" to="/settings?tab=mcp">
            <Plug size={14} />
            {t('settings.mcpTitle')}
          </Link>
        </div>
      </header>
      <ErrorNotice error={connectionError} />
      <div className="wk-connectors-grid">
        {items.map((item, index) => (
          <section
            className="card wk-connector-card enter"
            style={{ '--i': index + 1 } as CSSProperties}
            key={item.id}
          >
            <header>
              {item.id === 'github' ? (
                <Github size={24} />
              ) : item.id === 'ollama' ? (
                <Brain size={24} />
              ) : (
                <img src={`/assets/icons/agents/${item.id}.svg`} width="26" height="26" alt="" />
              )}
              <h2>{item.name}</h2>
              <span className="wk-status" data-on={item.on}>
                <i />
                {t(item.on ? 'shell.available' : 'account.notConnected')}
              </span>
            </header>
            <p className="wk-help">{item.detail}</p>
            {item.on ? (
              <>
                {leaving === item.id && (
                  <div className="wk-code-section">
                    {disconnectCommand(item.id) && (
                      <>
                        <div>
                          <strong>{t('connections.disconnectCommand')}</strong>
                          <CopyControl text={disconnectCommand(item.id)} />
                        </div>
                        <pre>{disconnectCommand(item.id)}</pre>
                      </>
                    )}
                    <p className="wk-help">{t(`connections.disconnectHint.${item.id}`)}</p>
                  </div>
                )}
                <button
                  type="button"
                  className="btn wk-disconnect"
                  aria-expanded={leaving === item.id}
                  onClick={() => setLeaving(leaving === item.id ? null : item.id)}
                >
                  <Unplug size={14} />
                  {t('connections.disconnect')}
                </button>
              </>
            ) : (
              <div className="wk-code-section">
                <div>
                  <strong>{t('shell.connectionCommand')}</strong>
                  <CopyControl text={connectCommand(item.id, executable)} />
                </div>
                <pre>{connectCommand(item.id, executable)}</pre>
                {!executable && !['github', 'ollama'].includes(item.id) && (
                  <p className="wk-help">{t('settings.mcpCliMissing')}</p>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
