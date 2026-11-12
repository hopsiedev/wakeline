import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './dashboard.css';
import './wakeline.css';
import './app.css';
import './chat-interactions.css';

import type { ReactNode, CSSProperties } from 'react';
import type { UiUpdate, CardStatus, AccountInfo, DashboardPayload } from 'src/services/wakeline';

import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { useRef, useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  X,
  Home,
  Plug,
  Code2,
  Layers,
  LogOut,
  ListTodo,
  Settings,
  Keyboard,
  Download,
  PanelLeft,
  RefreshCw,
  CircleHelp,
  MessageSquare,
} from 'lucide-react';

import { useColorScheme } from '@mui/material/styles';

import { CONFIG } from 'src/config-global';
import { observeCards } from 'src/services/card-workflow';
import { hasUpdate, publishUpdate, useUpdateStatus } from 'src/services/update-status';
import {
  fetchGithubWorkspace,
  type GithubWorkspace,
  getCachedGithubWorkspace,
} from 'src/services/github-workspace';
import {
  quitApp,
  isTauri,
  REPO_URL,
  checkUpdate,
  fetchAccount,
  openExternal,
  savedGithubProfile,
  fetchDashboardData,
  subscribeToChanges,
  getCachedDashboardData,
  invalidateDashboardCache,
} from 'src/services/wakeline';

import { Modal } from './views';
import { ChatDock } from './chat-dock';
import { Github } from './brand-icons';
import { UpdateCheck } from './settings';
import { ReleaseNotes } from './release-notes';
import { DailySummary } from './daily-summary';
import { LoadingSkeleton } from './loading-skeleton';
import { Context, ACCENTS } from './workspace-context';

const NAV = [
  { path: '/', key: 'nav.summary', Icon: Home },
  { path: '/repositories', key: 'nav.repositories', Icon: Layers },
  { path: '/pull-requests', key: 'nav.pullRequests', Icon: Code2 },
  { path: '/cards', key: 'nav.cards', Icon: ListTodo },
];

const GITHUB_POLL_MS = 2 * 60 * 1000;

