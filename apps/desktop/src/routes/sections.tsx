import type { RouteObject } from 'react-router';

import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import LinearProgress, { linearProgressClasses } from '@mui/material/LinearProgress';

import { DashboardLayout } from 'src/layouts/dashboard';

// ----------------------------------------------------------------------

export const SummaryPage = lazy(() => import('src/pages/summary'));
export const CardsPage = lazy(() => import('src/pages/cards'));
export const PullRequestsPage = lazy(() => import('src/pages/pull-requests'));
export const SettingsPage = lazy(() => import('src/pages/settings'));
export const ProjectPage = lazy(() => import('src/pages/project'));
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
      <DashboardLayout>
        <Suspense fallback={renderFallback()}>
          <Outlet />
        </Suspense>
      </DashboardLayout>
    ),
    children: [
      { index: true, element: <SummaryPage /> },
      { path: 'cards', element: <CardsPage /> },
      { path: 'cards/:id', element: <CardsPage /> },
      { path: 'pull-requests', element: <PullRequestsPage /> },
      { path: 'projects/:name', element: <ProjectPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  {
    path: '404',
    element: <Page404 />,
  },
  { path: '*', element: <Page404 /> },
];
