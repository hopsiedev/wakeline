export type ReleaseCopy = { title: string; text: string; label: string };
export type ReleaseFeature = {
  id: string;
  kind: 'feature' | 'fix' | 'update';
  scene: 'priorities' | 'snooze' | 'history';
  es: ReleaseCopy;
  en: ReleaseCopy;
};
export type Release = {
  version: string;
  presentation?: 'patch';
  features: ReleaseFeature[];
  fixes: { es: string[]; en: string[] };
};
// Every release is required to carry both languages; tests enforce non-empty copy.
export const RELEASES: Release[] = [
  {
    // Its scenes, features included, live in obsidian/release-019.tsx.
    version: '0.1.9',
    presentation: 'patch',
    features: [],
    fixes: {
      es: [
        'Las tarjetas de To Do cambian de columna al instante y un escaneo en marcha ya no las devuelve.',
        'Los números del Resumen ya no salen cortados al abrir la ventana desde la bandeja.',
        'El gráfico de actividad ya no deja una franja vacía debajo.',
        'Las rutas largas se ajustan dentro de sus tarjetas a cualquier tamaño de ventana.',
      ],
      en: [
        'To Do cards switch columns right away and a running scan no longer puts them back.',
        'Summary numbers are no longer cut off when the window opens from the tray.',
        'The activity chart no longer leaves an empty strip below.',
        'Long paths wrap inside their cards at any window size.',
      ],
    },
  },
  {
    version: '0.1.8',
    presentation: 'patch',
    features: [],
    fixes: {
      es: [
        'Presentación animada de correcciones con seis escenas y cierre, en español e inglés.',
        'MCP permite crear y mover tarjetas de cualquier proyecto sin leer carpetas ni añadirlas a vigilancia.',
        'To do se actualiza al cambiar tarjetas por MCP.',
        'Los selectores de agente, modelo y esfuerzo se abren junto a su botón.',
        'El selector de editor se cierra al hacer clic fuera.',
        'Versiones muestra la versión instalada y las actualizaciones se comprueban cada hora.',
      ],
      en: [
        'Animated patch presentation with six scenes and a wrap-up, in Spanish and English.',
        'MCP creates and moves cards for any project without reading folders or adding watches.',
        'To do refreshes after MCP card changes.',
        'Agent, model and effort menus open beside their own trigger.',
        'The editor picker dismisses on outside click.',
        'Versions shows the installed version and update checks run hourly.',
      ],
    },
  },
  {
    version: '0.1.7',
    features: [],
    fixes: {
      es: [
        'Configuración ya no se congela mientras se importa el historial.',
        'Actualizar en Code review trae al momento las PR nuevas.',
        'Los commits hechos con Claude o Codex muestran su cuenta y foto de GitHub.',
        'Selector de sesiones del chat con el estilo de la app; las sesiones vacías no se guardan.',
        'Barras de actividad separadas por día y filtros de Code review compactos.',
        'To do permite vigilar y dejar de vigilar carpetas.',
      ],
      en: [
        'Settings no longer freezes while the history imports.',
        'Refresh in Code review brings in new pull requests right away.',
        'Commits made with Claude or Codex show their GitHub account and picture.',
        'Chat session picker matches the app; empty sessions are not saved.',
        'Activity bars stay apart per day and Code review filters are compact again.',
        'To do lets you watch and stop watching folders.',
      ],
    },
  },
  {
    version: '0.1.6',
    features: [],
    fixes: {
      es: [
        'Resumen diario con el diseño aprobado y estado Estás al día sin espacios vacíos.',
        'Selectores del chat y atajos se cierran con Escape y clic fuera.',
        'Comparativas porcentuales en semana y mes; Hoy sin porcentajes.',
        'Aviso del sistema e indicador verde para actualizar cuando tú decidas.',
      ],
      en: [
        'Daily summary with the approved layout and a compact up-to-date state.',
        'Chat pickers and shortcuts dismiss with Escape or an outside click.',
        'Percentage comparisons for week and month; no percentage for Today.',
        'System notification and green sidebar indicator; install when you choose.',
      ],
    },
  },
  {
    version: '0.1.5',
    features: [
      {
        id: 'priorities',
        kind: 'feature',
        scene: 'priorities',
        es: {
          title: 'Tu siguiente paso, claro.',
          text: 'Los pendientes que merecen tu atención, con una razón para empezar por ellos.',
          label: 'Prioridades con contexto',
        },
        en: {
          title: 'Your next step, made clear.',
          text: 'The items that deserve your attention, with a reason to start with each one.',
          label: 'Priorities with context',
        },
      },
      {
        id: 'snooze',
        kind: 'feature',
        scene: 'snooze',
        es: {
          title: 'Ahora no. Más tarde, sí.',
          text: 'Pospón una tarjeta hasta mañana o una nueva aparición. Sin perder el hilo.',
          label: 'Posponer tarjetas',
        },
        en: {
          title: 'Not now. Later, yes.',
          text: 'Snooze a card until tomorrow or a new occurrence. Keep the thread.',
          label: 'Snooze cards',
        },
      },
      {
        id: 'history',
        kind: 'update',
        scene: 'history',
        es: {
          title: 'Cada cambio tiene historia.',
          text: 'Del primer hallazgo a la resolución. Origen, evidencia y progreso en un mismo lugar.',
          label: 'Historial de tarjetas',
        },
        en: {
          title: 'Every change has a history.',
          text: 'From the first finding to resolution. Origin, evidence, and progress in one place.',
          label: 'Card history',
        },
      },
      {
        id: 'actions',
        kind: 'feature',
        scene: 'history',
        es: {
          title: 'Del hallazgo a la acción.',
          text: 'Copia el contexto y ejecuta los comandos configurados y aprobados de tu proyecto desde el detalle.',
          label: 'Acciones supervisadas',
        },
        en: {
          title: 'From finding to action.',
          text: 'Copy the context and run your project’s configured, approved commands from the card details.',
          label: 'Supervised actions',
        },
      },
    ],
    fixes: {
      es: [
        'Inicio real con Windows en segundo plano y estado de vigilancia visible.',
        'Resumen accionable, sin interrupciones vacías y con acceso manual.',
      ],
      en: [
        'Real background startup with Windows and visible monitoring status.',
        'Actionable summaries without empty interruptions, always available manually.',
      ],
    },
  },
];
export const RELEASE_SHOWN = 'wakeline-release-shown';
export function shouldShowRelease(version: string, shown: string | null): boolean {
  return version !== shown && RELEASES.some((release) => release.version === version);
}

export const RELEASE_PRESENTATION = [
  { id: 'todo', kind: 'feature' },
  { id: 'priorities', kind: 'feature' },
  { id: 'snooze', kind: 'feature' },
  { id: 'history', kind: 'update' },
  { id: 'repositories', kind: 'feature' },
  { id: 'reviews', kind: 'update' },
  { id: 'connectors', kind: 'feature' },
] as const;
