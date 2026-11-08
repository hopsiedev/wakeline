import { invoke } from '@tauri-apps/api/core';

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
};

const FALLBACK_CARDS: UiCard[] = [
  {
    fingerprint: 'f1',
    short_id: 'W-001',
    kind: 'error',
    status: 'new',
    title: "ModuleNotFoundError: No module named 'PIL'",
    project: 'Contastack',
    branch: 'main',
    source_kind: 'session',
    source_label: 'Sesión IA',
    location: 'sesión 3ee6d09 · main',
    session_id: '3ee6d09d-1a88-430b-ad98-41254031eed8',
    occurrences: 3,
    first_seen: '2026-11-03',
    last_seen: '2026-11-03',
  },
  {
    fingerprint: 'f2',
    short_id: 'W-002',
    kind: 'error',
    status: 'new',
    title: "FileNotFoundError: [Errno 2] No such file or directory: '/tmp/evo_create.json'",
    project: 'Contastack',
    branch: 'main',
    source_kind: 'session',
    source_label: 'Sesión IA',
    location: 'sesión b85673e · main',
    session_id: 'b85673ed-1ef7-48e0-bc46-34397066b61c',
    occurrences: 2,
    first_seen: '2026-11-06',
    last_seen: '2026-11-06',
  },
  {
    fingerprint: 'f3',
    short_id: 'W-003',
    kind: 'error',
    status: 'new',
    title: "KeyError: 'gallery'",
    project: 'Contastack',
    branch: 'main',
    source_kind: 'session',
    source_label: 'Sesión IA',
    location: 'sesión 39643ca · main',
    session_id: '39643caa-3858-45d2-994f-3bff09d4f1a2',
    occurrences: 2,
    first_seen: '2026-10-17',
    last_seen: '2026-10-17',
  },
  {
    fingerprint: 'f4',
    short_id: 'W-004',
    kind: 'task',
    status: 'new',
    title: 'Sigue pendiente renombrar la carpeta bitacora a wakeline.',
    project: 'wakeline',
    branch: 'main',
    source_kind: 'session',
    source_label: 'Sesión IA',
    location: 'sesión 3ee6d09 · main',
    session_id: '3ee6d09d-1a88-430b-ad98-41254031eed8',
    occurrences: 2,
    first_seen: '2026-11-08',
    last_seen: '2026-11-08',
  },
  {
    fingerprint: 'f5',
    short_id: 'W-005',
    kind: 'task',
    status: 'new',
    title: 'Lo pendiente: PDF a hoja completa, notificaciones y empleados.',
    project: 'app-expo',
    branch: 'app-movil-expo',
    source_kind: 'session',
    source_label: 'Sesión IA',
    location: 'sesión b85673e · app-movil-expo',
    session_id: 'b85673ed-1ef7-48e0-bc46-34397066b61c',
    occurrences: 1,
    first_seen: '2026-11-07',
    last_seen: '2026-11-07',
  },
  {
    fingerprint: 'f6',
    short_id: 'W-006',
    kind: 'task',
    status: 'accepted',
    title:
      'Gastos por fecha, no por hora: el WhatsApp y el panel suman los gastos por día. Con dos turnos el mismo día, salen en los dos.',
    project: 'Contastack',
    branch: 'main',
    source_kind: 'document',
    source_label: 'specs/',
    location: 'specs/caja.md:99',
    session_id: null,
    occurrences: 1,
    first_seen: '2026-11-04',
    last_seen: '2026-11-08',
  },
  {
    fingerprint: 'f7',
    short_id: 'W-007',
    kind: 'task',
    status: 'accepted',
    title:
      'Gastos en el panel: el panel lee los gastos del dispositivo. Un gasto registrado en otro equipo sale en el WhatsApp, pero no en el panel.',
    project: 'Contastack',
    branch: 'main',
    source_kind: 'document',
    source_label: 'specs/',
    location: 'specs/caja.md:100',
    session_id: null,
    occurrences: 1,
    first_seen: '2026-11-04',
    last_seen: '2026-11-08',
  },
  {
    fingerprint: 'f8',
    short_id: 'W-008',
    kind: 'idea',
    status: 'new',
    title:
      'Valdría la pena más adelante si necesitas caché guardada en el teléfono o reintentos más avanzados.',
    project: 'app-expo',
    branch: 'main',
    source_kind: 'session',
    source_label: 'Sesión IA',
    location: 'sesión b85673e · main',
    session_id: 'b85673ed-1ef7-48e0-bc46-34397066b61c',
    occurrences: 1,
    first_seen: '2026-11-07',
    last_seen: '2026-11-07',
  },
  {
    fingerprint: 'f9',
    short_id: 'W-009',
    kind: 'idea',
    status: 'accepted',
    title:
      'Más adelante se puede hacer que cada cliente nuevo entre solo a la audiencia de Resend al registrarse, usando el webhook user.created.',
    project: 'Contastack',
    branch: 'main',
    source_kind: 'session',
    source_label: 'Sesión IA',
    location: 'sesión 39643ca · main',
    session_id: '39643caa-3858-45d2-994f-3bff09d4f1a2',
    occurrences: 1,
    first_seen: '2026-10-26',
    last_seen: '2026-10-26',
  },
];

