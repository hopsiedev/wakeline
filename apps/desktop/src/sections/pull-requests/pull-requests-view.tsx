import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { RouterLink } from 'src/routes/components';

import { DashboardContent } from 'src/layouts/dashboard';
import {
  refreshGithub,
  chooseWatchFolder,
  fetchDashboardData,
  getImportingFolder,
  type DashboardPayload,
  getCachedDashboardData,
} from 'src/services/wakeline';

import { AppIcon } from 'src/components/nav-icon';

import { PullRequestRow } from './pull-request-row';

export function PullRequestsView() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardPayload | null>(getCachedDashboardData);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importingFolder, setImportingFolder] = useState<string | null>(getImportingFolder);

  useEffect(() => {
    const reload = () => fetchDashboardData({ force: true }).then(setData);
    const onImporting = (event: Event) => {
      const custom = event as CustomEvent<string | null>;
      setImportingFolder(custom.detail ?? null);
    };
    fetchDashboardData().then(setData);
    window.addEventListener('wakeline:rescan', reload);
    window.addEventListener('wakeline:importing', onImporting);
    return () => {
      window.removeEventListener('wakeline:rescan', reload);
      window.removeEventListener('wakeline:importing', onImporting);
    };
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
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<AppIcon name="refresh" size={18} />}
            disabled={busy || !!importingFolder}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await refreshGithub();
              } catch (cause) {
                setError(String(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('pullRequests.refresh')}
          </Button>
          <Button
            variant="contained"
            startIcon={<AppIcon name="plus" size={18} />}
            onClick={choose}
            disabled={busy || !!importingFolder}
          >
            {t('pullRequests.watchFolder')}
          </Button>
        </Box>
      </Box>

      {(error || data.scan_error) && (
        <Typography sx={{ mb: 2, color: 'error.main', fontSize: 13 }}>
          {error || data.scan_error}
        </Typography>
      )}

      {importingFolder && (
        <Card
          sx={(theme) => ({
            p: 3,
            mb: 3,
            bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.08),
            border: `1px solid ${varAlpha(theme.vars.palette.primary.mainChannel, 0.28)}`,
          })}
        >
          <Box sx={{ gap: 1.5, display: 'flex', alignItems: 'center', mb: 1.5 }}>
            <Box sx={{ color: 'primary.main', display: 'flex' }}>
              <AppIcon name="folder" size={22} />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>
                {t('pullRequests.importingFolder', { folder: importingFolder })}
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>
                {t('pullRequests.importingFolderSub')}
              </Typography>
            </Box>
          </Box>
          <LinearProgress color="primary" sx={{ height: 6, borderRadius: 3 }} />
        </Card>
      )}

      {data && data.projects.length === 0 && !importingFolder && (
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
        {data.projects.map((project) => {
          const prs = data.pull_requests.filter((pr) => pr.project === project.name);
          return (
            <Grid key={project.path} size={{ xs: 12, md: 6, xl: 4 }}>
              <Card sx={{ p: 3, gap: 1.5, height: 1, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ gap: 1, display: 'flex', alignItems: 'center' }}>
                  <Typography sx={{ flexGrow: 1, fontSize: 16, fontWeight: 700 }}>
                    {project.name}
                  </Typography>
                  <Button
                    size="small"
                    color="inherit"
                    component={RouterLink}
                    href={`/projects/${encodeURIComponent(project.name)}`}
                  >
                    {t('projects.open')}
                  </Button>
                </Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                  {t('pullRequests.openPrs', { count: prs.length })}
                </Typography>
                {prs.length === 0 && (
                  <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>
                    {t('pullRequests.noOpenPrs')}
                  </Typography>
                )}
                {prs.map((pr) => (
                  <PullRequestRow key={pr.number} pr={pr} />
                ))}
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </DashboardContent>
  );
}
