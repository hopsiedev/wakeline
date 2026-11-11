import type { UiCard, CardStatus } from './wakeline';

export type WorkflowEvent = {
  at: number;
  event:
    | 'detected'
    | 'repeated'
    | 'status'
    | 'signal_closed'
    | 'signal_returned'
    | 'snoozed'
    | 'resumed'
    | 'stage';
  status: CardStatus;
  occurrences: number;
};
export type Snooze = { until?: number; occurrences?: number };
export type CardMemory = {
  status: CardStatus;
  occurrences: number;
  events: WorkflowEvent[];
  snooze?: Snooze;
  automatic?: boolean;
  review?: boolean;
};
export type BoardStage = 'new' | 'accepted' | 'review' | 'done';
export type Workflow = Record<string, CardMemory>;
const KEY = 'wakeline-card-workflow-v1';
let memory: Workflow | null = null;
function record(card: UiCard, state: Workflow): CardMemory | undefined {
  return [card.fingerprint, ...card.fingerprints].map((key) => state[key]).find(Boolean);
}
export function observeWorkflow(previous: Workflow, cards: UiCard[], now: number): Workflow {
  const next = { ...previous };
  for (const card of cards) {
    const old = record(card, previous);
    const automatic = card.status === 'done' && card.occurrences === 0;
    let event: WorkflowEvent['event'] | null = null;
    if (!old) event = 'detected';
    else if (old.status !== card.status)
      event = automatic ? 'signal_closed' : old.automatic ? 'signal_returned' : 'status';
    else if (card.occurrences > old.occurrences) event = 'repeated';
    const events = [...(old?.events ?? [])];
    if (event) events.push({ at: now, event, status: card.status, occurrences: card.occurrences });
    const resumed = !!old?.snooze && !isSnoozed(card, previous, now);
    if (resumed)
      events.push({
        at: now,
        event: 'resumed',
        status: card.status,
        occurrences: card.occurrences,
      });
    const item = {
      ...old,
      snooze: resumed ? undefined : old?.snooze,
      review: card.status === 'accepted' && old?.review,
      status: card.status,
      occurrences: card.occurrences,
      automatic,
      events: events.slice(-100),
    };
    for (const key of [card.fingerprint, ...card.fingerprints]) next[key] = item;
  }
  return next;
}
export function isSnoozed(card: UiCard, state: Workflow, now = Date.now()): boolean {
  const snooze = record(card, state)?.snooze;
  if (!snooze || !['new', 'accepted'].includes(card.status)) return false;
  return snooze.until !== undefined
    ? now < snooze.until
    : snooze.occurrences !== undefined && card.occurrences <= snooze.occurrences;
}
export function priorityCards(cards: UiCard[], state: Workflow, today: string, now = Date.now()) {
  const rank = { command: 0, repeated: 1, error: 2, aging: 3, task: 4, idea: 5 };
  return cards
    .filter((c) => ['new', 'accepted'].includes(c.status) && !isSnoozed(c, state, now))
    .map((card) => {
      const age = Math.floor(
        (Date.parse(today + 'T12:00:00Z') - Date.parse(card.first_seen + 'T12:00:00Z')) / 86400000
      );
      const reason: keyof typeof rank =
        card.kind === 'error'
          ? card.source_kind === 'command'
            ? 'command'
            : card.occurrences > 1
              ? 'repeated'
              : 'error'
          : card.kind === 'task'
            ? age >= 3
              ? 'aging'
              : 'task'
            : 'idea';
      return { card, reason, age };
    })
    .sort(
      (a, b) =>
        rank[a.reason] - rank[b.reason] ||
        b.card.occurrences - a.card.occurrences ||
        a.card.first_seen.localeCompare(b.card.first_seen)
    )
    .slice(0, 3);
}
export function getWorkflow(): Workflow {
  if (memory) return memory;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    memory = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    memory = {};
  }
  return memory!;
}
function saveWorkflow(next: Workflow) {
  memory = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Keep this session's decisions if storage is full. */
  }
}
export function observeCards(cards: UiCard[]) {
  const previous = getWorkflow(),
    next = observeWorkflow(previous, cards, Date.now());
  if (JSON.stringify(next) !== JSON.stringify(previous)) saveWorkflow(next);
}
export function snoozeCard(card: UiCard, snooze: Snooze | null) {
  const state = getWorkflow();
  const old = record(card, state) ?? {
    status: card.status,
    occurrences: card.occurrences,
    events: [],
  };
  const item: CardMemory = {
    ...old,
    snooze: snooze ?? undefined,
    events: [
      ...old.events,
      {
        at: Date.now(),
        event: snooze ? 'snoozed' : 'resumed',
        status: card.status,
        occurrences: card.occurrences,
      },
    ].slice(-100) as WorkflowEvent[],
  };
  const next = { ...state };
  for (const key of [card.fingerprint, ...card.fingerprints]) next[key] = item;
  saveWorkflow(next);
  window.dispatchEvent(new CustomEvent('wakeline:workflow'));
}
export function cardHistory(card: UiCard) {
  return record(card, getWorkflow())?.events ?? [];
}

export function boardStage(card: UiCard, state: Workflow): BoardStage | 'dismissed' {
  return card.status === 'accepted' && record(card, state)?.review ? 'review' : card.status;
}
export function withReviewStage(
  state: Workflow,
  card: UiCard,
  review: boolean,
  now: number
): Workflow {
  const old = record(card, state) ?? {
    status: card.status,
    occurrences: card.occurrences,
    events: [],
  };
  const item: CardMemory = {
    ...old,
    review,
    events: [
      ...old.events,
      { at: now, event: 'stage', status: card.status, occurrences: card.occurrences },
    ].slice(-100) as WorkflowEvent[],
  };
  const next = { ...state };
  for (const key of [card.fingerprint, ...card.fingerprints]) next[key] = item;
  return next;
}
export function setReviewStage(card: UiCard, review: boolean) {
  saveWorkflow(withReviewStage(getWorkflow(), card, review, Date.now()));
  window.dispatchEvent(new CustomEvent('wakeline:workflow'));
}
