import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { AppIcon, type AppIconName } from 'src/components/nav-icon';

// ----------------------------------------------------------------------

const TOML_LINES: { num: number; k?: string; eq?: string; s?: string; c?: string }[] = [
  { num: 1, k: '[proyecto]' },
  { num: 2, eq: 'nombre = ', s: '"Contastack"' },
  { num: 3, eq: 'ignorar = [', s: '"node_modules", ".next", "reels/"', c: ']' },
  { num: 4 },
  { num: 5, k: '[[comando]]', c: '   # se ejecuta tras 30 s sin cambios' },
  { num: 6, eq: 'nombre = ', s: '"typecheck"' },
  { num: 7, eq: 'ejecutar = ', s: '"npm run typecheck"' },
  { num: 8, eq: 'parser = ', s: '"tsc"' },
  { num: 9 },
  { num: 10, k: '[[comando]]', c: '   # solo a mano' },
  { num: 11, eq: 'nombre = ', s: '"tests"' },
  { num: 12, eq: 'ejecutar = ', s: '"npm test"' },
  { num: 13, eq: 'auto = ', k: 'false' },
  { num: 14 },
  { num: 15, k: '[fuentes]' },
  { num: 16, eq: 'documentos = [', s: '"specs/**/*.md", "docs/hoja-de-ruta.md"', c: ']' },
  { num: 17, eq: 'exportar = ', s: '"docs/TODO.md"' },
  { num: 18 },
  { num: 19, k: '[github]', c: '   # solo lectura, usa la sesión de gh' },
  { num: 20, eq: 'repo = ', s: '"Contastack/contastack"' },
  { num: 21, eq: 'cada = ', s: '"5m"', c: '   # y al hacer git push' },
];

