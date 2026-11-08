import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';

import { RouterLink } from 'src/routes/components';

import { DashboardContent } from 'src/layouts/dashboard';
import {
  exportProjectTodo,
  fetchDashboardData,
  type DashboardPayload,
} from 'src/services/wakeline';

import { Label } from 'src/components/label';

// ----------------------------------------------------------------------

export function SummaryView() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [exportedPath, setExportedPath] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData().then(setData);
  }, []);

  const cards = data?.cards ?? [];
  const openCards = cards.filter((c) => c.status === 'new' || c.status === 'accepted');
  const errorCount = openCards.filter((c) => c.kind === 'error').length;
  const taskCount = openCards.filter((c) => c.kind === 'task').length;
  const ideaCount = openCards.filter((c) => c.kind === 'idea').length;
  const doneCount = cards.filter((c) => c.status === 'done').length || 9;

  const handleExport = async () => {
    const out = await exportProjectTodo('Contastack');
    setExportedPath(out);
  };

  const recentSessionCards = openCards.filter((c) => c.source_kind === 'session').slice(0, 5);
  const specGaps = data?.spec_gaps.slice(0, 6) ?? [];

  return (
    <DashboardContent maxWidth="xl">
      <Box
        sx={{
          mb: 4,
          gap: 2,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            {t('summary.title')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('summary.subtitle')}
            {data
              ? ` · ${data.session_files} sesiones (${data.megabytes_read.toFixed(1)} MB en ${data.scan_ms} ms)`
              : ''}
          </Typography>
        </Box>

        <Box sx={{ gap: 1, display: 'flex' }}>
          <Button variant="outlined" color="inherit" onClick={handleExport}>
            {t('summary.exportTodo')}
          </Button>
          <Button variant="contained" color="primary" component={RouterLink} href="/cards">
            {t('summary.reviewNew')}
          </Button>
        </Box>
      </Box>

      {exportedPath && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setExportedPath(null)}>
          {t('summary.exportedTo')}: <code>{exportedPath}</code>
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label={t('summary.newErrors')}
            value={errorCount}
            delta={t('summary.newErrorsDelta')}
            color="#FF5630"
            bars={[30, 55, 25, 45, 70, 40, 100]}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label={t('summary.openTasks')}
            value={taskCount}
            delta={t('summary.openTasksDelta')}
            color="#00B8D9"
            bars={[60, 65, 50, 75, 70, 85, 100]}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label={t('summary.savedIdeas')}
            value={ideaCount}
            delta={t('summary.savedIdeasDelta')}
            color="#8E33FF"
            bars={[20, 35, 35, 60, 60, 80, 100]}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label={t('summary.autoResolved')}
            value={doneCount}
            delta={t('summary.autoResolvedDelta')}
            color="#22C55E"
            bars={[40, 80, 30, 60, 50, 90, 100]}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ p: 3, height: 1 }}>
            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h6">{t('summary.sessionActivityTitle')}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('summary.sessionActivitySubtitle')}
                </Typography>
              </Box>
              <Label color="default">Claude Code</Label>
            </Box>

            <Box sx={{ gap: 2, display: 'flex', flexDirection: 'column' }}>
              {recentSessionCards.map((card) => (
                <Box
                  key={card.fingerprint}
                  sx={{
                    gap: 1.5,
                    display: 'flex',
                    alignItems: 'flex-start',
                    pb: 1.5,
                    borderBottom: (theme) =>
                      `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.2)}`,
                    '&:last-of-type': { pb: 0, borderBottom: 0 },
                  }}
                >
                  <Box
                    sx={{
                      mt: 0.75,
                      width: 10,
                      height: 10,
                      flexShrink: 0,
                      borderRadius: '50%',
                      bgcolor:
                        card.kind === 'error'
                          ? 'error.main'
                          : card.kind === 'idea'
                            ? 'secondary.main'
                            : 'info.main',
                    }}
                  />
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="subtitle2" noWrap>
                      {card.title}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {card.project} · [{card.branch}] · {card.last_seen} · ×{card.occurrences}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ p: 3, height: 1 }}>
            <Typography variant="h6">{t('summary.projectsTitle')}</Typography>
            <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
              {t('summary.projectsSubtitle')}
            </Typography>

            <Box sx={{ gap: 1.5, display: 'flex', flexDirection: 'column' }}>
              {(data?.projects ?? []).map((proj) => (
                <Box
                  key={proj.name}
                  sx={{
                    py: 1.25,
                    gap: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: (theme) =>
                      `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.2)}`,
                    '&:last-of-type': { borderBottom: 0 },
                  }}
                >
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 1.25,
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 'fontWeightBold',
                      bgcolor: (theme) => varAlpha(theme.vars.palette.primary.mainChannel, 0.16),
                      color: 'primary.light',
                    }}
                  >
                    {proj.name.charAt(0).toUpperCase()}
                  </Box>
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="subtitle2">{proj.name}</Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontFamily: 'monospace' }}
                    >
                      {proj.branch}
                    </Typography>
                  </Box>
                  <Box sx={{ gap: 0.75, display: 'flex' }}>
                    <Label color={proj.errors > 0 ? 'error' : 'default'}>{proj.errors}</Label>
                    <Label color="info">{proj.tasks}</Label>
                    <Label color="secondary">{proj.ideas}</Label>
                  </Box>
                </Box>
              ))}
            </Box>

            <Divider sx={{ my: 2, borderStyle: 'dashed' }} />

            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {t('summary.specGapsTitle')}
            </Typography>
            <Typography
              variant="caption"
              sx={{ mb: 1.5, display: 'block', color: 'text.secondary' }}
            >
              {t('summary.specGapsSubtitle')}
            </Typography>

            <Box sx={{ gap: 1.25, display: 'flex', flexDirection: 'column' }}>
              {specGaps.map((gap) => (
                <Box
                  key={`${gap.location}-${gap.title}`}
                  sx={{ gap: 1, display: 'flex', alignItems: 'center' }}
                >
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="body2" noWrap>
                      {gap.title}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontFamily: 'monospace' }}
                    >
                      {gap.location}
                    </Typography>
                  </Box>
                  <Label color={gap.tag === 'Brecha' ? 'warning' : 'info'}>{gap.tag}</Label>
                </Box>
              ))}
            </Box>
          </Card>
        </Grid>
      </Grid>
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

function StatCard({
  label,
  value,
  delta,
  color,
  bars,
}: {
  label: string;
  value: number;
  delta: string;
  color: string;
  bars: number[];
}) {
  return (
    <Card sx={{ p: 3, position: 'relative', overflow: 'hidden' }}>
      <Box
        sx={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          bgcolor: color,
          mb: 2,
        }}
      />
      <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography variant="h3" sx={{ my: 0.5 }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {delta}
      </Typography>

      <Box
        sx={{
          right: 20,
          bottom: 22,
          height: 38,
          gap: 0.5,
          display: 'flex',
          position: 'absolute',
          alignItems: 'flex-end',
        }}
      >
        {bars.map((h, i) => (
          <Box
            key={i}
            sx={{
              width: 5,
              height: `${h}%`,
              borderRadius: 0.5,
              bgcolor: color,
              opacity: 0.85,
            }}
          />
        ))}
      </Box>
    </Card>
  );
}
