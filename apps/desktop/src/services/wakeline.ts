import type { TFunction } from 'i18next';

import { listen } from '@tauri-apps/api/event';
import { invoke as nativeInvoke } from '@tauri-apps/api/core';

import i18n from 'src/locales/i18n';
import { CONFIG } from 'src/config-global';

import { publishUpdate } from './update-status';
import { preferredEditor } from './editor-preference';
import { CardStatusJournal, type StatusChange } from './card-status-journal';

const cardStatusJournal = new CardStatusJournal();
function publishCardStatuses(inputs: StatusChange[]) {
  if (cachedDashboard) {
    cachedDashboard = {
      ...cachedDashboard,
      cards: cachedDashboard.cards.map((card) => {
        const change = inputs.find((input) =>
          [card.fingerprint, ...card.fingerprints].some(
            (fp) => fp === input.fingerprint || input.fingerprints.includes(fp)
          )
        );
        return change ? { ...card, status: change.status } : card;
      }),
    };
  }
  window.dispatchEvent(new CustomEvent('wakeline:card-status', { detail: inputs }));
}

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) return nativeInvoke<T>(command, args);
  if (!import.meta.env.DEV) throw new Error(i18n.t('errors.desktopRuntime'));
  const response = await fetch('/__wakeline/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, args }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'DESKTOP_SERVICE_UNAVAILABLE');
  return value as T;
}

// ----------------------------------------------------------------------

export type CardKind = 'error' | 'task' | 'idea';
export type CardStatus = 'new' | 'accepted' | 'done' | 'dismissed';
export type SourceKind = 'comment' | 'command' | 'session' | 'document' | 'pull_request' | 'issue';

export type UiCard = {
  fingerprint: string;
  short_id: string;
  kind: CardKind;
  status: CardStatus;
  title: string;
  project: string;
  branch: string;
  source_kind: SourceKind;
  source_label: string;
  location: string;
  code_excerpt?: string | null;
  evidence?: string | null;
  session_id: string | null;
  occurrences: number;
  first_seen: string;
  last_seen: string;
  fingerprints: string[];
  origins: UiOrigin[];
  url: string | null;
};

export type UiOrigin = {
  fingerprint: string;
  source_kind: SourceKind;
  source_label: string;
  location: string;
  occurrences: number;
  url: string | null;
};

export type CiState = 'passing' | 'failing' | 'pending' | 'none';
export type ReviewState = 'approved' | 'changes_requested' | 'none';

export type UiPullRequest = {
  repository?: string;
  project: string;
  number: number;
  title: string;
  url: string;
  branch: string;
  draft: boolean;
  age_days: number;
  ci: CiState;
  review: ReviewState;
};

export type PullRequestDetails = {
  body: string;
  files: { filename: string; additions: number; deletions: number; patch: string | null }[];
};

export async function getPullRequestDetails(
  project: string,
  number: number
): Promise<PullRequestDetails> {
  const data = await fetchDashboardData();
  const folder = data.projects.find((item) => item.name === project);
  if (!folder) throw new Error(i18n.t('projects.notFound'));
  return invoke('get_pull_request_details', { path: folder.path, number });
}

export async function refreshGithub(): Promise<void> {
  if (!isTauri()) throw new Error(i18n.t('errors.desktopFolderPicker'));
  try {
    await invoke('refresh_github');
  } finally {
    invalidateDashboardCache();
    window.dispatchEvent(new CustomEvent('wakeline:rescan'));
  }
}

export type GhStatus =
  { state: 'not_installed' } | { state: 'not_logged_in' } | { state: 'connected'; login: string };

export type UiGithubStatus = {
  repo: string | null;
  gh: GhStatus;
  last_error: string | null;
};

export type UiProjectSummary = {
  name: string;
  path: string;
  branch: string;
  active: boolean;
  errors: number;
  tasks: number;
  ideas: number;
  done: number;
  dismissed: number;
  commands_pending: boolean;
};

export type CommandTrigger = 'idle' | 'manual';
export type RunStatus = 'passed' | 'failed' | 'timed_out' | 'not_started';
export type TrustStatus = 'approved' | 'pending' | 'changed';

