type Status = 'new' | 'accepted' | 'done' | 'dismissed';
export type StatusChange = { fingerprint: string; fingerprints: string[]; status: Status };
type Entry = { status: Status; token: number; savedAt: number | null };
type Transaction = { token: number; previous: Map<string, { entry?: Entry; status?: Status }> };

/** Keep moves visible across scans that started before their saves completed. */
export class CardStatusJournal {
  revision = 0;
  private changes = new Map<string, Entry>();
  private baseline = new Map<string, Status>();

  begin(inputs: StatusChange[]): Transaction {
    const token = ++this.revision;
    const previous: Transaction['previous'] = new Map();
    for (const input of inputs) {
      for (const fp of new Set([input.fingerprint, ...input.fingerprints])) {
        if (!previous.has(fp))
          previous.set(fp, {
            entry: this.changes.get(fp),
            status: this.changes.get(fp)?.status ?? this.baseline.get(fp),
          });
        this.changes.set(fp, { status: input.status, token, savedAt: null });
      }
    }
    return { token, previous };
  }

  commit(transaction: Transaction) {
    const savedAt = ++this.revision;
    for (const fp of transaction.previous.keys()) {
      const entry = this.changes.get(fp);
      if (entry?.token === transaction.token) this.changes.set(fp, { ...entry, savedAt });
    }
  }

  rollback(transaction: Transaction): StatusChange[] {
    const restored: StatusChange[] = [];
    for (const [fp, previous] of transaction.previous) {
      if (this.changes.get(fp)?.token !== transaction.token) continue;
      if (previous.entry) this.changes.set(fp, previous.entry);
      else this.changes.delete(fp);
      if (previous.status)
        restored.push({ fingerprint: fp, fingerprints: [], status: previous.status });
    }
    return restored;
  }

  apply<T extends { fingerprint: string; fingerprints: string[]; status: Status }>(
    cards: T[],
    startedAt: number
  ): T[] {
    return cards.map((card) => {
      const fps = [card.fingerprint, ...card.fingerprints];
      const entry = fps
        .map((fp) => this.changes.get(fp))
        .filter((value): value is Entry => !!value)
        .sort((a, b) => b.token - a.token)[0];
      const fresh = entry && entry.savedAt !== null && startedAt >= entry.savedAt;
      if (fresh) {
        for (const fp of fps)
          if (this.changes.get(fp)?.token === entry.token)
            this.changes.set(fp, { ...entry, status: card.status });
      }
      if (!entry || fresh) {
        for (const fp of fps) this.baseline.set(fp, card.status);
      }
      return entry && !fresh ? { ...card, status: entry.status } : card;
    });
  }
}
