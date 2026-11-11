import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

type Health = { watching: string[]; errors: string[]; last_scan: number | null };
export function WatchStatus() {
  const { t, i18n } = useTranslation();
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return undefined;
    let active = true;
    const refresh = () => {
      void invoke<Health>('get_watch_status')
        .then((value) => {
          if (active) {
            setHealth(value);
            setError(null);
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    };
    refresh();
    const timer = setInterval(refresh, 10000);
    window.addEventListener('focus', refresh);
    window.addEventListener('wakeline:rescan', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('wakeline:rescan', refresh);
    };
  }, []);
  if (!health && !error) return null;
  const lastScan = health?.last_scan ? new Date(health.last_scan * 1000) : null;
  if (!error && !health?.errors.length) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          mb: 2,
          color: 'text.secondary',
          fontSize: 12,
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: health?.watching.length ? 'success.main' : 'text.disabled',
            flexShrink: 0,
          }}
        />
        <Typography variant="caption">
          {t('watch.active', { count: health?.watching.length ?? 0 })}
        </Typography>
        <Box component="span" aria-hidden="true">
          ·
        </Box>
        <Tooltip title={lastScan ? lastScan.toLocaleString(i18n.language) : ''}>
          <Typography component="span" variant="caption">
            {lastScan
              ? t('watch.lastScan', {
                  time: lastScan.toLocaleTimeString(i18n.language, {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })
              : t('watch.noScan')}
          </Typography>
        </Tooltip>
      </Box>
    );
  }
  return (
    <Alert
      severity={
        error || health?.errors.length ? 'warning' : health?.watching.length ? 'success' : 'info'
      }
      sx={{ mb: 3 }}
    >
      <Typography variant="subtitle2">
        {error
          ? t('watch.unavailable')
          : t('watch.active', { count: health?.watching.length ?? 0 })}
      </Typography>
      <Typography variant="body2">
        {health?.last_scan
          ? t('watch.lastScan', {
              time: new Date(health.last_scan * 1000).toLocaleString(i18n.language),
            })
          : t('watch.noScan')}
      </Typography>
      {error && <Typography variant="body2">{error}</Typography>}
      {health?.errors.map((message) => (
        <Typography key={message} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
          {t('watch.failed')}: {message}
        </Typography>
      ))}
    </Alert>
  );
}