export type UiCommand = {
  name: string;
  run: string[];
  cwd: string | null;
  on: CommandTrigger;
  last_status: RunStatus | null;
  last_detail: string | null;
  last_finished_at: number | null;
};

export type UiProjectCommands = {
  has_config: boolean;
  error: string | null;
  hash: string | null;
  trust: TrustStatus | null;
  commands: UiCommand[];
};

export type UiFileEntry = {
  name: string;
  relative_path: string;
  is_dir: boolean;
};

export type UiSpecGap = {
  title: string;
  location: string;
  tag: string;
  kind: CardKind;
};

export type DashboardPayload = {
  cards: UiCard[];
  projects: UiProjectSummary[];
  spec_gaps: UiSpecGap[];
  pull_requests: UiPullRequest[];
  session_files: number;
  megabytes_read: number;
  scan_ms: number;
  scan_error?: string;
};

const EMPTY_PAYLOAD: DashboardPayload = {
  cards: [],
  projects: [],
  spec_gaps: [],
  pull_requests: [],
  session_files: 0,
  megabytes_read: 0,
  scan_ms: 0,
};

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let cachedDashboard: DashboardPayload | null = null;
let dashboardRequest: Promise<DashboardPayload> | null = null;
let importingFolder: string | null = null;

function setImportingFolder(folder: string | null): void {
  importingFolder = folder;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wakeline:importing', { detail: folder }));
  }
}

export function getImportingFolder(): string | null {
  return importingFolder;
}

export type HistoryProgress = { processed: number; total: number };
let historyProgress: HistoryProgress | null = null;
export const getHistoryProgress = () => historyProgress;

function publishHistoryProgress(progress: HistoryProgress | null) {
  historyProgress = progress;
  window.dispatchEvent(new CustomEvent('wakeline:history-progress', { detail: progress }));
}

export async function historyImportStatus(): Promise<boolean> {
  return isTauri() ? invoke('history_import_status') : false;
}

export async function importAllHistory(): Promise<{ files: number; bad_lines: number }> {
  if (!isTauri()) throw new Error(i18n.t('errors.desktopHistoryImport'));
  if (historyProgress) throw new Error(i18n.t('settings.historyImportRunning'));
  publishHistoryProgress({ processed: 0, total: 0 });
  let stop: (() => void) | undefined;
  try {
    stop = await listen<HistoryProgress>('wakeline://history-progress', (event) =>
      publishHistoryProgress(event.payload)
    );
    const result = await invoke<{ files: number; bad_lines: number }>('import_all_history');
    invalidateDashboardCache();
    window.dispatchEvent(new CustomEvent('wakeline:rescan'));
    return result;
  } finally {
    stop?.();
    publishHistoryProgress(null);
  }
}

async function loadDashboardData(): Promise<DashboardPayload> {
  if (!isTauri() && !import.meta.env.DEV) throw new Error(i18n.t('errors.desktopRuntime'));
  try {
    return await invoke<DashboardPayload>('get_dashboard_data');
  } catch (error) {
    return { ...EMPTY_PAYLOAD, scan_error: String(error) };
  }
}

export async function chooseWatchFolder(): Promise<void> {
  if (!isTauri()) throw new Error(i18n.t('errors.desktopFolderPicker'));
  const selected = await invoke<string | null>('choose_watch_folder');
  if (selected) {
    const folderName = selected.split(/[\\/]/).filter(Boolean).pop() ?? selected;
    setImportingFolder(folderName);
    try {
      invalidateDashboardCache();
      window.dispatchEvent(new CustomEvent('wakeline:rescan'));
      await fetchDashboardData({ force: true });
    } finally {
      setImportingFolder(null);
    }
  }
}

export async function removeWatchFolder(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke('remove_watch_folder', { path });
  invalidateDashboardCache();
  window.dispatchEvent(new CustomEvent('wakeline:rescan'));
}