export function PullRequestsView() {
  const { t } = useTranslation();

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
            {t('pullRequests.title')}
          </Typography>
          <Box
            sx={{
              gap: 1.25,
              display: 'flex',
              alignItems: 'center',
              fontSize: 14,
              color: 'text.disabled',
            }}
          >
            <span>{t('nav.summary')}</span>
            <Box
              component="i"
              sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.disabled' }}
            />
            <Box component="b" sx={{ color: 'text.primary', fontWeight: 400 }}>
              {t('pullRequests.title')}
            </Box>
          </Box>
        </Box>

        <Button
          variant="contained"
          startIcon={<AppIcon name="plus" size={18} />}
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
          {t('pullRequests.watchFolder')}
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <ProjectCard
            letter="C"
            iconBg="rgba(0, 167, 111, 0.16)"
            iconColor="primary.main"
            name="Contastack"
            path="C:\Users\User\contastack"
            statusLabel={t('pullRequests.watching')}
            statusColor="success"
            sources={[
              ['code', 'TODO/FIXME'],
              ['git', 'git'],
              ['chat', 'Claude Code'],
              ['doc', 'specs/'],
              ['term', t('pullRequests.commands2')],
              ['gh', 'GitHub'],
            ]}
            openCount="28"
            doneCount="64"
            noise="12 %"
            noiseColor="success.main"
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <ProjectCard
            letter="A"
            iconBg="rgba(0, 184, 217, 0.16)"
            iconColor="info.main"
            name="app-expo"
            path="C:\Users\User\contastack\app-expo"
            statusLabel={t('pullRequests.watching')}
            statusColor="success"
            sources={[
              ['code', 'TODO/FIXME'],
              ['chat', 'Claude Code'],
              ['term', t('pullRequests.commands1')],
            ]}
            openCount="8"
            doneCount="19"
            noise="24 %"
            noiseColor="warning.main"
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <ProjectCard
            letter="W"
            iconBg="rgba(255, 171, 0, 0.16)"
            iconColor="warning.main"
            name="wakeline"
            path="C:\Users\User\app\wakeline"
            statusLabel={t('common.paused')}
            statusColor="default"
            sources={[
              ['code', 'TODO/FIXME'],
              ['git', 'git'],
              ['chat', 'Claude Code'],
            ]}
            openCount="2"
            doneCount="0"
            noise="—"
          />
        </Grid>

        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ height: 1 }}>
            <Box sx={{ pt: 3, px: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ flexGrow: 1 }}>
                <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                  {t('pullRequests.configTitle')}
                </Typography>
                <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 14 }}>
                  {t('pullRequests.configSubtitle')}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                sx={(theme) => ({
                  height: 30,
                  px: 1.25,
                  fontSize: 13,
                  fontWeight: 700,
                  borderColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.32),
                })}
              >
                {t('common.edit')}
              </Button>
            </Box>

            <Box sx={{ p: 3 }}>
              <Box
                sx={(theme) => ({
                  py: 2,
                  borderRadius: 1.5,
                  overflowX: 'auto',
                  fontFamily: 'monospace',
                  fontSize: 12.5,
                  lineHeight: 1.7,
                  color: 'text.primary',
                  bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
                  border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.18)}`,
                })}
              >
                {TOML_LINES.map((ln) => (
                  <Box key={ln.num} sx={{ px: 2, display: 'flex', whiteSpace: 'pre' }}>
                    <Box
                      component="span"
                      sx={{
                        width: 40,
                        flexShrink: 0,
                        userSelect: 'none',
                        color: 'text.disabled',
                      }}
                    >
                      {ln.num}
                    </Box>
                    <Box component="span">
                      {ln.eq && <span>{ln.eq}</span>}
                      {ln.k && (
                        <Box component="span" sx={{ color: 'secondary.main', fontWeight: 600 }}>
                          {ln.k}
                        </Box>
                      )}
                      {ln.s && (
                        <Box component="span" sx={{ color: 'success.main' }}>
                          {ln.s}
                        </Box>
                      )}
                      {ln.c && (
                        <Box component="span" sx={{ color: 'text.disabled' }}>
                          {ln.c}
                        </Box>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Card
            sx={(theme) => ({
              p: 3,
              height: 1,
              minHeight: 260,
              display: 'grid',
              textAlign: 'center',
              placeItems: 'center',
              boxShadow: 'none',
              bgcolor: 'transparent',
              color: 'text.secondary',
              border: `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.32)}`,
            })}
          >
            <Box>
              <Box
                sx={(theme) => ({
                  mx: 'auto',
                  mb: 1.5,
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
                })}
              >
                <AppIcon name="plus" size={26} />
              </Box>
              <Typography sx={{ fontWeight: 600, color: 'text.primary' }}>
                {t('pullRequests.watchAnotherTitle')}
              </Typography>
              <Typography sx={{ mt: 0.5, fontSize: 13, maxWidth: 280 }}>
                {t('pullRequests.watchAnotherSub')}
              </Typography>
            </Box>
          </Card>
        </Grid>
      </Grid>
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

function ProjectCard({
  letter,
  iconBg,
  iconColor,
  name,
  path,
  statusLabel,
  statusColor,
  sources,
  openCount,
  doneCount,
  noise,
  noiseColor,
}: {
  letter: string;
  iconBg: string;
  iconColor: string;
  name: string;
  path: string;
  statusLabel: string;
  statusColor: 'success' | 'default';
  sources: [AppIconName, string][];
  openCount: string;
  doneCount: string;
  noise: string;
  noiseColor?: string;
}) {
  const { t } = useTranslation();

  return (
    <Card sx={{ p: 3, gap: 2, display: 'flex', flexDirection: 'column', height: 1 }}>
      <Box sx={{ gap: 1.75, display: 'flex', alignItems: 'center' }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            flexShrink: 0,
            borderRadius: '12px',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            fontSize: 18,
            bgcolor: iconBg,
            color: iconColor,
          }}
        >
          {letter}
        </Box>

        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>{name}</Typography>
          <Typography noWrap sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: 12 }}>
            {path}
          </Typography>
        </Box>

        <Label color={statusColor} sx={{ flexShrink: 0 }}>
          {statusLabel}
        </Label>
      </Box>

      <Box sx={{ gap: 1, display: 'flex', flexWrap: 'wrap' }}>
        {sources.map(([ico, text]) => (
          <Label key={text} color="default" sx={{ gap: 0.75 }}>
            <AppIcon name={ico} size={14} />
            {text}
          </Label>
        ))}
      </Box>

      <Box
        sx={(theme) => ({
          mt: 'auto',
          pt: 2,
          display: 'grid',
          textAlign: 'center',
          gridTemplateColumns: 'repeat(3, 1fr)',
          borderTop: `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.2)}`,
        })}
      >
        <Box>
          <Typography sx={{ color: 'text.disabled', fontSize: 12 }}>
            {t('pullRequests.openCount')}
          </Typography>
          <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{openCount}</Typography>
        </Box>
        <Box>
          <Typography sx={{ color: 'text.disabled', fontSize: 12 }}>
            {t('pullRequests.doneCount')}
          </Typography>
          <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{doneCount}</Typography>
        </Box>
        <Box>
          <Typography sx={{ color: 'text.disabled', fontSize: 12 }}>
            {t('pullRequests.noiseRate')}
          </Typography>
          <Typography sx={{ fontSize: 18, fontWeight: 700, color: noiseColor ?? 'text.primary' }}>
            {noise}
          </Typography>
        </Box>
      </Box>
    </Card>
  );
}
