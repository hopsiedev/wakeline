import type { UiCard, CardKind, CardStatus, SourceKind } from 'src/services/wakeline';

export type SourceFilter = 'all' | 'code' | 'session' | 'github' | 'document';
export type StatusFilter = 'all' | 'open' | CardStatus;
export type CardFilters = {
  kind: 'all' | CardKind;
  project: string;
  source: SourceFilter;
  status: StatusFilter;
  search: string;
};

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function sourceMatches(kind: SourceKind, source: SourceFilter): boolean {
  if (source === 'all') return true;
  if (source === 'code') return kind === 'comment' || kind === 'command';
  if (source === 'github') return kind === 'pull_request' || kind === 'issue';
  return kind === source;
}

export function matchesCardFilters(card: UiCard, filters: CardFilters): boolean {
  if (filters.kind !== 'all' && card.kind !== filters.kind) return false;
  if (filters.project !== 'all' && card.project !== filters.project) return false;
  if (filters.status === 'open') {
    if (card.status !== 'new' && card.status !== 'accepted') return false;
  } else if (filters.status !== 'all' && card.status !== filters.status) return false;
  if (
    !sourceMatches(card.source_kind, filters.source) &&
    !card.origins.some((origin) => sourceMatches(origin.source_kind, filters.source))
  )
    return false;
  const terms = normalize(filters.search.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = normalize(
    [
      card.title,
      card.location,
      card.branch,
      card.project,
      card.short_id,
      card.session_id,
      card.evidence,
      card.code_excerpt,
      card.source_label,
      ...card.origins.flatMap((origin) => [origin.location, origin.source_label]),
    ]
      .filter(Boolean)
      .join(' ')
  );
  return terms.every((term) => text.includes(term));
}
