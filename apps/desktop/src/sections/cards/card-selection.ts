import type { UiCard, CardStatus } from 'src/services/wakeline';

export function toggleCardSelection(
  selected: ReadonlySet<string>,
  fingerprint: string
): Set<string> {
  const next = new Set(selected);
  if (next.has(fingerprint)) next.delete(fingerprint);
  else next.add(fingerprint);
  return next;
}

export function togglePageSelection(selected: ReadonlySet<string>, page: string[]): Set<string> {
  const next = new Set(selected);
  const remove = page.length > 0 && page.every((fingerprint) => selected.has(fingerprint));
  for (const fingerprint of page) {
    if (remove) next.delete(fingerprint);
    else next.add(fingerprint);
  }
  return next;
}

export function selectedStatusInputs(
  cards: UiCard[],
  selected: ReadonlySet<string>,
  status: CardStatus
) {
  return cards
    .filter((card) => selected.has(card.fingerprint))
    .map((card) => ({
      fingerprint: card.fingerprint,
      fingerprints: card.fingerprints,
      status,
    }));
}
