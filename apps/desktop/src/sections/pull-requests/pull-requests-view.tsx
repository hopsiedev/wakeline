import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';

import { DashboardContent } from 'src/layouts/dashboard';
import { fetchDashboardData, type DashboardPayload } from 'src/services/wakeline';

import { Label } from 'src/components/label';

// ----------------------------------------------------------------------

const SAMPLE_TOML = `[proyecto]
nombre = "Contastack"
ignorar = ["node_modules", ".next", "reels/"]

[[comando]]   # tras 30 s sin cambios
nombre = "typecheck"
ejecutar = "npm run typecheck"
parser = "tsc"

[[comando]]   # solo a pedido
nombre = "tests"
ejecutar = "npm test"
auto = false

[fuentes]
documentos = ["specs/**/*.md", "docs/hoja-de-ruta.md"]
exportar = "docs/TODO.md"

[github]      # solo lectura, usa la sesión de gh
repo = "Contastack/contastack"
cada = "5m"`;

export function PullRequestsView() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardPayload | null>(null);

  useEffect(() => {
    fetchDashboardData().then(setData);
  }, []);

  const projects = data?.projects ?? [];

  return (
    <DashboardContent maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4">{t('pullRequests.title')}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('pullRequests.subtitle')}
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {projects.map((proj) => {
          const openTotal = proj.errors + proj.tasks + proj.ideas;
          const totalSeen = openTotal + proj.done + proj.dismissed;
          const noise = totalSeen > 0 ? Math.round((proj.dismissed / totalSeen) * 100) : 12;

          return (
            <Grid key={proj.name} size={{ xs: 12, md: 4 }}>
              <Card sx={{ p: 3 }}>
                <Box sx={{ mb: 2, gap: 1.5, display: 'flex', alignItems: 'center' }}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: 1.5,
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
                    <Typography variant="subtitle1">{proj.name}</Typography>
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{ display: 'block', color: 'text.secondary', fontFamily: 'monospace' }}
                    >
                      {proj.path}
                    </Typography>
                  </Box>
                  <Label color="success">{t('pullRequests.watching')}</Label>
                </Box>

                <Box sx={{ mb: 2, gap: 0.75, display: 'flex', flexWrap: 'wrap' }}>
                  <Label color="default">TODO/FIXME</Label>
                  <Label color="default">git ({proj.branch})</Label>
                  <Label color="default">Claude Code</Label>
                  <Label color="default">specs/</Label>
                </Box>

                <Divider sx={{ my: 2, borderStyle: 'dashed' }} />

                <Box
                  sx={{
                    display: 'grid',
                    textAlign: 'center',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                  }}
                >
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {t('pullRequests.openCount')}
                    </Typography>
                    <Typography variant="h6">{openTotal}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {t('pullRequests.doneCount')}
                    </Typography>
                    <Typography variant="h6">{proj.done}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {t('pullRequests.noiseRate')}
                    </Typography>
                    <Typography variant="h6" sx={{ color: 'success.light' }}>
                      {noise}%
                    </Typography>
                  </Box>
                </Box>
              </Card>
            </Grid>
          );
        })}

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ p: 3, height: 1 }}>
            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h6">{t('summary.prTitle')}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('summary.prSubtitle')}
                </Typography>
              </Box>
              <Label color="default">{t('common.readOnly')}</Label>
            </Box>

            <Box sx={{ gap: 2, display: 'flex', flexDirection: 'column' }}>
              <PrRow
                title="#10 app-movil-expo: dock, anular y enlace de factura"
                meta="app-movil-expo · checks ✓ · secrets-scan ✓"
                badge="CI verde"
                color="success"
              />
              <PrRow
                title="#20 ecf: quitar estado del resumen"
                meta="ecf-minimalista · CI: typecheck ✕"
                badge={t('pullRequests.ciRed')}
                color="error"
              />
              <PrRow
                title="#21 Caja: reintentos con backoff"
                meta="caja-reintentos · 2 comentarios de revisión"
                badge={t('pullRequests.changesRequested')}
                color="info"
              />
            </Box>

            <Divider sx={{ my: 2.5, borderStyle: 'dashed' }} />

            <Typography variant="h6" sx={{ mb: 0.5 }}>
              {t('summary.issuesTitle')}
            </Typography>
            <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
              {t('summary.issuesSubtitle')}
            </Typography>

            <Box sx={{ gap: 2, display: 'flex', flexDirection: 'column' }}>
              <PrRow
                title="#34 El ticket sale sin ITBIS en impresora de 58 mm"
                meta="bug · Contastack"
                badge={t('common.error')}
                color="error"
              />
              <PrRow
                title="#31 Modo oscuro en la tienda online"
                meta="enhancement · Contastack"
                badge={t('common.idea')}
                color="secondary"
              />
            </Box>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ p: 3, height: 1 }}>
            <Typography variant="h6">{t('pullRequests.configTitle')}</Typography>
            <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
              {t('pullRequests.configSubtitle')}
            </Typography>

            <Box
              component="pre"
              sx={{
                m: 0,
                p: 2,
                overflow: 'auto',
                borderRadius: 1.5,
                bgcolor: '#101010',
                color: 'grey.300',
                fontSize: 12.5,
                lineHeight: 1.7,
                fontFamily: 'monospace',
                border: (theme) =>
                  `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.16)}`,
              }}
            >
              {SAMPLE_TOML}
            </Box>
          </Card>
        </Grid>
      </Grid>
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

function PrRow({
  title,
  meta,
  badge,
  color,
}: {
  title: string;
  meta: string;
  badge: string;
  color: 'error' | 'info' | 'success' | 'warning' | 'secondary';
}) {
  return (
    <Box sx={{ gap: 1.5, display: 'flex', alignItems: 'center' }}>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography variant="subtitle2" noWrap>
          {title}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
          {meta}
        </Typography>
      </Box>
      <Label color={color}>{badge}</Label>
    </Box>
  );
}
