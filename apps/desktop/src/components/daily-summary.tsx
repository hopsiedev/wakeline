import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { useRef, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

import { fetchDashboardData } from 'src/services/wakeline';
import {
  localDay,
  DAILY_SHOWN,
  snapshotCards,
  DAILY_SNAPSHOT,
  summarizeChanges,
  type DailyCounts,
  dailySummaryEnabled,
  type SummarySnapshot,
} from 'src/services/daily-summary-state';

export function DailySummary() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<DailyCounts | null>(null);
  const busy = useRef(false);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    const check = async () => {
      if (busy.current || !dailySummaryEnabled() || document.visibilityState === 'hidden') return;
      busy.current = true;
      try {
        const data = await fetchDashboardData({ force: true });
        if (!alive.current || data.scan_error || !data.projects.length || !dailySummaryEnabled())
          return;
        const today = localDay();
        let previous: SummarySnapshot | null = null;
        try {
          previous = JSON.parse(localStorage.getItem(DAILY_SNAPSHOT) ?? 'null');
        } catch {
          /* Start a new baseline if old data is invalid. */
        }
        if (localStorage.getItem(DAILY_SHOWN) !== today) {
          setCounts(summarizeChanges(data.cards, previous, today));
          localStorage.setItem(DAILY_SHOWN, today);
        }
        localStorage.setItem(DAILY_SNAPSHOT, JSON.stringify(snapshotCards(data.cards)));
      } finally {
        busy.current = false;
      }
    };
    const onOpen = () => {
      void check();
    };
    const onPreference = () => {
      if (!dailySummaryEnabled()) setCounts(null);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onOpen();
    };
    window.addEventListener('focus', onOpen);
    window.addEventListener('wakeline:daily-summary-preference', onPreference);
    document.addEventListener('visibilitychange', onVisibility);
    const unlisten = '__TAURI_INTERNALS__' in window ? listen('wakeline://opened', onOpen) : null;
    onOpen();
    return () => {
      alive.current = false;
      window.removeEventListener('focus', onOpen);
      window.removeEventListener('wakeline:daily-summary-preference', onPreference);
      document.removeEventListener('visibilitychange', onVisibility);
      void unlisten?.then((stop) => stop());
    };
  }, []);
  return (
    <Dialog
      open={counts !== null}
      onClose={() => setCounts(null)}
      fullWidth
      maxWidth="sm"
      aria-labelledby="daily-summary-title"
    >
      <DialogTitle id="daily-summary-title">{t('dailySummary.title')}</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {t('dailySummary.subtitle')}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
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
                <Typography>{t(`dailySummary.${key}`)}</Typography>
              </Box>
            ))}
        </Box>
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
  );
}
