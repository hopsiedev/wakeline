import type { RemotePr } from './github-workspace';

export function remoteDetail(pr: RemotePr) {
  return {
    repository: pr.repository,
    project: pr.repository,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    branch: pr.branch ?? '',
    draft: pr.draft,
    age_days: Math.max(0, Math.floor((Date.now() - Date.parse(pr.created_at)) / 86400000)),
    ci: 'none' as const,
    review:
      pr.review === 'approved'
        ? ('approved' as const)
        : pr.review === 'changes_requested'
          ? ('changes_requested' as const)
          : ('none' as const),
  };
}
