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
let cached: GithubWorkspace | null = null;
export function getCachedGithubWorkspace(): GithubWorkspace | null {
  if (cached) return cached;
  try {
    const data = JSON.parse(localStorage.getItem('wakeline-github-workspace') ?? 'null');
    if (
      data?.user?.login === savedGithubProfile()?.login &&
      Array.isArray(data?.repositories) &&
      Array.isArray(data?.pull_requests) &&
      Array.isArray(data?.commits)
    )
      cached = data;
  } catch {
    /* A damaged cache never prevents a fresh request. */
  }
  return cached;
}
export function fetchGithubWorkspace(force = false): Promise<GithubWorkspace> {
  if (request) return request;
  if (cached && !force) return Promise.resolve(cached);
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 60);
  request = invoke<GithubWorkspace>('get_github_workspace', {
    since: since.toISOString(),
    force,
  }).then(
    (data) => {
      cached = data;
      rememberGithubProfile(data.user);
      try {
        localStorage.setItem('wakeline-github-workspace', JSON.stringify(data));
      } catch {
        /* Storage may be full. */
      }
      request = null;
      return data;
    },
    (error) => {
      request = null;
      throw error;
    }
  );
  return request;
}
