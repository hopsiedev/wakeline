import { invoke, type GithubUser, savedGithubProfile, rememberGithubProfile } from './wakeline';

export type RemoteRepository = {
  name: string;
  url: string;
  description: string | null;
  language: string | null;
  private: boolean;
  stars: number;
  pushed_at: string | null;
};
export type RemotePr = {
  id: string;
  repository: string;
  number: number;
  title: string;
  url: string;
  state: 'open' | 'review' | 'merged' | 'closed';
  review: string;
  draft: boolean;
  branch: string | null;
  author: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  first_review_at: string | null;
  additions?: number;
  deletions?: number;
  comments?: number;
};
export type CommitEvent = {
  repository: string;
  sha: string;
  at: string;
  author: string | null;
  avatar_url: string | null;
};
export type GithubWorkspace = {
  user: GithubUser;
  repositories: RemoteRepository[];
  pull_requests: RemotePr[];
  commits: CommitEvent[];
  warnings: string[];
  /** Set while GitHub limits the account: saved data is shown until then (unix seconds). */
  rate_limited_until?: number;
  sync_error?: string;
};
let request: Promise<GithubWorkspace> | null = null;
/** Whether the request in flight skips the backend cache. */
let requestForced = false;
let cached: GithubWorkspace | null = null;
/** Saved copy as text, to tell whether a new answer changes anything. */
let cachedText = '';
export function getCachedGithubWorkspace(): GithubWorkspace | null {
  if (cached) return cached;
  try {
    const text = localStorage.getItem('wakeline-github-workspace') ?? 'null';
    const data = JSON.parse(text);
    if (
      data?.user?.login === savedGithubProfile()?.login &&
      Array.isArray(data?.repositories) &&
      Array.isArray(data?.pull_requests) &&
      Array.isArray(data?.commits)
    ) {
      cached = data;
      cachedText = text;
    }
  } catch {
    /* A damaged cache never prevents a fresh request. */
  }
  return cached;
}
/**
 * Always asks the backend, which answers from its own cache unless `force` is set.
 * The copy kept here is only for the first paint.
 */
export function fetchGithubWorkspace(force = false): Promise<GithubWorkspace> {
  if (request) {
    // Refresh pressed during a background poll: wait for it, then skip the cache.
    if (force && !requestForced) {
      return request.then(
        () => fetchGithubWorkspace(true),
        () => fetchGithubWorkspace(true)
      );
    }
    return request;
  }
  requestForced = force;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 60);
  request = invoke<GithubWorkspace>('get_github_workspace', {
    since: since.toISOString(),
    force,
  }).then(
    (data) => {
      request = null;
      const text = JSON.stringify(data);
      // Same answer as before: keep the same object so nothing re-renders.
      if (cached && text === cachedText) return cached;
      cached = data;
      cachedText = text;
      rememberGithubProfile(data.user);
      try {
        localStorage.setItem('wakeline-github-workspace', text);
      } catch {
        /* Storage may be full. */
      }
      return data;
    },
    (error) => {
      request = null;
      throw error;
    }
  );
  return request;
}
