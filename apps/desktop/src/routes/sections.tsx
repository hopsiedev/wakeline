import type { RouteObject } from 'react-router';

import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import LinearProgress, { linearProgressClasses } from '@mui/material/LinearProgress';

import { ObsidianLayout } from 'src/obsidian/workspace';

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

const renderFallback = () => (
  <Box
    sx={{
      display: 'flex',
      flex: '1 1 auto',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <LinearProgress
      sx={{
        width: 1,
        maxWidth: 320,
        bgcolor: (theme) => varAlpha(theme.vars.palette.text.primaryChannel, 0.16),
        [`& .${linearProgressClasses.bar}`]: { bgcolor: 'text.primary' },
      }}
    />
  </Box>
);

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
