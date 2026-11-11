import type { GithubWorkspace } from 'src/services/github-workspace';
import type { AccountInfo, DashboardPayload } from 'src/services/wakeline';

import { useContext, createContext } from 'react';

type WorkspaceState = {
  github: GithubWorkspace | null;
  githubBusy: boolean;
  githubError: string | null;
  reloadGithub: () => Promise<void>;
  data: DashboardPayload | null;
  account: AccountInfo | null;
  busy: boolean;
  error: string | null;
  reload: () => Promise<void>;
  notice: (text: string) => void;
  accent: string;
  setAccent: (value: string) => void;
};
export const Context = createContext<WorkspaceState | null>(null);
export const ACCENTS: Record<string, string> = {
  teal: '#2fd0b5',
  blue: '#4c9bff',
  violet: '#9d8df5',
  amber: '#f2b54a',
};
export function useWorkspace() {
  const state = useContext(Context);
  if (!state) throw new Error('Workspace unavailable');
  return state;
}
