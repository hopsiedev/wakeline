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
  exportProjectTodo,
  fetchDashboardData,
  type DashboardPayload,
} from 'src/services/wakeline';

import { Label } from 'src/components/label';
import { AppIcon, type AppIconName } from 'src/components/nav-icon';

// ----------------------------------------------------------------------

const DAILY_CHART_DATA: [number, number, number][] = [
  [1, 3, 1],
  [0, 2, 0],
  [2, 4, 1],
  [1, 1, 2],
  [0, 3, 0],
  [3, 5, 1],
  [1, 2, 1],
  [0, 1, 0],
  [2, 6, 2],
  [1, 3, 1],
  [0, 4, 1],
  [2, 2, 0],
  [1, 5, 2],
  [4, 6, 1],
];

const DAILY_CHART_DAYS = [
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
];

const CHART_MAX = 12;

const PROJECT_STYLES: Record<string, { letter: string; iconBg: string; iconColor: string }> = {
  contastack: { letter: 'C', iconBg: 'rgba(0, 167, 111, 0.16)', iconColor: 'primary.main' },
  'app-expo': { letter: 'A', iconBg: 'rgba(0, 184, 217, 0.16)', iconColor: 'info.main' },
  wakeline: { letter: 'W', iconBg: 'rgba(255, 171, 0, 0.16)', iconColor: 'warning.main' },
};

function shortHomePath(raw: string): string {
  return raw.replace(/^[A-Za-z]:\\Users\\[^\\]+/i, '~').replace(/\\/g, '/');
}

