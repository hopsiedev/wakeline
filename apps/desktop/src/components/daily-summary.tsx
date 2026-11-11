import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { useRef, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

import { getWorkflow, observeCards, priorityCards } from 'src/services/card-workflow';
import { type UiCard, type UiPullRequest, fetchDashboardData } from 'src/services/wakeline';
import {
  localDay,
  DAILY_SHOWN,
  snapshotCards,
  DAILY_SNAPSHOT,
  summarizeChanges,
  type DailyCounts,
  shouldShowSummary,
  dailySummaryEnabled,
  type SummarySnapshot,
} from 'src/services/daily-summary-state';

import { PullRequestDialog } from 'src/sections/pull-requests/pull-request-dialog';

export function DailySummary() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<DailyCounts | null>(null);
  const [attention, setAttention] = useState<UiCard[]>([]);
  const [pendingPrs, setPendingPrs] = useState<UiPullRequest[]>([]);
  const [selectedPr, setSelectedPr] = useState<UiPullRequest | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState(false);
  const busy = useRef(false);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    const check = async (manual = false) => {
      if (
        busy.current ||
        (!manual && !dailySummaryEnabled()) ||
        document.visibilityState === 'hidden'
      )
        return;
      busy.current = true;
      try {
        const data = await fetchDashboardData({ force: true });
        if (!alive.current || (!manual && !dailySummaryEnabled())) return;
        if (data.scan_error) {
          if (manual) {
            setFailure(true);
            setCounts({ errors: 0, tasks: 0, ideas: 0, completed: 0 });
          }
          return;
        }
        setFailure(false);
        observeCards(data.cards);
        const today = localDay();
        let previous: SummarySnapshot | null = null;
        try {
          previous = JSON.parse(localStorage.getItem(DAILY_SNAPSHOT) ?? 'null');
        } catch {
          /* Start a new baseline if old data is invalid. */
        }
        const changes = summarizeChanges(data.cards, previous, today);
        const priorities = priorityCards(data.cards, getWorkflow(), today);
        const prs = data.pull_requests.filter(
          (pr) => !pr.draft && (pr.review !== 'approved' || pr.ci === 'failing')
        );
        if (
          manual ||
          shouldShowSummary(
            changes,
            today,
            localStorage.getItem(DAILY_SHOWN),
            priorities.length + prs.length
          )
        ) {
          setCounts(changes);
          setAttention(priorities.map((item) => item.card));
          setReasons(
            Object.fromEntries(priorities.map((item) => [item.card.fingerprint, item.reason]))
          );
          setPendingPrs(prs);
          if (!manual) localStorage.setItem(DAILY_SHOWN, today);
          localStorage.setItem(DAILY_SNAPSHOT, JSON.stringify(snapshotCards(data.cards)));
        }
      } finally {
        busy.current = false;
      }
    };
    const onOpen = () => {
      void check();
    };
    const onManual = () => {
      void check(true);
    };
    const onPreference = () => {
      if (!dailySummaryEnabled()) setCounts(null);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onOpen();
    };
    window.addEventListener('wakeline:open-summary', onManual);
    window.addEventListener('wakeline:rescan', onOpen);
    window.addEventListener('focus', onOpen);
    window.addEventListener('wakeline:daily-summary-preference', onPreference);
    document.addEventListener('visibilitychange', onVisibility);
    const unlisten = '__TAURI_INTERNALS__' in window ? listen('wakeline://opened', onOpen) : null;
    onOpen();
    return () => {
      alive.current = false;
      window.removeEventListener('wakeline:open-summary', onManual);
      window.removeEventListener('wakeline:rescan', onOpen);
      window.removeEventListener('focus', onOpen);
      window.removeEventListener('wakeline:daily-summary-preference', onPreference);
      document.removeEventListener('visibilitychange', onVisibility);
      void unlisten?.then((stop) => stop());
    };
  }, []);
  return (
    <>
      <Dialog
        open={counts !== null}
        onClose={() => setCounts(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="daily-summary-title"
        slotProps={{ paper: { sx: { outline: 'none' } } }}
      >
        <DialogTitle id="daily-summary-title" sx={{ px: 3, pt: 3, pb: 2 }}>
          <Typography
            component="span"
            sx={{ display: 'block', color: 'text.secondary', fontSize: 13, mb: 1 }}
          >
            {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' }).format(new Date())}
          </Typography>
          <Typography component="span" sx={{ fontSize: 24, fontWeight: 700 }}>
            {t('dailySummary.title')}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {failure
              ? t('dailySummary.failed')
              : counts && Object.values(counts).some(Boolean)
                ? t('dailySummary.balance', {
                    count: counts.errors + counts.tasks + counts.ideas,
                    completed: counts.completed,
                  })
                : t('dailySummary.empty')}
          </Typography>
          {!failure && counts && Object.values(counts).some(Boolean) && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
                gap: 2,
                py: 2,
                borderTop: 1,
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              {counts &&
                (['errors', 'tasks', 'ideas', 'completed'] as const).map((key) => (
                  <Box key={key}>
                    <Typography
                      sx={{
                        fontSize: 28,
                        fontWeight: 700,
                        color: key === 'errors' ? 'error.main' : 'primary.main',
                      }}
                    >
                      {counts[key]}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t(`dailySummary.${key}`)}
                    </Typography>
                  </Box>
                ))}
            </Box>
          )}
          {attention.length > 0 && !failure && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('dailySummary.attention')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('dailySummary.priority')}
              </Typography>
              {attention.map((card) => (
                <ButtonBase
                  key={card.fingerprint}
                  onClick={() => {
                    setCounts(null);
                    navigate('/cards/' + encodeURIComponent(card.fingerprint));
                  }}
                  sx={{
                    display: 'flex',
                    textAlign: 'left',
                    justifyContent: 'flex-start',
                    width: '100%',
                    py: 2,
                    gap: 2,
                    borderBottom: 1,
                    borderColor: 'divider',
                    '&:hover': { bgcolor: 'action.hover' },
                    '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' },
                  }}
                >
                  <Box
                    sx={{
                      width: 4,
                      height: 32,
                      borderRadius: 1,
                      bgcolor: card.kind === 'error' ? 'error.main' : 'primary.main',
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                      {card.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {card.project} /{' '}
                      {t(`workflow.reason.${reasons[card.fingerprint]}`, {
                        count:
                          reasons[card.fingerprint] === 'aging'
                            ? Math.max(
                                0,
                                Math.floor((Date.now() - Date.parse(card.first_seen)) / 86400000)
                              )
                            : card.occurrences,
                      })}
                    </Typography>
                  </Box>
                </ButtonBase>
              ))}
            </Box>
          )}
          {!failure && pendingPrs.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2">
                {t('dailySummary.pendingPrs', { count: pendingPrs.length })}
              </Typography>
              {pendingPrs.map((pr) => (
                <ButtonBase
                  key={pr.url}
                  onClick={() => {
                    setCounts(null);
                    setSelectedPr(pr);
                  }}
                  sx={{
                    display: 'block',
                    textAlign: 'left',
                    width: '100%',
                    py: 2,
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2">
                    #{pr.number} {pr.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {pr.project} ? {pr.branch}
                  </Typography>
                </ButtonBase>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCounts(null)}>{t('account.close')}</Button>
          <Button
            onClick={() => {
              setCounts(null);
              navigate('/');
            }}
          >
            {t('dailySummary.open')}
          </Button>
        </DialogActions>
      </Dialog>
      {selectedPr && <PullRequestDialog pr={selectedPr} onClose={() => setSelectedPr(null)} />}
    </>
  );
}