const FALLBACK_PAYLOAD: DashboardPayload = {
  cards: FALLBACK_CARDS,
  projects: [
    {
      name: 'Contastack',
      path: 'C:\\Users\\User\\contastack',
      branch: 'main',
      active: true,
      errors: 3,
      tasks: 52,
      ideas: 4,
      done: 9,
      dismissed: 2,
    },
    {
      name: 'app-expo',
      path: 'C:\\Users\\User\\contastack\\app-expo',
      branch: 'app-movil-expo',
      active: true,
      errors: 0,
      tasks: 12,
      ideas: 1,
      done: 4,
      dismissed: 0,
    },
    {
      name: 'wakeline',
      path: 'C:\\Users\\User\\app\\bitacora',
      branch: 'interfaz-datos-reales',
      active: true,
      errors: 0,
      tasks: 3,
      ideas: 1,
      done: 2,
      dismissed: 0,
    },
  ],
  spec_gaps: [
    {
      title: 'Gastos por fecha, no por hora: el WhatsApp y el panel suman los gastos por día.',
      location: 'specs/caja.md:99',
      tag: 'Brecha',
      kind: 'task',
    },
    {
      title: 'Gastos en el panel: el panel lee los gastos del dispositivo.',
      location: 'specs/caja.md:100',
      tag: 'Brecha',
      kind: 'task',
    },
    {
      title: 'Tipo de gasto en el servidor: la copia no guarda si fue egreso de caja.',
      location: 'specs/caja.md:101',
      tag: 'Brecha',
      kind: 'task',
    },
    {
      title: 'Facturas vacías en el móvil: muestra un aviso amarillo con el motivo y Reintentar.',
      location: 'docs/hoja-de-ruta.md:33',
      tag: 'Siguiente',
      kind: 'task',
    },
  ],
  session_files: 60,
  megabytes_read: 507.8,
  scan_ms: 245,
};

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let cachedDashboard: DashboardPayload | null = null;
let dashboardRequest: Promise<DashboardPayload> | null = null;

async function loadDashboardData(): Promise<DashboardPayload> {
  if (!isTauri()) {
    return FALLBACK_PAYLOAD;
  }
  try {
    return await invoke<DashboardPayload>('get_dashboard_data');
  } catch {
    return FALLBACK_PAYLOAD;
  }
}

export function invalidateDashboardCache(): void {
  cachedDashboard = null;
  dashboardRequest = null;
}

export function fetchDashboardData(options?: { force?: boolean }): Promise<DashboardPayload> {
  if (options?.force) {
    invalidateDashboardCache();
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
}

export async function exportProjectTodo(projectName?: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>('export_todo', { projectName: projectName ?? 'Contastack' });
  }
  return 'C:\\Users\\User\\contastack\\docs\\TODO.md';
}
