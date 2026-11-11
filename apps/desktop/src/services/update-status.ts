import { useSyncExternalStore } from 'react';

import type { UiUpdate } from './wakeline';

let current: UiUpdate | null = null;
const subscribers = new Set<() => void>();
export function publishUpdate(value: UiUpdate | null) {
  current = value;
  for (const callback of subscribers) callback();
}
export function hasUpdate(value: UiUpdate | null) {
  return !!value?.version && ['available', 'manual'].includes(value.state);
}
export function useUpdateStatus() {
  return useSyncExternalStore(
    (callback) => {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },
    () => current
  );
}
