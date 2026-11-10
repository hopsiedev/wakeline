import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { RouterLink } from 'src/routes/components';

import { DashboardContent } from 'src/layouts/dashboard';
import {
  chooseWatchFolder,
  exportProjectTodo,
  fetchDashboardData,
  getImportingFolder,
  type DashboardPayload,
  getCachedDashboardData,
} from 'src/services/wakeline';

import { Label } from 'src/components/label';
import { AppIcon, type AppIconName } from 'src/components/nav-icon';

// ----------------------------------------------------------------------

const PROJECT_STYLES: Record<string, { letter: string; iconBg: string; iconColor: string }> = {
  contastack: { letter: 'C', iconBg: 'rgba(0, 167, 111, 0.16)', iconColor: 'primary.main' },
  'app-expo': { letter: 'A', iconBg: 'rgba(0, 184, 217, 0.16)', iconColor: 'info.main' },
  wakeline: { letter: 'W', iconBg: 'rgba(255, 171, 0, 0.16)', iconColor: 'warning.main' },
};

function shortHomePath(raw: string): string {
  return raw.replace(/^[A-Za-z]:\\Users\\[^\\]+/i, '~').replace(/\\/g, '/');
}

type DayCounts = {
  key: string;
  day: string;
  errors: number;
  tasks: number;
  ideas: number;
};