export function SummaryView() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [exportedPath, setExportedPath] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData().then(setData);
    const reload = () => fetchDashboardData({ force: true }).then(setData);
    window.addEventListener('wakeline:rescan', reload);
    return () => window.removeEventListener('wakeline:rescan', reload);
  }, []);

  const handleExport = async () => {
    const out = await exportProjectTodo('Contastack');
    setExportedPath(out);
  };

  const cards = data?.cards ?? [];
  const isOpen = (s: string) => s === 'new' || s === 'accepted';
  const openErrors = cards.filter((c) => c.kind === 'error' && isOpen(c.status)).length;
  const newErrors = cards.filter((c) => c.kind === 'error' && c.status === 'new').length;
  const openTasks = cards.filter((c) => c.kind === 'task' && isOpen(c.status)).length;
  const sessionTasks = cards.filter(
    (c) => c.kind === 'task' && c.source_kind === 'session' && isOpen(c.status)
  ).length;
  const openIdeas = cards.filter((c) => c.kind === 'idea' && isOpen(c.status)).length;
  const newIdeas = cards.filter((c) => c.kind === 'idea' && c.status === 'new').length;
  const doneCards = cards.filter((c) => c.status === 'done').length;

  const sessionTimeline = cards.filter((c) => c.source_kind === 'session').slice(0, 4);
  const specGaps = (data?.spec_gaps ?? []).slice(0, 5);

  return (
    <DashboardContent maxWidth={false}>
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
          <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.5 }}>
            {t('summary.title')}
          </Typography>
          <Typography sx={{ color: 'text.disabled', fontSize: 14 }}>
            {t('summary.subtitle')}
          </Typography>
        </Box>

        <Box sx={{ gap: 1, display: 'flex' }}>
          <Button
            variant="outlined"
            color="inherit"
            onClick={handleExport}
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
            variant="contained"
            component={RouterLink}
            href="/cards"
            startIcon={<AppIcon name="cards" size={18} />}
            sx={{
              height: 36,
              px: 1.75,
              borderRadius: 1,
              fontWeight: 700,
              bgcolor: 'text.primary',
              color: 'background.paper',
              '&:hover': { bgcolor: 'text.secondary' },
            }}
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

      {/* Fila 1: 4 tarjetas de indicadores con sus iconos de 48x48 y sparkline */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            icon="bug"
            iconBg="rgba(255, 86, 48, 0.16)"
            iconColor="error.main"
            label={t('summary.newErrors')}
            value={data ? openErrors : 4}
            deltaBold={data ? `${newErrors}` : t('summary.newErrorsDeltaUp')}
            deltaBoldColor="error.main"
            deltaText={t('summary.newErrorsDelta')}
            barColor="#FF5630"
            bars={[30, 55, 20, 45, 70, 40, 100]}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            icon="task"
            iconBg="rgba(0, 184, 217, 0.16)"
            iconColor="info.main"
            label={t('summary.openTasks')}
            value={data ? openTasks : 23}
            deltaBold={data ? `${sessionTasks}` : t('summary.openTasksDeltaBold')}
            deltaBoldColor="text.primary"
            deltaText={t('summary.openTasksDelta')}
            barColor="#00B8D9"
            bars={[60, 65, 50, 75, 70, 85, 100]}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            icon="idea"
            iconBg="rgba(142, 51, 255, 0.16)"
            iconColor="secondary.main"
            label={t('summary.savedIdeas')}
            value={data ? openIdeas : 11}
            deltaBold={data ? `${newIdeas}` : t('summary.savedIdeasDeltaBold')}
            deltaBoldColor="text.primary"
            deltaText={t('summary.savedIdeasDelta')}
            barColor="#8E33FF"
            bars={[20, 35, 35, 60, 60, 80, 100]}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            icon="auto"
            iconBg="rgba(34, 197, 94, 0.16)"
            iconColor="success.main"
            label={t('summary.autoResolved')}
            value={data ? doneCards : 9}
            deltaBold={t('summary.autoResolvedDeltaDown')}
            deltaBoldColor="success.main"
            deltaText={t('summary.autoResolvedDelta')}
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
                <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 14 }}>
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
                  height: 220,
                  pt: 1,
                  px: 0.5,
                  gap: '14px',
                  display: 'flex',
                  alignItems: 'flex-end',
                  borderBottom: `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.32)}`,
                })}
              >
                {DAILY_CHART_DATA.map(([err, task, idea], idx) => (
                  <Box
                    key={idx}
                    sx={{
                      flex: 1,
                      height: 1,
                      gap: '2px',
                      display: 'flex',
                      flexDirection: 'column-reverse',
                    }}
                  >
                    {err > 0 && (
                      <Box
                        sx={{
                          height: `${(err / CHART_MAX) * 100}%`,
                          bgcolor: '#FF5630',
                          borderRadius: '4px',
                        }}
                      />
                    )}
                    {task > 0 && (
                      <Box
                        sx={{
                          height: `${(task / CHART_MAX) * 100}%`,
                          bgcolor: '#00B8D9',
                          borderRadius: '4px',
                        }}
                      />
                    )}
                    {idea > 0 && (
                      <Box
                        sx={{
                          height: `${(idea / CHART_MAX) * 100}%`,
                          bgcolor: '#8E33FF',
                          borderRadius: '4px',
                        }}
                      />
                    )}
                  </Box>
                ))}
              </Box>

              <Box
                sx={{
                  pt: 1,
                  px: 0.5,
                  gap: '14px',
                  display: 'flex',
                  fontSize: 12,
                  color: 'text.disabled',
                }}
              >
                {DAILY_CHART_DAYS.map((day) => (
                  <Box key={day} component="span" sx={{ flex: 1, textAlign: 'center' }}>
                    {day}
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
              <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 14 }}>
                {t('summary.projectsSubtitle')}
              </Typography>
            </Box>

            <Box sx={{ pt: 1.5, pb: 3, px: 3 }}>
              {data?.projects && data.projects.length > 0 ? (
                data.projects.map((proj, idx) => {
                  const style = PROJECT_STYLES[proj.name.toLowerCase()] ?? {
                    letter: proj.name.slice(0, 1).toUpperCase(),
                    iconBg: 'rgba(0, 167, 111, 0.16)',
                    iconColor: 'primary.main',
                  };
                  return (
                    <ProjectSummaryRow
                      key={proj.name}
                      letter={style.letter}
                      iconBg={style.iconBg}
                      iconColor={style.iconColor}
                      name={proj.name}
                      meta={`${shortHomePath(proj.path)} · ${proj.branch}`}
                      errors={proj.errors}
                      tasks={proj.tasks}
                      ideas={proj.ideas}
                      isLast={idx === data.projects.length - 1}
                    />
                  );
                })
              ) : (
                <>
                  <ProjectSummaryRow
                    letter="C"
                    iconBg="rgba(0, 167, 111, 0.16)"
                    iconColor="primary.main"
                    name="Contastack"
                    meta="~/contastack · main"
                    errors={3}
                    tasks={17}
                    ideas={8}
                  />
                  <ProjectSummaryRow
                    letter="A"
                    iconBg="rgba(0, 184, 217, 0.16)"
                    iconColor="info.main"
                    name="app-expo"
                    meta="~/contastack/app-expo"
                    errors={1}
                    tasks={5}
                    ideas={2}
                  />
                  <ProjectSummaryRow
                    letter="W"
                    iconBg="rgba(255, 171, 0, 0.16)"
                    iconColor="warning.main"
                    name="wakeline"
                    meta="~/app/wakeline"
                    errors={0}
                    tasks={1}
                    ideas={1}
                    isLast
                  />
                </>
              )}
            </Box>
          </Card>
        </Grid>

        {/* Fila 3: Actividad de las sesiones de IA (7fr) + Brechas en specs/ (5fr) */}
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ height: 1 }}>
            <Box sx={{ pt: 3, px: 3, display: 'flex', alignItems: 'center' }}>
              <Box sx={{ flexGrow: 1 }}>
                <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                  {t('summary.sessionActivityTitle')}
                </Typography>
                <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 14 }}>
                  {t('summary.sessionActivitySubtitle')}
                </Typography>
              </Box>
              <Label color="default">Claude Code</Label>
            </Box>

            <Box component="ul" sx={{ p: 3, m: 0, listStyle: 'none' }}>
              {sessionTimeline.length > 0 ? (
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
                    title={`«${card.branch}» · ${card.project}${card.occurrences > 1 ? ` · ×${card.occurrences}` : ''}`}
                    description={card.title}
                    meta={`${card.last_seen} · ${card.location}`}
                    isLast={idx === sessionTimeline.length - 1}
                  />
                ))
              ) : (
                <>
                  <TimelineItem
                    color="#FF5630"
                    title="«ecf-minimalista» · 2 errores repetidos"
                    description={
                      <>
                        <code>npm run lint</code> falló 3 veces en{' '}
                        <code>components/ecf/estado.tsx</code>
                      </>
                    }
                    meta="Hoy, 14:52 · sesión 6d22581"
                  />
                  <TimelineItem
                    color="#00B8D9"
                    title="La IA dejó 3 pendientes"
                    description="«Queda pendiente probar la caja sin conexión en el móvil»"
                    meta="Hoy, 13:10 · caja-solo-servidor"
                  />
                  <TimelineItem
                    color="#8E33FF"
                    title="1 idea propuesta"
                    description="«Podríamos añadir un aviso cuando el NCF esté por agotarse»"
                    meta="Hoy, 11:47 · ecf-pestana-terminos"
                  />
                  <TimelineItem
                    color="#22C55E"
                    title="2 errores de tsc se cerraron solos"
                    description={
                      <>
                        Ya no aparecen en <code>npm run typecheck</code>
                      </>
                    }
                    meta="Hoy, 10:05 · señal local"
                    isLast
                  />
                </>
              )}
            </Box>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Card sx={{ height: 1 }}>
            <Box sx={{ pt: 3, px: 3 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                {t('summary.specGapsTitle')}
              </Typography>
              <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 14 }}>
                {t('summary.specGapsSubtitle')}
              </Typography>
            </Box>

            <Box sx={{ pt: 1.5, pb: 3, px: 3 }}>
              {specGaps.length > 0 ? (
                specGaps.map((gap, i) => (
                  <SpecGapRow
                    key={`${gap.location}-${gap.title}`}
                    title={gap.title}
                    location={gap.location}
                    badge={gap.tag}
                    color={gap.tag === 'Brecha' ? 'warning' : 'info'}
                    isLast={i === specGaps.length - 1}
                  />
                ))
              ) : (
                <>
                  <SpecGapRow
                    title="Límite de peticiones en memoria por instancia"
                    location="specs/limites.md:42"
                    badge="Brecha"
                    color="warning"
                  />
                  <SpecGapRow
                    title="Fase 5: registro de auditoría"
                    location="docs/hoja-de-ruta.md:88"
                    badge="Siguiente"
                    color="info"
                  />
                  <SpecGapRow
                    title="Rotar claves del .env antiguo en git"
                    location="CLAUDE.md:71"
                    badge="Seguridad"
                    color="error"
                    isLast
                  />
                </>
              )}
            </Box>
          </Card>
        </Grid>

        {/* Fila 4: Pull requests (6) + Issues abiertos (6) */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ height: 1 }}>
            <Box sx={{ pt: 3, px: 3, display: 'flex', alignItems: 'center' }}>
              <Box sx={{ flexGrow: 1 }}>
                <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                  {t('summary.prTitle')}
                </Typography>
                <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 14 }}>
                  {t('summary.prSubtitle')}
                </Typography>
              </Box>
              <Label color="default" sx={{ gap: 0.75 }}>
                <AppIcon name="gh" size={14} />
                {t('common.readOnly')}
              </Label>
            </Box>

            <Box sx={{ pt: 1.5, pb: 3, px: 3 }}>
              <GitRow
                icon="pr"
                iconColor="error.main"
                title="#20 ecf: quitar estado del resumen"
                meta={
                  <>
                    ecf-minimalista · CI: typecheck <FailMark /> · lint <FailMark />
                  </>
                }
                badge={t('pullRequests.ciRed')}
                badgeColor="error"
              />
              <GitRow
                icon="pr"
                iconColor="warning.main"
                title="#16 Clientes: unir duplicados al importar"
                meta="clientes-merge · abierto hace 9 días"
                badge={t('pullRequests.stalePr')}
                badgeColor="warning"
              />
              <GitRow
                icon="pr"
                iconColor="info.main"
                title="#21 Caja: reintentos con backoff"
                meta="caja-reintentos · 2 cambios pedidos en la revisión"
                badge={t('pullRequests.changesRequested')}
                badgeColor="info"
                isLast
              />
            </Box>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ height: 1 }}>
            <Box sx={{ pt: 3, px: 3 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                {t('summary.issuesTitle')}
              </Typography>
              <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 14 }}>
                {t('summary.issuesSubtitle')}
              </Typography>
            </Box>

            <Box sx={{ pt: 1.5, pb: 3, px: 3 }}>
              <GitRow
                icon="issue"
                iconColor="error.main"
                title="#34 El ticket sale sin ITBIS en impresora de 58 mm"
                meta="bug · hace 1 día"
                badge={t('common.error')}
                badgeColor="error"
              />
              <GitRow
                icon="issue"
                iconColor="secondary.main"
                title="#31 Modo oscuro en la tienda online"
                meta="enhancement · hace 6 días"
                badge={t('common.idea')}
                badgeColor="secondary"
              />
              <GitRow
                icon="issue"
                iconColor="info.main"
                title="#29 Documentar variables de entorno de Coolify"
                meta="sin etiqueta · hace 2 semanas"
                badge={t('common.task')}
                badgeColor="info"
                isLast
              />
            </Box>
          </Card>
        </Grid>
      </Grid>
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
        <Typography sx={{ color: 'text.disabled', fontSize: 12, fontFamily: 'monospace' }}>
          {meta}
        </Typography>
      </Box>

      <Box sx={{ gap: 0.75, display: 'flex' }}>
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

function GitRow({
  icon,
  iconColor,
  title,
  meta,
  badge,
  badgeColor,
  isLast,
}: {
  icon: 'pr' | 'issue';
  iconColor: string;
  title: string;
  meta: React.ReactNode;
  badge: string;
  badgeColor: 'error' | 'warning' | 'info' | 'secondary';
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
      <Box sx={{ color: iconColor, display: 'flex' }}>
        <AppIcon name={icon} size={20} />
      </Box>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography sx={{ fontWeight: 500, fontSize: 14 }}>{title}</Typography>
        <Typography sx={{ color: 'text.disabled', fontSize: 12, fontFamily: 'monospace' }}>
          {meta}
        </Typography>
      </Box>
      <Label color={badgeColor}>{badge}</Label>
    </Box>
  );
}

function FailMark() {
  return (
    <Box
      component="span"
      sx={{ color: 'error.main', display: 'inline-flex', verticalAlign: 'text-bottom' }}
    >
      <AppIcon name="x" size={12} strokeWidth={2.5} />
    </Box>
  );
}
