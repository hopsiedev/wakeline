import type { UiCard, CardStatus } from './wakeline';

export type DailyCounts = { errors: number; tasks: number; ideas: number; completed: number };
export type SummarySnapshot = Record<string, CardStatus>;
export const DAILY_PREF = 'wakeline-daily-summary-enabled';
export const DAILY_SHOWN = 'wakeline-daily-summary-shown';
export const DAILY_SNAPSHOT = 'wakeline-daily-summary-snapshot';

export function dailySummaryEnabled(): boolean {
  return localStorage.getItem(DAILY_PREF) === 'true';
}
export function setDailySummaryEnabled(enabled: boolean) {
  localStorage.setItem(DAILY_PREF, String(enabled));
  window.dispatchEvent(new CustomEvent('wakeline:daily-summary-preference'));
}
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function summarizeChanges(
  cards: UiCard[],
  previous: SummarySnapshot | null,
  today: string
): DailyCounts {
  const counts: DailyCounts = { errors: 0, tasks: 0, ideas: 0, completed: 0 };
  for (const card of cards) {
    const keys = [card.fingerprint, ...card.fingerprints];
    const known = previous ? keys.map((key) => previous[key]).filter(Boolean) : [];
    const isNew = previous ? known.length === 0 : card.first_seen === today;
    if (isNew) {
      if (card.kind === 'error') counts.errors += 1;
      if (card.kind === 'task') counts.tasks += 1;
      if (card.kind === 'idea') counts.ideas += 1;
    }
    if (card.status === 'done' && known.some((status) => status !== 'done')) counts.completed += 1;
  }
  return counts;
}
export function snapshotCards(cards: UiCard[]): SummarySnapshot {
  return Object.fromEntries(
    cards.flatMap((card) =>
      [card.fingerprint, ...card.fingerprints].map((key) => [key, card.status])
    )
  );
}

export function shouldShowSummary(
  counts: DailyCounts,
  today: string,
  shown: string | null,
  pending = 0
): boolean {
  return shown !== today && (pending > 0 || Object.values(counts).some((value) => value > 0));
}
export function attentionCards(
  cards: UiCard[],
  previous: SummarySnapshot | null,
  today: string
): UiCard[] {
  const rank = { error: 0, task: 1, idea: 2 };
  return cards
    .filter(
      (card) =>
        (card.status === 'new' || card.status === 'accepted') &&
        (previous
          ? ![card.fingerprint, ...card.fingerprints].some((key) => previous[key])
          : card.first_seen === today)
    )
    .sort((a, b) => rank[a.kind] - rank[b.kind])
    .slice(0, 3);
}