function lastFourteenDays(cards: DashboardPayload['cards']): DayCounts[] {
  const latestIso =
    cards
      .map((c) => c.last_seen)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .at(-1) ?? new Date().toISOString().slice(0, 10);
  const anchor = new Date(`${latestIso}T12:00:00Z`);
  const days: DayCounts[] = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(anchor.getTime() - offset * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    days.push({
      key,
      day: String(date.getUTCDate()),
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
  const newErrors = cards.filter((card) => card.kind === 'error' && card.status === 'new').length;
  const tasks = cards.filter((card) => card.kind === 'task' && open(card.status)).length;
  const sessionTasks = cards.filter(
    (card) => card.kind === 'task' && card.source_kind === 'session' && open(card.status)
  ).length;
  const ideas = cards.filter((card) => card.kind === 'idea' && open(card.status)).length;
  const newIdeas = cards.filter((card) => card.kind === 'idea' && card.status === 'new').length;
  const done = cards.filter((card) => card.status === 'done').length;

  const days = lastFourteenDays(cards);
  const maxDayTotal = Math.max(1, ...days.map((day) => day.errors + day.tasks + day.ideas));
  const sessionTimeline = cards.filter((card) => card.source_kind === 'session').slice(0, 5);
  const specGaps = (data?.spec_gaps ?? []).slice(0, 5);

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
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.5 }}>
            {t('summary.title')}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
            {t('summary.subtitle')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            color="inherit"
            onClick={exportTodo}
            disabled={projects.length === 0}
            startIcon={<AppIcon name="export" size={18} />}
            sx={(theme) => ({
              height: 36,
              px: 1.75,
              borderRadius: 1,
              fontWeight: 700,
              borderColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.32),
            })}
          >
            {t('summary.exportTodo')}
          </Button>
          <Button
            component={RouterLink}
            href="/cards"
            variant="contained"
            color="primary"
            disabled={projects.length === 0}
            startIcon={<AppIcon name="cards" size={18} />}
            sx={{ height: 36, px: 1.75, borderRadius: 1, fontWeight: 700 }}
          >
            {t('summary.reviewNew')}
          </Button>
        </Box>
      </Box>

      {exportedPath && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setExportedPath(null)}>
          {t('summary.exportedTo')}: <code>{exportedPath}</code>
        </Alert>
      )}
      {(error || data.scan_error) && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error || data.scan_error}
        </Alert>
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

      {projects.length === 0 ? (
        !importingFolder && (
          <Card sx={{ p: 5, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
              {t('pullRequests.noWatchedFolders')}
            </Typography>
            <Button
              variant="contained"
              onClick={choose}
              sx={{ mt: 2 }}
              startIcon={<AppIcon name="folder" size={18} />}
            >
              {t('pullRequests.watchFolder')}
            </Button>
          </Card>
        )
      ) : (
        <Grid container spacing={3}>
          {/* Fila 1: 4 tarjetas de indicadores con ícono de 48×48 y minigráfico */}
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard
              icon="bug"
              iconBg="rgba(255, 86, 48, 0.16)"
              iconColor="error.main"
              label={t('summary.newErrors')}
              value={errors}
              deltaBold={`${newErrors}`}
              deltaBoldColor="error.main"
              deltaText={t('summary.newErrorsDelta')}
              barColor="#FF5630"
              bars={[30, 55, 20, 45, 70, 40, 100]}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard
              icon="task"
              iconBg="rgba(0, 184, 217, 0.16)"
              iconColor="info.main"
              label={t('summary.openTasks')}
              value={tasks}
              deltaBold={`${sessionTasks}`}
              deltaBoldColor="text.primary"
              deltaText={t('summary.openTasksDelta')}
              barColor="#00B8D9"
              bars={[60, 65, 50, 75, 70, 85, 100]}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard
              icon="idea"
              iconBg="rgba(142, 51, 255, 0.16)"
              iconColor="secondary.main"
              label={t('summary.savedIdeas')}
              value={ideas}
              deltaBold={`${newIdeas}`}
              deltaBoldColor="text.primary"
              deltaText={t('summary.savedIdeasDelta')}
              barColor="#8E33FF"
              bars={[20, 35, 35, 60, 60, 80, 100]}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard
              icon="check"
              iconBg="rgba(34, 197, 94, 0.16)"
              iconColor="success.main"
              label={t('common.donePlural')}
              value={done}
              deltaBold="✓"
              deltaBoldColor="success.main"
              deltaText={t('common.donePlural').toLowerCase()}
              barColor="#22C55E"
              bars={[40, 80, 30, 60, 50, 90, 100]}
            />
          </Grid>

          {/* Fila 2: Gráfico de 14 días (8fr) + Proyectos abiertas por tipo (4fr) */}
          <Grid size={{ xs: 12, lg: 8 }}>
            <Card sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
              <Box
                sx={{
                  pt: 3,
                  px: 3,
                  gap: 1.5,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <Box sx={{ flexGrow: 1 }}>
                  <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                    {t('summary.dailyChartTitle')}
                  </Typography>
                  <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 13 }}>
                    {t('summary.dailyChartSubtitle')}
                  </Typography>
                </Box>

                <Box sx={{ gap: 2, display: 'flex', fontSize: 13, color: 'text.secondary' }}>
                  <LegendDot color="#FF5630" label={t('common.errors')} />
                  <LegendDot color="#00B8D9" label={t('common.tasks')} />
                  <LegendDot color="#8E33FF" label={t('common.ideas')} />
                </Box>
              </Box>

              <Box sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <Box
                  sx={(theme) => ({
                    position: 'relative',
                    height: 210,
                    pt: 1.5,
                    px: 1,
                    gap: 1.25,
                    display: 'flex',
                    alignItems: 'flex-end',
                    borderBottom: `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.28)}`,
                  })}
                >
                  {/* Líneas de guía horizontales */}
                  {[0.25, 0.5, 0.75, 1].map((ratio) => (
                    <Box
                      key={ratio}
                      sx={(theme) => ({
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: `${ratio * 100}%`,
                        borderTop: `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.14)}`,
                        pointerEvents: 'none',
                      })}
                    />
                  ))}

                  {days.map((day) => {
                    const total = day.errors + day.tasks + day.ideas;
                    // Escala amortiguada (raíz cuadrada) para que días con 1–2 tarjetas sean bien visibles junto a picos altos
                    const columnRatio =
                      total > 0 ? Math.max(0.16, Math.sqrt(total / maxDayTotal)) : 0;
                    const errShare = total > 0 ? (day.errors / total) * columnRatio * 100 : 0;
                    const taskShare = total > 0 ? (day.tasks / total) * columnRatio * 100 : 0;
                    const ideaShare = total > 0 ? (day.ideas / total) * columnRatio * 100 : 0;
                    const tooltipText = `${day.key}: ${day.errors} ${t('common.errors')} · ${day.tasks} ${t('common.tasks')} · ${day.ideas} ${t('common.ideas')}`;

                    return (
                      <Tooltip key={day.key} title={tooltipText} placement="top" arrow>
                        <Box
                          sx={{
                            flex: 1,
                            height: 1,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'flex-end',
                            zIndex: 1,
                          }}
                        >
                          <Box
                            sx={(theme) => ({
                              width: '100%',
                              maxWidth: 26,
                              height: 1,
                              p: '2px',
                              gap: '3px',
                              borderRadius: '7px',
                              display: 'flex',
                              flexDirection: 'column-reverse',
                              bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
                              transition: 'background-color 150ms ease',
                              '&:hover': {
                                bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
                              },
                            })}
                          >
                            {day.errors > 0 && (
                              <Box
                                sx={{
                                  height: `${errShare}%`,
                                  minHeight: 8,
                                  bgcolor: '#FF5630',
                                  borderRadius: '4px',
                                }}
                              />
                            )}
                            {day.tasks > 0 && (
                              <Box
                                sx={{
                                  height: `${taskShare}%`,
                                  minHeight: 8,
                                  bgcolor: '#00B8D9',
                                  borderRadius: '4px',
                                }}
                              />
                            )}
                            {day.ideas > 0 && (
                              <Box
                                sx={{
                                  height: `${ideaShare}%`,
                                  minHeight: 8,
                                  bgcolor: '#8E33FF',
                                  borderRadius: '4px',
                                }}
                              />
                            )}
                          </Box>
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Box>

                <Box
                  sx={{
                    pt: 1.25,
                    px: 1,
                    gap: 1.25,
                    display: 'flex',
                    fontSize: 12,
                    color: 'text.disabled',
                  }}
                >
                  {days.map((day) => (
                    <Box key={day.key} component="span" sx={{ flex: 1, textAlign: 'center' }}>
                      {day.day}
                    </Box>
                  ))}
                </Box>
              </Box>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Card sx={{ height: 1 }}>
              <Box sx={{ pt: 3, px: 3 }}>
                <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                  {t('summary.projectsTitle')}
                </Typography>
                <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 13 }}>
                  {t('summary.projectsSubtitle')}
                </Typography>
              </Box>

              <Box sx={{ pt: 1.5, pb: 3, px: 3 }}>
                {projects.map((proj, idx) => {
                  const style = PROJECT_STYLES[proj.name.toLowerCase()] ?? {
                    letter: proj.name.slice(0, 1).toUpperCase(),
                    iconBg: 'rgba(0, 167, 111, 0.16)',
                    iconColor: 'primary.main',
                  };
                  return (
                    <ProjectSummaryRow
                      key={proj.path}
                      letter={style.letter}
                      iconBg={style.iconBg}
                      iconColor={style.iconColor}
                      name={proj.name}
                      meta={`${shortHomePath(proj.path)} · ${proj.branch}`}
                      errors={proj.errors}
                      tasks={proj.tasks}
                      ideas={proj.ideas}
                      commandsPending={proj.commands_pending}
                      isLast={idx === projects.length - 1}
                    />
                  );
                })}
              </Box>
            </Card>
          </Grid>

          {/* Fila 3: Actividad de sesiones de IA + Brechas en documentos */}
          <Grid size={{ xs: 12, lg: specGaps.length > 0 ? 7 : 12 }}>
            <Card sx={{ height: 1 }}>
              <Box sx={{ pt: 3, px: 3, display: 'flex', alignItems: 'center' }}>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                    {t('summary.sessionActivityTitle')}
                  </Typography>
                  <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 13 }}>
                    {t('summary.sessionActivitySubtitle')}
                  </Typography>
                </Box>
                <Label color="default">{t('account.claudeCode')}</Label>
              </Box>

              <Box component="ul" sx={{ p: 3, m: 0, listStyle: 'none' }}>
                {sessionTimeline.length === 0 ? (
                  <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
                    {t('summary.noFindings')}
                  </Typography>
                ) : (
                  sessionTimeline.map((card, idx) => (
                    <TimelineItem
                      key={card.fingerprint}
                      color={
                        card.kind === 'error'
                          ? '#FF5630'
                          : card.kind === 'idea'
                            ? '#8E33FF'
                            : '#00B8D9'
                      }
                      title={`${card.project} · ${card.branch}${card.occurrences > 1 ? ` · ×${card.occurrences}` : ''}`}
                      description={card.title}
                      meta={`${card.last_seen} · ${card.location}`}
                      isLast={idx === sessionTimeline.length - 1}
                    />
                  ))
                )}
              </Box>
            </Card>
          </Grid>

          {specGaps.length > 0 && (
            <Grid size={{ xs: 12, lg: 5 }}>
              <Card sx={{ height: 1 }}>
                <Box sx={{ pt: 3, px: 3 }}>
                  <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                    {t('summary.specGapsTitle')}
                  </Typography>
                  <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 13 }}>
                    {t('summary.specGapsSubtitle')}
                  </Typography>
                </Box>
                <Box sx={{ pt: 1.5, pb: 3, px: 3 }}>
                  {specGaps.map((gap, idx) => (
                    <SpecGapRow
                      key={`${gap.location}-${gap.title}`}
                      title={gap.title}
                      location={gap.location}
                      badge={gap.tag}
                      color={
                        gap.kind === 'error' ? 'error' : gap.kind === 'idea' ? 'warning' : 'info'
                      }
                      isLast={idx === specGaps.length - 1}
                    />
                  ))}
                </Box>
              </Card>
            </Grid>
          )}
        </Grid>
      )}
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

function StatCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  deltaBold,
  deltaBoldColor,
  deltaText,
  barColor,
  bars,
}: {
  icon: AppIconName;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
  deltaBold: string;
  deltaBoldColor: string;
  deltaText: string;
  barColor: string;
  bars: number[];
}) {
  return (
    <Card
      sx={{
        p: 3,
        gap: 0.5,
        display: 'flex',
        overflow: 'hidden',
        position: 'relative',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: '12px',
            display: 'grid',
            placeItems: 'center',
            bgcolor: iconBg,
            color: iconColor,
          }}
        >
          <AppIcon name={icon} size={26} />
        </Box>
      </Box>

      <Typography sx={{ mt: 2, color: 'text.secondary', fontWeight: 600, fontSize: 14 }}>
        {label}
      </Typography>

      <Typography sx={{ fontSize: 32, fontWeight: 700, lineHeight: 1.4 }}>{value}</Typography>

      <Box
        sx={{
          pr: 9,
          gap: 0.5,
          display: 'flex',
          alignItems: 'center',
          fontSize: 13,
          color: 'text.secondary',
        }}
      >
        <Box component="b" sx={{ fontWeight: 600, color: deltaBoldColor }}>
          {deltaBold}
        </Box>
        <span>{deltaText}</span>
      </Box>

      <Box
        sx={{
          right: 20,
          bottom: 22,
          height: 40,
          gap: '3px',
          display: 'flex',
          position: 'absolute',
          alignItems: 'flex-end',
        }}
      >
        {bars.map((h, i) => (
          <Box
            key={i}
            sx={{
              width: 6,
              height: `${h}%`,
              borderRadius: '3px',
              bgcolor: barColor,
              opacity: 0.9,
            }}
          />
        ))}
      </Box>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <Box component="span" sx={{ gap: 0.75, display: 'inline-flex', alignItems: 'center' }}>
      <Box
        component="i"
        sx={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          bgcolor: color,
          display: 'inline-block',
        }}
      />
      {label}
    </Box>
  );
}