// El backend avisa cuando cambian archivos de las carpetas vigiladas o las sesiones.
export function subscribeToChanges(): () => void {
  if (!isTauri()) return () => {};
  const unlisten = listen('wakeline://changed', () => {
    invalidateDashboardCache();
    window.dispatchEvent(new CustomEvent('wakeline:rescan'));
  });
  return () => {
    unlisten.then((stop) => stop());
  };
}

export async function getProjectCommands(path: string): Promise<UiProjectCommands | null> {
  if (!isTauri()) return null;
  return invoke<UiProjectCommands>('get_project_commands', { path });
}

// Se manda el hash que vio el usuario: si wakeline.toml cambió, el backend no aprueba.
export async function approveProjectCommands(path: string, hash: string): Promise<void> {
  if (!isTauri()) return;
  await invoke('approve_project_commands', { path, hash });
  invalidateDashboardCache();
  window.dispatchEvent(new CustomEvent('wakeline:rescan'));
}

export async function runProjectCommand(path: string, name: string): Promise<RunStatus | null> {
  if (!isTauri()) return null;
  const status = await invoke<RunStatus>('run_project_command', { path, name });
  invalidateDashboardCache();
  window.dispatchEvent(new CustomEvent('wakeline:rescan'));
  return status;
}

export function invalidateDashboardCache(): void {
  cachedDashboard = null;
  dashboardRequest = null;
}

export function getCachedDashboardData(): DashboardPayload | null {
  return cachedDashboard;
}

export function fetchDashboardData(options?: { force?: boolean }): Promise<DashboardPayload> {
  if (options?.force) {
    // Several visible sections receive the same rescan event. Share one scan.
    if (dashboardRequest) return dashboardRequest;
    cachedDashboard = null;
  } else if (cachedDashboard) {
    return Promise.resolve(cachedDashboard);
  }

  if (!dashboardRequest) {
    const startedAt = cardStatusJournal.revision;
    const request = loadDashboardData().then(
      (payload) => {
        payload = { ...payload, cards: cardStatusJournal.apply(payload.cards, startedAt) };
        if (dashboardRequest === request) {
          cachedDashboard = payload;
          dashboardRequest = null;
        }
        return payload;
      },
      (error: unknown) => {
        if (dashboardRequest === request) {
          dashboardRequest = null;
        }
        throw error;
      }
    );
    dashboardRequest = request;
  }

  return dashboardRequest;
}

// Una tarjeta con varios orígenes guarda el estado en todas sus huellas.
export async function updateCardStatus(
  fingerprint: string,
  status: CardStatus,
  fingerprints: string[] = []
): Promise<void> {
  return updateCardsStatus([{ fingerprint, fingerprints, status }]);
}

export async function createManualCard(
  title: string,
  kind: CardKind,
  project: string
): Promise<void> {
  if (!isTauri()) throw new Error(i18n.t('errors.desktopCardChanges'));
  if (isTauri()) {
    await invoke('create_card', { input: { title, kind, project } });
  }
  invalidateDashboardCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wakeline:rescan'));
  }
}

export async function updateCardsStatus(
  inputs: { fingerprint: string; fingerprints: string[]; status: CardStatus }[]
): Promise<void> {
  if (!inputs.length) return;
  if (!isTauri() && !import.meta.env.DEV) throw new Error(i18n.t('errors.desktopCardChanges'));
  const transaction = cardStatusJournal.begin(inputs);
  publishCardStatuses(inputs);
  try {
    await invoke('set_cards_status', { inputs });
    cardStatusJournal.commit(transaction);
  } catch (error) {
    publishCardStatuses(cardStatusJournal.rollback(transaction));
    throw error;
  }
}

export async function openInVscode(card: UiCard): Promise<void> {
  if (isTauri()) {
    await invoke('open_in_vscode', {
      project: card.project,
      location: card.location,
      title: card.title,
    });
  }
}

export async function listProjectFiles(project: string, relativePath = ''): Promise<UiFileEntry[]> {
  if (!isTauri()) return [];
  return invoke<UiFileEntry[]>('list_project_files', { project, relativePath });
}