export function ObsidianLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const reviewRoute =
    location.pathname === '/pull-requests' || location.pathname.startsWith('/pull-requests/');
  const navigate = useNavigate();
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === 'system' ? systemMode : mode) !== 'light';
  const [github, setGithub] = useState<GithubWorkspace | null>(getCachedGithubWorkspace);
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  // Only the Refresh button skips the backend cache; the rest reads it.
  const reloadGithub = useCallback(async (force = true) => {
    setGithubBusy(true);
    setGithubError(null);
    try {
      setGithub(await fetchGithubWorkspace(force));
    } catch (cause) {
      setGithubError(String(cause));
    } finally {
      setGithubBusy(false);
    }
  }, []);
  const [data, setData] = useState<DashboardPayload | null>(getCachedDashboardData);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(
    () => window.innerWidth >= 760 && localStorage.getItem('wakeline-nav-collapsed') !== 'true'
  );
  const [accent, accentState] = useState(() => localStorage.getItem('wakeline-accent') ?? 'teal');
  const [menu, setMenu] = useState(false);
  const update = useUpdateStatus();
  const [shortcuts, setShortcuts] = useState(false);
  const [booted, setBooted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLButtonElement>(null);
  const loading = useRef(false);
  useEffect(() => {
    const updateStatuses = (event: Event) => {
      const inputs = (
        event as CustomEvent<
          {
            fingerprint: string;
            fingerprints: string[];
            status: CardStatus;
          }[]
        >
      ).detail;
      setData((previous) =>
        previous
          ? {
              ...previous,
              cards: previous.cards.map((card) => {
                const input = inputs.find((change) =>
                  [card.fingerprint, ...card.fingerprints].some(
                    (fp) => fp === change.fingerprint || change.fingerprints.includes(fp)
                  )
                );
                return input ? { ...card, status: input.status } : card;
              }),
            }
          : previous
      );
    };
    window.addEventListener('wakeline:card-status', updateStatuses);
    return () => window.removeEventListener('wakeline:card-status', updateStatuses);
  }, []);
  const reload = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    try {
      const next = await fetchDashboardData({ force: true });
      if (next.scan_error) throw new Error(next.scan_error);
      observeCards(next.cards);
      setData(next);
      setError(null);
    } catch (cause) {
      setError(String(cause));
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }, []);
  const toggleNav = useCallback(
    () =>
      setExpanded((previous) => {
        localStorage.setItem('wakeline-nav-collapsed', String(previous));
        return !previous;
      }),
    []
  );
  useEffect(() => {
    const stop = subscribeToChanges();
    void reload();
    void fetchAccount()
      .then(setAccount)
      .catch((cause) => setGithubError(String(cause)));
    void reloadGithub(false);
    // New pull requests show up once the backend cache renews, without a restart.
    const githubTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void reloadGithub(false);
    }, GITHUB_POLL_MS);
    const refresh = () => {
      void reload();
    };
    window.addEventListener('wakeline:rescan', refresh);
    const frame = requestAnimationFrame(() => setBooted(true));
    return () => {
      stop();
      clearInterval(githubTimer);
      cancelAnimationFrame(frame);
      window.removeEventListener('wakeline:rescan', refresh);
    };
  }, [reload, reloadGithub]);
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(''), 4500);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    setMenu(false);
    if (window.innerWidth < 760) setExpanded(false);
    document.querySelector('.main-scroll')?.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false);
        setShortcuts(false);
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleNav();
      }
      if (event.ctrlKey && event.key === ',') {
        event.preventDefault();
        navigate('/settings');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [navigate, toggleNav]);
  useEffect(() => {
    if (!menu) return undefined;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const close = (event: PointerEvent) => {
      if (
        !menuRef.current?.contains(event.target as Node) &&
        !accountRef.current?.contains(event.target as Node)
      )
        setMenu(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);
  useEffect(() => {
    let active = true;
    const unlisten = isTauri()
      ? listen<UiUpdate>('wakeline://update-available', (event) => {
          if (active) publishUpdate(event.payload);
        })
      : Promise.resolve(() => {});
    const check = () => {
      void checkUpdate().catch(() => {});
    };
    check();
    window.addEventListener('focus', check);
    return () => {
      active = false;
      window.removeEventListener('focus', check);
      void unlisten.then((stop) => stop());
    };
  }, []);
  const active = NAV.findIndex((item) =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  );
  const profile = github?.user ?? account?.github ?? savedGithubProfile();
  const name =
    profile?.name ||
    profile?.login ||
    localStorage.getItem('wakeline-local-name') ||
    t('account.you');
  const avatar = profile?.avatar_url;
  const action = (fn: () => void) => {
    setMenu(false);
    fn();
  };
  const connections = [
    { id: 'github', name: 'GitHub', on: !!account?.github },
    { id: 'claude', name: 'Claude Code', on: !!account?.claude_code },
    { id: 'codex', name: 'Codex', on: !!account?.codex_mcp },
    { id: 'antigravity', name: 'Antigravity', on: !!account?.antigravity_mcp },
    { id: 'ollama', name: 'Ollama', on: !!account?.ollama },
  ];
  return (
    <Context.Provider
      value={{
        github,
        githubBusy,
        githubError,
        reloadGithub,
        data,
        account,
        busy,
        error,
        reload,
        notice: setMessage,
        accent,
        setAccent: (value) => {
          localStorage.setItem('wakeline-accent', value);
          accentState(value);
        },
      }}
    >
      <div
        className={`obsidian-analytics-dashboard ${dark ? 'dark' : ''}`}
        data-variant="fill"
        data-nav-docked="true"
        data-panel-docked="false"
        style={
          {
            '--accent': ACCENTS[accent] ?? accent,
            '--font-inter': 'Inter Variable',
            '--font-jetbrains-mono': 'JetBrains Mono Variable',
          } as CSSProperties
        }
      >
        <div
          className="window"
          data-collapsed="true"
          data-nav-open={expanded}
          data-scrim={expanded}
          data-booted={booted}
        >
          <nav className="rail" data-expanded={expanded} aria-label={t('shell.navigation')}>
            <div className="wk-brand-row">
              <Link className="rail-brand press" to="/" aria-label="Wakeline">
                <span className="rail-logo-custom">
                  <img src="/logo/wakeline-mark.svg" alt="" />
                </span>
                <span className="rail-label rail-brand-name">akeline</span>
              </Link>
              <button
                className="wk-sidebar-toggle"
                onClick={toggleNav}
                aria-expanded={expanded}
                aria-label={t(expanded ? 'nav.collapse' : 'nav.expand')}
              >
                <PanelLeft size={19} />
              </button>
            </div>
            <div className="rail-nav" style={{ '--active': Math.max(0, active) } as CSSProperties}>
              <span className="rail-indicator" aria-hidden="true" data-hidden={active < 0} />
              <ul className="rail-list">
                {NAV.map(({ path, key, Icon }, i) => (
                  <li key={path}>
                    <Link
                      to={path}
                      className="rail-btn press has-tip tip-right"
                      data-tip={t(key)}
                      aria-label={t(key)}
                      aria-current={active === i ? 'page' : undefined}
                      data-active={active === i}
                    >
                      <Icon size={19} strokeWidth={1.7} className="rail-icon" />
                      <span className="rail-label">{t(key)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="wk-rail-connectors">
              <span className="rail-label wk-rail-section">{t('account.connections')}</span>
              {connections
                .filter((item) => item.on)
                .map((item) => (
                  <Link
                    key={item.id}
                    to="/connections"
                    className="rail-btn press"
                    title={item.name}
                  >
                    <span className="rail-icon wk-mini-brand">
                      {item.id === 'github' ? (
                        <Github size={17} />
                      ) : item.id === 'ollama' ? (
                        <Plug size={17} />
                      ) : (
                        <img
                          src={`/assets/icons/agents/${item.id}.svg`}
                          alt=""
                          width="18"
                          height="18"
                        />
                      )}
                    </span>
                    <span className="rail-label">
                      {item.name}
                      <i className="wk-connected-dot" />
                    </span>
                  </Link>
                ))}
            </div>
            {hasUpdate(update) && (
              <button
                className="rail-btn wk-sidebar-update press"
                title={t('account.updateAvailable', { version: update?.version })}
                aria-label={t('account.updateAvailable', { version: update?.version })}
                onClick={() => setMenu(true)}
              >
                <Download className="rail-icon" size={19} />
                <span className="rail-label">{t('account.updateNow')}</span>
              </button>
            )}
            <div className="wk-account-row">
              <button
                ref={accountRef}
                className="rail-account press"
                aria-expanded={menu}
                aria-haspopup="menu"
                onClick={() => setMenu(!menu)}
                title={name}
              >
                {avatar ? (
                  <img className="avatar" src={avatar} alt="" width="28" height="28" />
                ) : (
                  <span className="avatar avatar-empty">{name.slice(0, 1)}</span>
                )}
                <span className="rail-label rail-account-copy">
                  <strong>{name}</strong>
                </span>
              </button>
              <button
                className="icon-btn wk-account-settings"
                aria-label={t('account.settings')}
                onClick={() => navigate('/settings')}
              >
                <Settings size={17} />
              </button>
            </div>
          </nav>
          <button
            className="real-nav-scrim"
            aria-label={t('account.close')}
            onClick={() => setExpanded(false)}
          />
          <main className="main">
            <header className="main-bar enter" style={{ '--i': 0 } as CSSProperties}>
              {reviewRoute && (
                <button
                  className="icon-btn"
                  aria-label={t('reviewChat.open')}
                  title={t('reviewChat.open')}
                  onClick={() => window.dispatchEvent(new Event('wakeline:chat-toggle'))}
                >
                  <MessageSquare size={16} />
                </button>
              )}
              <button
                className="icon-btn press shell-refresh"
                disabled={busy}
                aria-label={t('nav.rescan')}
                onClick={() => {
                  invalidateDashboardCache();
                  void reload();
                }}
              >
                <RefreshCw size={15} className={busy ? 'wk-update-spin' : ''} />
              </button>
            </header>
            <div className="wk-workspace-body">
              <div className="main-scroll">
                {error && (
                  <div className="real-error" role="alert">
                    {error}
                    <button className="btn" onClick={() => reload()}>
                      {t('repositories.refresh')}
                    </button>
                  </div>
                )}
                <div key={location.pathname.split('/')[1]} className="page">
                  {!github &&
                  githubBusy &&
                  (location.pathname === '/' ||
                    location.pathname.startsWith('/repositories') ||
                    location.pathname.startsWith('/pull-requests')) ? (
                    <LoadingSkeleton />
                  ) : (
                    children
                  )}
                </div>
              </div>
              <ChatDock />
            </div>
          </main>
        </div>
        <DailySummary />
        {menu && (
          <div
            className="wk-account-menu real-account-menu"
            role="menu"
            ref={menuRef}
            aria-label={t('account.githubAccount')}
            onKeyDown={(event) => {
              const buttons = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
              ];
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                buttons[
                  (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
                ]?.focus();
              }
              if (event.key === 'Escape') {
                setMenu(false);
                accountRef.current?.focus();
              }
            }}
          >
            <header>
              {avatar && <img src={avatar} alt="" width="32" height="32" />}
              <div>
                <strong title={name}>{name}</strong>
                <small>{t('account.version', { version: CONFIG.appVersion })}</small>
              </div>
            </header>
            <div>
              <button role="menuitem" onClick={() => action(() => navigate('/connections'))}>
                <Plug size={16} />
                {t('account.connections')}
              </button>
              <button role="menuitem" onClick={() => action(() => navigate('/settings'))}>
                <Settings size={16} />
                {t('account.settings')}
              </button>
              <button role="menuitem" onClick={() => action(() => setShortcuts(true))}>
                <Keyboard size={16} />
                {t('account.shortcuts')}
              </button>
            </div>
            <div>
              <UpdateCheck menu />
              <button
                role="menuitem"
                onClick={() =>
                  action(() => {
                    void openExternal(
                      `${REPO_URL}/issues/new?body=${encodeURIComponent(t('account.reportTemplate') + '\n\nWakeline ' + CONFIG.appVersion)}`
                    );
                  })
                }
              >
                <CircleHelp size={16} />
                {t('account.report')}
              </button>
            </div>
            <div>
              <button
                role="menuitem"
                className="wk-quit"
                onClick={() =>
                  action(() => {
                    void quitApp();
                  })
                }
              >
                <LogOut size={16} />
                {t('account.quit')}
              </button>
            </div>
          </div>
        )}
        {shortcuts && (
          <Modal
            className="wk-shortcuts"
            title={t('account.shortcuts')}
            onClose={() => setShortcuts(false)}
          >
            <p>Ctrl+B / {t('account.shortcutToggle')}</p>
            <p>Ctrl+, / {t('account.shortcutSettings')}</p>
            <p>Alt+← / → / {t('board.cardLabel', { title: '' })}</p>
            <button autoFocus onClick={() => setShortcuts(false)}>
              {t('account.close')}
            </button>
          </Modal>
        )}
        <ReleaseNotes />
        {message && (
          <div className="wk-toast" role="status">
            <img src="/logo/wakeline-mark.svg" width="26" height="26" alt="" />
            <span>
              <strong>Wakeline</strong>
              <br />
              {message}
            </span>
            <button aria-label={t('account.close')} onClick={() => setMessage('')}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </Context.Provider>
  );
}
