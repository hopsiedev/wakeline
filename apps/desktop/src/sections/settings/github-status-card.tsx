import type { UiGithubStatus, UiProjectSummary } from 'src/services/wakeline';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';

import { getGithubStatus, fetchDashboardData } from 'src/services/wakeline';

import { Label } from 'src/components/label';

// ----------------------------------------------------------------------

// Estado de `gh` por proyecto. Wakeline nunca inicia sesión por ti: solo dice qué
// comando ejecutar (Q65).
export function GithubStatusCard() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<UiProjectSummary[]>([]);

  useEffect(() => {
    fetchDashboardData().then((data) => setProjects(data.projects));
  }, []);

  return (
    <Card sx={{ p: 3 }}>
      <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>{t('github.title')}</Typography>
      {projects.map((project, idx) => (
        <ProjectGithub key={project.path} project={project} isLast={idx === projects.length - 1} />
      ))}
    </Card>
  );
}

export function ProjectGithub({ project, isLast }: { project: UiProjectSummary; isLast: boolean }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<UiGithubStatus | null>(null);

  useEffect(() => {
    getGithubStatus(project.path)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [project.path]);

  let label = t('github.checking');
  let color: 'success' | 'warning' | 'default' = 'default';
  let hint: string | null = null;
  if (status && !status.repo) {
    label = t('github.noRemote');
  } else if (status?.gh.state === 'connected') {
    label = t('github.connectedAs', { login: status.gh.login });
    color = 'success';
  } else if (status?.gh.state === 'not_logged_in') {
    label = t('github.notLoggedIn');
    color = 'warning';
    hint = t('github.loginHint');
  } else if (status?.gh.state === 'not_installed') {
    label = t('github.notInstalled');
    color = 'warning';
    hint = t('github.installHint');
  }

  return (
    <Box
      sx={(theme) => ({
        py: 1.5,
        borderBottom: isLast
          ? 0
          : `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.2)}`,
      })}
    >
      <Box sx={{ gap: 1, display: 'flex', alignItems: 'center' }}>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{project.name}</Typography>
          {status?.repo && (
            <Typography sx={{ color: 'text.secondary', fontSize: 12, fontFamily: 'monospace' }}>
              {status.repo}
            </Typography>
          )}
        </Box>
        <Label color={color}>{label}</Label>
      </Box>
      {hint && (
        <Typography
          sx={{ mt: 0.5, color: 'text.secondary', fontSize: 12, fontFamily: 'monospace' }}
        >
          {hint}
        </Typography>
      )}
      {status?.last_error && status.gh.state === 'connected' && (
        <Typography sx={{ mt: 0.5, color: 'error.main', fontSize: 12 }}>
          {t('github.lastError', { error: status.last_error })}
        </Typography>
      )}
    </Box>
  );
}
