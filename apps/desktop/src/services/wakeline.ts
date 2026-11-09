import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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
  session_files: number;
  megabytes_read: number;
  scan_ms: number;
  scan_error?: string;
};

const EMPTY_PAYLOAD: DashboardPayload = {
  cards: [],
  projects: [],
  spec_gaps: [],
  session_files: 0,
  megabytes_read: 0,
  scan_ms: 0,
};

function isTauri(): boolean {
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

async function loadDashboardData(): Promise<DashboardPayload> {
  if (!isTauri()) {
    return EMPTY_PAYLOAD;
  }
  try {
    return await invoke<DashboardPayload>('get_dashboard_data');
  } catch (error) {
    return { ...EMPTY_PAYLOAD, scan_error: String(error) };
  }
}

export async function chooseWatchFolder(): Promise<void> {
  if (!isTauri()) throw new Error('Elige la carpeta desde la aplicación de escritorio');
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
    const request = loadDashboardData().then(
      (payload) => {
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

export async function updateCardStatus(fingerprint: string, status: CardStatus): Promise<void> {
  if (isTauri()) {
    await invoke('set_card_status', { input: { fingerprint, status } });
  }
  invalidateDashboardCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wakeline:rescan'));
  }
}

export async function createManualCard(
  title: string,
  kind: CardKind,
  project: string
): Promise<void> {
  if (isTauri()) {
    await invoke('create_card', { input: { title, kind, project } });
  }
  invalidateDashboardCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wakeline:rescan'));
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
  await invoke('open_in_vscode', { project, location: relativePath, title: '' });
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

const FALLBACK_ACCOUNT: AccountInfo = {
  github: null,
  claude_code: false,
  codex_mcp: false,
  antigravity_mcp: false,
  ollama: false,
  version: '0.1.0',
};

let accountRequest: Promise<AccountInfo> | null = null;

export function fetchAccount(force = false): Promise<AccountInfo> {
  if (force || !accountRequest) {
    accountRequest = isTauri()
      ? invoke<AccountInfo>('get_account').catch(() => FALLBACK_ACCOUNT)
      : Promise.resolve(FALLBACK_ACCOUNT);
  }
  return accountRequest;
}

export async function quitApp(): Promise<void> {
  if (isTauri()) {
    await invoke('quit_app');
  }
}

export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

/** Notificación de prueba, para ver cómo se verán los avisos. */
export async function sendTestNotification(): Promise<void> {
  if (isTauri()) {
    await invoke('test_notification');
  }
}

export async function getMcpExecutable(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>('get_mcp_executable');
}

export const REPO_URL = 'https://github.com/hopsiedev/wakeline';

export async function exportProjectTodo(projectName?: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>('export_todo', { projectName });
  }
  throw new Error('La exportación solo está disponible en la aplicación de escritorio');
}
