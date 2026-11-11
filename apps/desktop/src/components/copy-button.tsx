import { useTranslation } from 'react-i18next';
import { useRef, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';

import { AppIcon } from 'src/components/nav-icon';

// Scale/fade feedback from the approved CopyButton, implemented with native CSS.
// No animation dependency; clipboard errors never become success notifications.
export function CopyButton({
  text,
  disabled,
  onCopied,
}: {
  text: string;
  disabled?: boolean;
  onCopied?: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef(false);
  const attempt = useRef({ value: 0 }).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      attempt.value++;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [attempt]);
  const copy = async () => {
    const current = ++attempt.value;
    setCopied(false);
    setError(false);
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      if (!active.current || current !== attempt.value) return;
      setCopied(true);
      onCopied?.();
      timer.current = setTimeout(() => setCopied(false), 2400);
    } catch {
      if (active.current && current === attempt.value) setError(true);
    }
  };
  return (
    <>
      <IconButton
        size="small"
        disabled={disabled}
        onClick={copy}
        aria-label={t(copied ? 'common.copied' : 'settings.copyConfig')}
        sx={{
          width: 36,
          height: 36,
          bgcolor: 'background.paper',
          color: copied ? '#22c55e' : 'text.secondary',
        }}
      >
        <Box
          key={String(copied)}
          component="span"
          sx={{
            display: 'flex',
            animation: 'copy-feedback 150ms ease-out',
            '@keyframes copy-feedback': {
              from: { opacity: 0, transform: 'scale(.5)' },
              to: { opacity: 1, transform: 'scale(1)' },
            },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          <AppIcon name={copied ? 'check' : 'copy'} size={16} />
        </Box>
      </IconButton>
      {error && (
        <Alert severity="error" onClose={() => setError(false)}>
          {t('errors.clipboard')}
        </Alert>
      )}
    </>
  );
}
