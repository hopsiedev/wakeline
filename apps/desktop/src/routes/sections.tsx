import type { RouteObject } from 'react-router';

import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';

import { ObsidianLayout } from 'src/obsidian/workspace';
import { LoadingSkeleton } from 'src/obsidian/loading-skeleton';

// ----------------------------------------------------------------------

export const SummaryPage = lazy(() =>
  import('src/obsidian/github-pages').then((module) => ({ default: module.SummaryPage }))
);
export const CardsPage = lazy(() =>
  import('src/obsidian/views').then((module) => ({ default: module.TodoPage }))
);
export const PullRequestsPage = lazy(() =>
  import('src/obsidian/github-pages').then((module) => ({ default: module.ReviewsPage }))
);
export const PullRequestPage = lazy(() =>
  import('src/obsidian/pr-page').then((module) => ({ default: module.PullRequestPage }))
);
export const SettingsPage = lazy(() =>
  import('src/obsidian/settings').then((module) => ({ default: module.SettingsPage }))
);
export const RepositoriesPage = lazy(() =>
  import('src/obsidian/github-pages').then((module) => ({ default: module.RepositoriesPage }))
);
export const ProjectPage = lazy(() =>
  import('src/obsidian/views').then((module) => ({ default: module.ProjectPage }))
);
export const ConnectionsPage = lazy(() =>
  import('src/obsidian/settings').then((module) => ({ default: module.ConnectionsPage }))
);
export const Page404 = lazy(() => import('src/pages/page-not-found'));

const renderFallback = () => <LoadingSkeleton />;

export const routesSection: RouteObject[] = [
  {
    element: (
      <ObsidianLayout>
        <Suspense fallback={renderFallback()}>
          <Outlet />
        </Suspense>
      </ObsidianLayout>
    ),
    children: [
      { index: true, element: <SummaryPage /> },
      { path: 'repositories', element: <RepositoriesPage /> },
      { path: 'cards', element: <CardsPage /> },
      { path: 'cards/:id', element: <CardsPage /> },
      { path: 'pull-requests', element: <PullRequestsPage /> },
      { path: 'pull-requests/:owner/:repo/:number', element: <PullRequestPage /> },
      { path: 'projects/:name', element: <ProjectPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'connections', element: <ConnectionsPage /> },
    ],
  },
  {
    path: '404',
    element: <Page404 />,
  },
  { path: '*', element: <Page404 /> },
];
