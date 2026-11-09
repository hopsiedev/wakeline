import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import { RouterLink } from 'src/routes/components';

import { DashboardContent } from 'src/layouts/dashboard';
import {
  chooseWatchFolder,
  exportProjectTodo,
  fetchDashboardData,
  type DashboardPayload,
  getCachedDashboardData,
} from 'src/services/wakeline';

import { AppIcon } from 'src/components/nav-icon';

type DayCounts = { day: string; errors: number; tasks: number; ideas: number };

function lastFourteenDays(cards: DashboardPayload['cards']): DayCounts[] {
  const today = new Date();
  const days: DayCounts[] = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    days.push({
      day: String(date.getDate()),
      errors: cards.filter((card) => card.last_seen === key && card.kind === 'error').length,
      tasks: cards.filter((card) => card.last_seen === key && card.kind === 'task').length,
      ideas: cards.filter((card) => card.last_seen === key && card.kind === 'idea').length,
    });
  }
  return days;
}

export function SummaryView() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardPayload | null>(getCachedDashboardData);
  const [exportedPath, setExportedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reload = () => fetchDashboardData({ force: true }).then(setData);
    fetchDashboardData().then(setData);
    window.addEventListener('wakeline:rescan', reload);
    return () => window.removeEventListener('wakeline:rescan', reload);
  }, []);

  const choose = async () => {
    try {
      await chooseWatchFolder();
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  };

  const exportTodo = async () => {
    try {
      const path = await exportProjectTodo(data?.projects[0]?.name);
      setExportedPath(path);
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  };

  const cards = data?.cards ?? [];
  const projects = data?.projects ?? [];
  const open = (status: string) => status === 'new' || status === 'accepted';
  const errors = cards.filter((card) => card.kind === 'error' && open(card.status)).length;
  const tasks = cards.filter((card) => card.kind === 'task' && open(card.status)).length;
  const ideas = cards.filter((card) => card.kind === 'idea' && open(card.status)).length;
  const done = cards.filter((card) => card.status === 'done').length;
  const days = lastFourteenDays(cards);
  const max = Math.max(1, ...days.map((day) => day.errors + day.tasks + day.ideas));

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
          <Typography sx={{ fontSize: 24, fontWeight: 700 }}>{t('summary.title')}</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
            {t('pullRequests.selectedFoldersOnly')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            color="inherit"
            onClick={exportTodo}
            disabled={projects.length === 0}
          >
            {t('summary.exportTodo')}
          </Button>
          <Button
            component={RouterLink}
            href="/cards"
            variant="contained"
            disabled={projects.length === 0}
          >
            {t('summary.reviewNew')}
          </Button>
        </Box>
      </Box>

      {exportedPath && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setExportedPath(null)}>
          {t('summary.exportedTo')}: {exportedPath}
        </Alert>
      )}
      {(error || data.scan_error) && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error || data.scan_error}
        </Alert>
      )}

      {data && projects.length === 0 ? (
        <Card sx={{ p: 5, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
            {t('pullRequests.noWatchedFolders')}
          </Typography>
          <Button onClick={choose} sx={{ mt: 2 }} startIcon={<AppIcon name="folder" size={18} />}>
            {t('pullRequests.watchFolder')}
          </Button>
        </Card>
      ) : (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Metric icon="bug" label={t('summary.newErrors')} value={errors} color="error.main" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Metric icon="task" label={t('summary.openTasks')} value={tasks} color="info.main" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Metric
              icon="idea"
              label={t('summary.savedIdeas')}
              value={ideas}
              color="secondary.main"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Metric icon="check" label={t('common.donePlural')} value={done} color="success.main" />
          </Grid>

          <Grid size={{ xs: 12, lg: 8 }}>
            <Card sx={{ p: 3, height: 1 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                {t('summary.dailyChartTitle')}
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>
                {t('summary.dailyChartSubtitle')}
              </Typography>
              <Box sx={{ mt: 3, height: 180, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                {days.map((day, index) => (
                  <Box
                    key={index}
                    sx={{
                      flex: 1,
                      height: 1,
                      display: 'flex',
                      flexDirection: 'column-reverse',
                      gap: 0.25,
                    }}
                  >
                    <Box
                      sx={{
                        height: String((day.errors / max) * 100) + '%',
                        bgcolor: 'error.main',
                        borderRadius: 0.5,
                      }}
                    />
                    <Box
                      sx={{
                        height: String((day.tasks / max) * 100) + '%',
                        bgcolor: 'info.main',
                        borderRadius: 0.5,
                      }}
                    />
                    <Box
                      sx={{
                        height: String((day.ideas / max) * 100) + '%',
                        bgcolor: 'secondary.main',
                        borderRadius: 0.5,
                      }}
                    />
                  </Box>
                ))}
              </Box>
              <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                {days.map((day, index) => (
                  <Typography
                    key={index}
                    sx={{ flex: 1, textAlign: 'center', color: 'text.secondary', fontSize: 11 }}
                  >
                    {day.day}
                  </Typography>
                ))}
              </Box>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Card sx={{ p: 3, height: 1 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                {t('summary.projectsTitle')}
              </Typography>
              {projects.map((project) => (
                <Box
                  key={project.path}
                  sx={(theme) => ({
                    py: 1.5,
                    borderBottom: '1px solid',
                    borderColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
                  })}
                >
                  <Typography sx={{ fontWeight: 600 }}>{project.name}</Typography>
                  <Typography
                    noWrap
                    title={project.path}
                    sx={{ color: 'text.secondary', fontSize: 12 }}
                  >
                    {project.path}
                  </Typography>
                  <Typography sx={{ mt: 0.5, fontSize: 13 }}>
                    {project.errors} {t('common.errors')} · {project.tasks} {t('common.tasks')} ·{' '}
                    {project.ideas} {t('common.ideas')}
                  </Typography>
                </Box>
              ))}
            </Card>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                {t('summary.sessionActivityTitle')}
              </Typography>
              {cards.length === 0 ? (
                <Typography sx={{ mt: 2, color: 'text.secondary', fontSize: 14 }}>
                  {t('summary.noFindings')}
                </Typography>
              ) : (
                cards.slice(0, 6).map((card) => (
                  <Box
                    key={card.fingerprint}
                    sx={{ py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}
                  >
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{card.title}</Typography>
                    <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>
                      {card.project} · {card.location}
                    </Typography>
                  </Box>
                ))
              )}
            </Card>
          </Grid>
        </Grid>
      )}
    </DashboardContent>
  );
}

function Metric({
  icon,
  label,
  value,
  color,
}: {
  icon: 'bug' | 'task' | 'idea' | 'check';
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card sx={{ p: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
      <Box sx={{ color }}>
        <AppIcon name={icon} size={28} />
      </Box>
      <Box>
        <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>{label}</Typography>
        <Typography sx={{ fontSize: 26, fontWeight: 700 }}>{value}</Typography>
      </Box>
    </Card>
  );
}
