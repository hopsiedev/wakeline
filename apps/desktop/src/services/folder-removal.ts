/** Shared progress survives navigation and deduplicates repeated removal clicks. */
export class FolderRemovals {
  private pending = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  private paths: string[] = [];
  getSnapshot = () => this.paths;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish() {
    this.paths = [...this.pending.keys()];
    this.listeners.forEach((listener) => listener());
  }
  run(path: string, action: () => Promise<void>): Promise<void> {
    const existing = this.pending.get(path);
    if (existing) return existing;
    const request = Promise.resolve()
      .then(action)
      .finally(() => {
        this.pending.delete(path);
        this.publish();
      });
    this.pending.set(path, request);
    this.publish();
    return request;
  }
}
export const folderRemovals = new FolderRemovals();
