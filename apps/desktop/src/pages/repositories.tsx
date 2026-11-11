import type { DashboardPayload } from 'src/services/wakeline';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { RouterLink } from 'src/routes/components';

import { DashboardContent } from 'src/layouts/dashboard';
import {
  chooseWatchFolder,
  fetchDashboardData,
  getCachedDashboardData,
} from 'src/services/wakeline';

export default function RepositoriesPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardPayload | null>(getCachedDashboardData);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState('recent');
  const load = async (force = false) => {
    setBusy(true);
    try {
      const result = await fetchDashboardData({ force });
      if (result.scan_error) throw new Error(result.scan_error);
      setData(result);
      setError(null);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
    const update = () => {
      void load(true);
    };
    window.addEventListener('wakeline:rescan', update);
    return () => window.removeEventListener('wakeline:rescan', update);
  }, []);
  const recent = (name: string) =>
    (data?.cards ?? [])
      .filter((card) => card.project === name)
      .map((card) => card.last_seen)
      .sort()
      .at(-1) ?? '';
  const projects = [...(data?.projects ?? [])].sort((a, b) =>
    sort === 'name'
      ? a.name.localeCompare(b.name)
      : recent(b.name).localeCompare(recent(a.name)) || a.name.localeCompare(b.name)
  );
  return (
    <DashboardContent maxWidth={false}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 3, flexWrap: 'wrap' }}>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {t('nav.repositories')}
        </Typography>
        <Select
          size="small"
          value={sort}
          inputProps={{ 'aria-label': t('repositories.sort') }}
          onChange={(event) => setSort(event.target.value)}
        >
          <MenuItem value="recent">{t('repositories.recent')}</MenuItem>
          <MenuItem value="name">{t('repositories.name')}</MenuItem>
        </Select>
        <Button disabled={busy} onClick={() => load(true)}>
          {t('repositories.refresh')}
        </Button>
        <Button
          variant="contained"
          onClick={() => chooseWatchFolder().catch((cause) => setError(String(cause)))}
        >
          {t('nav.watchFolder')}
        </Button>
      </Box>
      {busy && <LinearProgress />}
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => load(true)}>
              {t('repositories.refresh')}
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {!busy && !error && !projects.length && (
        <Typography color="text.secondary">{t('repositories.empty')}</Typography>
      )}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' },
          gap: 2,
          mt: 3,
        }}
      >
        {projects.map((project) => (
          <Card key={project.path} sx={{ p: 3 }}>
            <Typography variant="h6">{project.name}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {project.path}
            </Typography>
            <Typography variant="body2" sx={{ my: 2 }}>
              {project.branch} · {t('common.error')}: {project.errors} · {t('common.task')}:{' '}
              {project.tasks} · {t('common.idea')}: {project.ideas}
            </Typography>
            <Button component={RouterLink} href={`/projects/${encodeURIComponent(project.name)}`}>
              {t('projects.open')}
            </Button>
          </Card>
        ))}
      </Box>
    </DashboardContent>
  );
}