function ProjectSummaryRow({
  letter,
  iconBg,
  iconColor,
  name,
  meta,
  errors,
  tasks,
  ideas,
  commandsPending,
  isLast,
}: {
  letter: string;
  iconBg: string;
  iconColor: string;
  name: string;
  meta: string;
  errors: number;
  tasks: number;
  ideas: number;
  commandsPending?: boolean;
  isLast?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Box
      sx={(theme) => ({
        py: 1.75,
        gap: 1.75,
        display: 'flex',
        alignItems: 'center',
        borderBottom: isLast
          ? 0
          : `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.2)}`,
      })}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: '10px',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: 15,
          bgcolor: iconBg,
          color: iconColor,
        }}
      >
        {letter}
      </Box>

      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{name}</Typography>
        <Typography noWrap sx={{ color: 'text.disabled', fontSize: 12, fontFamily: 'monospace' }}>
          {meta}
        </Typography>
      </Box>

      <Box sx={{ gap: 0.75, display: 'flex' }}>
        {commandsPending && <Label color="warning">{t('commands.pendingBadge')}</Label>}
        <Label color={errors > 0 ? 'error' : 'default'}>{errors}</Label>
        <Label color="info">{tasks}</Label>
        <Label color="secondary">{ideas}</Label>
      </Box>
    </Box>
  );
}

function TimelineItem({
  color,
  title,
  description,
  meta,
  isLast,
}: {
  color: string;
  title: string;
  description: React.ReactNode;
  meta: string;
  isLast?: boolean;
}) {
  return (
    <Box
      component="li"
      sx={(theme) => ({
        gap: 2,
        pb: isLast ? 0 : 2.5,
        display: 'grid',
        position: 'relative',
        gridTemplateColumns: '12px 1fr',
        ...(!isLast && {
          '&::before': {
            content: '""',
            left: 5,
            top: 18,
            bottom: 0,
            width: 2,
            position: 'absolute',
            bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.2),
          },
        }),
      })}
    >
      <Box
        sx={{
          mt: '5px',
          width: 12,
          height: 12,
          borderRadius: '50%',
          bgcolor: color,
        }}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{title}</Typography>
        <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 13 }}>
          {description}
        </Typography>
        <Typography sx={{ color: 'text.disabled', fontSize: 12 }}>{meta}</Typography>
      </Box>
    </Box>
  );
}

function SpecGapRow({
  title,
  location,
  badge,
  color,
  isLast,
}: {
  title: string;
  location: string;
  badge: string;
  color: 'warning' | 'info' | 'error';
  isLast?: boolean;
}) {
  return (
    <Box
      sx={(theme) => ({
        py: 1.75,
        gap: 1.75,
        display: 'flex',
        alignItems: 'center',
        borderBottom: isLast
          ? 0
          : `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.2)}`,
      })}
    >
      <Box sx={{ color: 'text.disabled', display: 'flex' }}>
        <AppIcon name="doc" size={20} />
      </Box>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography sx={{ fontWeight: 500, fontSize: 14 }}>{title}</Typography>
        <Typography sx={{ color: 'text.disabled', fontSize: 12, fontFamily: 'monospace' }}>
          {location}
        </Typography>
      </Box>
      <Label color={color}>{badge}</Label>
    </Box>
  );
}
