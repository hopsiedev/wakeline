import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import { DashboardContent } from 'src/layouts/dashboard';
import {
  chooseWatchFolder,
  removeWatchFolder,
  fetchDashboardData,
  type DashboardPayload,
  type UiProjectSummary,
  getCachedDashboardData,
} from 'src/services/wakeline';

import { AppIcon } from 'src/components/nav-icon';

export function PullRequestsView() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardPayload | null>(getCachedDashboardData);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const reload = () => fetchDashboardData({ force: true }).then(setData);
    fetchDashboardData().then(setData);
    window.addEventListener('wakeline:rescan', reload);
    return () => window.removeEventListener('wakeline:rescan', reload);
  }, []);

  const choose = async () => {
    setError(null);
    setBusy(true);
    try {
      await chooseWatchFolder();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (path: string) => {
    try {
      await removeWatchFolder(path);
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  };

  if (!data) {
    return (
      <DashboardContent maxWidth={false}>
        <Typography sx={{ p: 3, color: 'text.secondary' }}>{t('common.loading')}</Typography>
      </DashboardContent>
    );
  }

  return (
    <DashboardContent maxWidth={false}>
      <Box
        sx={{
          mb: 4,
          display: 'flex',
          gap: 2,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 24, fontWeight: 700 }}>{t('pullRequests.title')}</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
            {t('pullRequests.selectedFoldersOnly')}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AppIcon name="plus" size={18} />}
          onClick={choose}
          disabled={busy}
        >
          {t('pullRequests.watchFolder')}
        </Button>
      </Box>

      {(error || data.scan_error) && (
        <Typography sx={{ mb: 2, color: 'error.main', fontSize: 13 }}>
          {error || data.scan_error}
        </Typography>
      )}

      {data && data.projects.length === 0 && (
        <Card
          sx={(theme) => ({
            p: 4,
            border: `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.32)}`,
            textAlign: 'center',
          })}
        >
          <Typography sx={{ fontWeight: 600 }}>{t('pullRequests.noWatchedFolders')}</Typography>
          <Button sx={{ mt: 2 }} onClick={choose} disabled={busy}>
            {t('pullRequests.watchFolder')}
          </Button>
        </Card>
      )}

      <Grid container spacing={3}>
        {data?.projects.map((project) => (
          <Grid key={project.path} size={{ xs: 12, md: 6, xl: 4 }}>
            <ProjectCard project={project} onRemove={remove} />
          </Grid>
        ))}
      </Grid>
    </DashboardContent>
  );
}

function ProjectCard({
  project,
  onRemove,
}: {
  project: UiProjectSummary;
  onRemove: (path: string) => void;
}) {
  const { t } = useTranslation();
  const open = project.errors + project.tasks + project.ideas;
  const total = open + project.done + project.dismissed;
  const noise = total > 0 ? Math.round((project.dismissed / total) * 100) : 0;

  return (
    <Card sx={{ p: 3, height: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: 1.5,
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            color: 'primary.main',
            bgcolor: 'action.hover',
          }}
        >
          {project.name.slice(0, 1).toUpperCase()}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{project.name}</Typography>
          <Typography
            noWrap
            title={project.path}
            sx={{ color: 'text.secondary', fontSize: 12, fontFamily: 'monospace' }}
          >
            {project.path}
          </Typography>
        </Box>
      </Box>

      <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>
        {t('cards.metaBranch')}: {project.branch}
      </Typography>

      <Box
        sx={{
          mt: 'auto',
          pt: 2,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Metric label={t('pullRequests.openCount')} value={open} />
        <Metric label={t('pullRequests.doneCount')} value={project.done} />
        <Metric label={t('pullRequests.noiseRate')} value={`${noise} %`} />
      </Box>

      <Button
        size="small"
        color="inherit"
        onClick={() => onRemove(project.path)}
        sx={{ alignSelf: 'flex-start' }}
      >
        {t('nav.stopWatching')}
      </Button>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>{label}</Typography>
      <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}