export async function openProjectFile(project: string, relativePath: string): Promise<void> {
  if (!isTauri()) return;
  await invoke('open_in_editor', {
    project,
    location: relativePath,
    title: '',
    editor: preferredEditor().id,
  });
}

export async function openCardInEditor(
  card: Pick<UiCard, 'project' | 'location' | 'title'>,
  editor = preferredEditor().id
): Promise<void> {
  if (!isTauri()) throw new Error(i18n.t('errors.desktopRuntime'));
  await invoke('open_in_editor', {
    project: card.project,
    location: card.location,
    title: card.title,
    editor,
  });
}

export async function resumeClaudeSession(card: UiCard): Promise<void> {
  if (isTauri()) {
    await invoke('resume_session', {
      project: card.project,
      sessionId: card.session_id,
    });
  }
}

// ----------------------------------------------------------------------
// Cuenta y conexiones

export type GithubUser = {
  login: string;
  name: string | null;
  avatar_url: string;
};

export type AccountInfo = {
  /** `null` si `gh` no está instalado o no tiene sesión. */
  github: GithubUser | null;
  claude_code: boolean;
  codex_mcp: boolean;
  antigravity_mcp: boolean;
  ollama: boolean;
  version: string;
};

export function savedGithubProfile(): GithubUser | null {
  try {
    const value = JSON.parse(localStorage.getItem('wakeline-github-profile') ?? 'null');
    return value &&
      typeof value.login === 'string' &&
      typeof value.avatar_url === 'string' &&
      value.avatar_url.startsWith('https://avatars.githubusercontent.com/')
      ? value
      : null;
  } catch {
    return null;
  }
}
export function rememberGithubProfile(user: GithubUser) {
  try {
    localStorage.setItem('wakeline-github-profile', JSON.stringify(user));
  } catch {
    /* Profile caching is optional. */
  }
}
let accountRequest: Promise<AccountInfo> | null = null;

export function fetchAccount(force = false): Promise<AccountInfo> {
  if (force || !accountRequest) {
    accountRequest = invoke<AccountInfo>('get_account')
      .then((account) => {
        if (account.github) rememberGithubProfile(account.github);
        return account;
      })
      .catch((error) => {
        accountRequest = null;
        throw error;
      });
  }
  return accountRequest;
}

export async function quitApp(): Promise<void> {
  if (isTauri()) {
    await invoke('quit_app');
  }
}

/** Etiqueta de origen traducida; los comandos se muestran con su nombre. */
export function originLabel(t: TFunction, kind: SourceKind, label: string): string {
  return kind === 'command' ? label : t(`sources.${label}`, { defaultValue: label });
}

export async function getGithubStatus(path: string): Promise<UiGithubStatus | null> {
  if (!isTauri()) return null;
  return invoke<UiGithubStatus>('get_github_status', { path });
}

export type UiUpdate = {
  current_version: string;
  version: string | null;
  notes: string | null;
  state: 'available' | 'up_to_date' | 'unpublished' | 'unconfigured' | 'manual';
};

export async function getAppVersion(): Promise<string> {
  if (!isTauri()) return CONFIG.appVersion;
  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
}

export async function checkUpdate(): Promise<UiUpdate | null> {
  if (!isTauri() && !import.meta.env.DEV) throw new Error(i18n.t('errors.desktopUpdates'));
  const value = await invoke<UiUpdate>('check_update');
  publishUpdate(value);
  return value;
}

/** Descarga, instala y reinicia. En Windows la app se cierra al lanzar el instalador. */
export async function installUpdate(): Promise<void> {
  if (!isTauri()) return;
  await invoke('install_update');
}

export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

export async function getMcpExecutable(): Promise<string | null> {
  if (!isTauri() && !import.meta.env.DEV) throw new Error(i18n.t('errors.desktopRuntime'));
  return invoke<string | null>('get_mcp_executable');
}

export const REPO_URL = 'https://github.com/hopsiedev/wakeline';

export async function exportProjectTodo(projectName?: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>('export_todo', { projectName });
  }
  throw new Error('La exportación solo está disponible en la aplicación de escritorio');
}
