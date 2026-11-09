import type { RunStatus, UiProjectSummary, UiProjectCommands } from 'src/services/wakeline';

import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';
import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import {
  runProjectCommand,
  getProjectCommands,
  fetchDashboardData,
  approveProjectCommands,
} from 'src/services/wakeline';

import { Label } from 'src/components/label';

// ----------------------------------------------------------------------

const STATUS_COLOR: Record<RunStatus, 'success' | 'error' | 'warning' | 'default'> = {
  passed: 'success',
  failed: 'error',
  timed_out: 'warning',
  not_started: 'default',
};

// Comandos de wakeline.toml por proyecto: se muestran con su argv completo y no se
// ejecuta nada hasta pulsar «Aprobar» (Q63).
export function ProjectCommandsCard() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<UiProjectSummary[]>([]);

  useEffect(() => {
    const load = () => fetchDashboardData().then((data) => setProjects(data.projects));
    load();
    window.addEventListener('wakeline:rescan', load);
    return () => window.removeEventListener('wakeline:rescan', load);
  }, []);

  return (
    <Card sx={{ p: 3 }}>
      <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{t('commands.title')}</Typography>
      <Typography sx={{ mt: 0.25, mb: 1.5, color: 'text.secondary', fontSize: 14 }}>
        {t('commands.subtitle')}
      </Typography>

      {projects.length === 0 && (
        <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>
          {t('commands.noProjects')}
        </Typography>
      )}

      {projects.map((project, idx) => (
        <ProjectCommands
          key={project.path}
          project={project}
          isLast={idx === projects.length - 1}
        />
      ))}
    </Card>
  );
}

function ProjectCommands({ project, isLast }: { project: UiProjectSummary; isLast: boolean }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<UiProjectCommands | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    getProjectCommands(project.path)
      .then(setInfo)
      .catch((reason: unknown) => setError(String(reason)));
  }, [project.path]);

  useEffect(() => {
    reload();
    window.addEventListener('wakeline:rescan', reload);
    return () => window.removeEventListener('wakeline:rescan', reload);
  }, [reload]);

  const approve = async () => {
    if (!info?.hash) return;
    try {
      await approveProjectCommands(project.path, info.hash);
      setError(null);
    } catch (reason) {
      setError(String(reason));
    }
    reload();
  };

  const run = async (name: string) => {
    setRunning(name);
    try {
      await runProjectCommand(project.path, name);
      setError(null);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setRunning(null);
      reload();
    }
  };

  const approved = info?.trust === 'approved';

  return (
    <Box
      sx={(theme) => ({
        py: 1.75,
        borderBottom: isLast
          ? 0
          : `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.2)}`,
      })}
    >
      <Box sx={{ gap: 1, display: 'flex', alignItems: 'center' }}>
        <Typography sx={{ flexGrow: 1, fontWeight: 600, fontSize: 14 }}>{project.name}</Typography>
        {info?.trust === 'approved' && <Label color="success">{t('commands.approved')}</Label>}
        {info?.trust === 'changed' && <Label color="warning">{t('commands.changed')}</Label>}
        {info?.trust && info.trust !== 'approved' && (
          <Button size="small" variant="contained" onClick={approve}>
            {t('commands.approve')}
          </Button>
        )}
      </Box>

      {info && !info.has_config && (
        <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>
          {t('commands.noConfig')}
        </Typography>
      )}

      {(info?.error || error) && (
        <Alert severity="error" sx={{ mt: 1, fontSize: 13 }}>
          {info?.error ?? error}
        </Alert>
      )}

      {info?.commands.map((command) => (
        <Box key={command.name} sx={{ mt: 1, gap: 1, display: 'flex', alignItems: 'center' }}>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Box sx={{ gap: 0.75, display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{command.name}</Typography>
              <Label color="default">
                {command.on === 'idle' ? t('commands.onIdle') : t('commands.onManual')}
              </Label>
              {command.last_status && (
                <Label color={STATUS_COLOR[command.last_status]}>
                  {t(`commands.status.${command.last_status}`)}
                </Label>
              )}
            </Box>
            <Typography
              noWrap
              title={command.run.join(' ')}
              sx={{ color: 'text.secondary', fontSize: 12, fontFamily: 'monospace' }}
            >
              {command.cwd ? `${command.cwd} › ` : ''}
              {command.run.join(' ')}
            </Typography>
          </Box>
          {approved && (
            <Button
              size="small"
              color="inherit"
              variant="outlined"
              disabled={running !== null}
              onClick={() => run(command.name)}
            >
              {running === command.name ? t('commands.running') : t('commands.run')}
            </Button>
          )}
        </Box>
      ))}
    </Box>
  );
}
