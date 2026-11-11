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
  features: ReleaseFeature[];
  fixes: { es: string[]; en: string[] };
};
// Every release is required to carry both languages; tests enforce non-empty copy.
export const RELEASES: Release[] = [
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
