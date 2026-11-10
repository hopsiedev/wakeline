import type { DashboardPayload } from 'src/services/wakeline';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import ListItemButton from '@mui/material/ListItemButton';

import { RouterLink } from 'src/routes/components';

import { DashboardContent } from 'src/layouts/dashboard';
import {
  removeWatchFolder,
  fetchDashboardData,
  getCachedDashboardData,
} from 'src/services/wakeline';

import { Label } from 'src/components/label';

import { ProjectGithub } from '../settings/github-status-card';
import { PullRequestRow } from '../pull-requests/pull-request-row';
import { ProjectCommands } from '../settings/project-commands-card';

// ----------------------------------------------------------------------

const OPEN_CARDS_SHOWN = 8;

// Pantalla de un proyecto (Q50): se llega desde el árbol de proyectos de la barra lateral.
export function ProjectView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { name = '' } = useParams();
  const [data, setData] = useState<DashboardPayload | null>(getCachedDashboardData);

  useEffect(() => {
    const reload = () => fetchDashboardData({ force: true }).then(setData);
    fetchDashboardData().then(setData);
    window.addEventListener('wakeline:rescan', reload);
    return () => window.removeEventListener('wakeline:rescan', reload);
  }, []);

  if (!data) {
    return (
      <DashboardContent maxWidth={false}>
        <Typography sx={{ p: 3, color: 'text.secondary' }}>{t('common.loading')}</Typography>
      </DashboardContent>
    );
  }

  const project = data.projects.find((p) => p.name === name);
  if (!project) {
    return (
      <DashboardContent maxWidth={false}>
        <Typography sx={{ p: 3, color: 'text.secondary' }}>{t('projects.notFound')}</Typography>
      </DashboardContent>
    );
  }

  const cards = data.cards.filter((c) => c.project === project.name);
  const openCards = cards.filter((c) => c.status === 'new' || c.status === 'accepted');
  const pullRequests = data.pull_requests.filter((pr) => pr.project === project.name);
  const open = project.errors + project.tasks + project.ideas;
  const total = open + project.done + project.dismissed;
  const noise = total > 0 ? Math.round((project.dismissed / total) * 100) : 0;

  const stopWatching = async () => {
    await removeWatchFolder(project.path);
    navigate('/');
  };

  return (
    <DashboardContent maxWidth={false}>
      <Box sx={{ mb: 3, gap: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography sx={{ fontSize: 24, fontWeight: 700 }}>{project.name}</Typography>
          <Typography
            noWrap
            title={project.path}
            sx={{ color: 'text.secondary', fontSize: 13, fontFamily: 'monospace' }}
          >
            {project.path} · {project.branch}
          </Typography>
        </Box>
        <Button color="inherit" onClick={stopWatching}>
          {t('nav.stopWatching')}
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Metric label={t('common.errors')} value={project.errors} />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Metric label={t('common.tasks')} value={project.tasks} />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Metric label={t('common.ideas')} value={project.ideas} />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Metric
            label={t('pullRequests.noiseRate')}
            value={`${noise} %`}
            hint={t('projects.doneCount', { count: project.done })}
          />
        </Grid>

        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ p: 3 }}>
            <Box sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ flexGrow: 1, fontSize: 18, fontWeight: 600 }}>
                {t('projects.openCards')}
              </Typography>
              <Button size="small" color="inherit" component={RouterLink} href="/cards">
                {t('projects.allCards')}
              </Button>
            </Box>
            {openCards.length === 0 && (
              <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>
                {t('projects.noOpenCards')}
              </Typography>
            )}
            {openCards.slice(0, OPEN_CARDS_SHOWN).map((card) => (
              <ListItemButton
                key={card.fingerprint}
                component={RouterLink}
                href={`/cards/${card.fingerprint}`}
                sx={{ gap: 1, px: 1, borderRadius: 1 }}
              >
                <Label color={KIND_COLOR[card.kind]}>{t(`common.${card.kind}`)}</Label>
                <Typography noWrap sx={{ flexGrow: 1, minWidth: 0, fontSize: 13.5 }}>
                  {card.title}
                </Typography>
                <Typography noWrap sx={{ color: 'text.disabled', fontSize: 12, maxWidth: 220 }}>
                  {card.location}
                </Typography>
              </ListItemButton>
            ))}
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{t('commands.title')}</Typography>
              <ProjectCommands project={project} mode="run" />
            </Card>

            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                {t('pullRequests.openPrs', { count: pullRequests.length })}
              </Typography>
              <ProjectGithub project={project} isLast />
              <Box sx={{ gap: 1, display: 'flex', flexDirection: 'column' }}>
                {pullRequests.map((pr) => (
                  <PullRequestRow key={pr.number} pr={pr} />
                ))}
              </Box>
            </Card>
          </Box>
        </Grid>
      </Grid>
    </DashboardContent>
  );
}

const KIND_COLOR = { error: 'error', task: 'info', idea: 'secondary' } as const;

function Metric({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card sx={{ p: 3 }}>
      <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>{label}</Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 700 }}>{value}</Typography>
      {hint && <Typography sx={{ color: 'text.disabled', fontSize: 12 }}>{hint}</Typography>}
    </Card>
  );
}
