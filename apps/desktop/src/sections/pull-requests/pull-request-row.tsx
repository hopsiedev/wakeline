import type { UiPullRequest } from 'src/services/wakeline';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { Label } from 'src/components/label';

import { PullRequestDialog } from './pull-request-dialog';

// ----------------------------------------------------------------------

const CI_COLOR: Record<UiPullRequest['ci'], 'success' | 'error' | 'warning' | 'default'> = {
  passing: 'success',
  failing: 'error',
  pending: 'warning',
  none: 'default',
};

// Un PR abierto con su CI y su revisión; abre GitHub al pulsarlo.
export function PullRequestRow({ pr }: { pr: UiPullRequest }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen(true)}
        sx={(theme) => ({
          p: 1.25,
          gap: 0.5,
          border: 0,
          width: 1,
          display: 'flex',
          cursor: 'pointer',
          textAlign: 'left',
          borderRadius: 1.5,
          fontFamily: 'inherit',
          color: 'text.primary',
          flexDirection: 'column',
          bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
          '&:hover': { bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16) },
        })}
      >
        <Typography noWrap sx={{ width: 1, fontSize: 13, fontWeight: 600 }}>
          #{pr.number} {pr.title}
        </Typography>
        <Box sx={{ gap: 0.75, display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
          <Label color={CI_COLOR[pr.ci]}>{t(`pullRequests.ci.${pr.ci}`)}</Label>
          {pr.review !== 'none' && (
            <Label color={pr.review === 'approved' ? 'success' : 'warning'}>
              {t(`pullRequests.review.${pr.review}`)}
            </Label>
          )}
          {pr.draft && <Label color="default">{t('pullRequests.draft')}</Label>}
          <Typography sx={{ color: 'text.secondary', fontSize: 12, fontFamily: 'monospace' }}>
            {pr.branch} · {t('pullRequests.ageDays', { count: pr.age_days })}
          </Typography>
        </Box>
      </Box>
      {open && <PullRequestDialog pr={pr} onClose={() => setOpen(false)} />}
    </>
  );
}
