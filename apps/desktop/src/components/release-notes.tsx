import { useTranslation } from 'react-i18next';
import { useRef, useState, useEffect } from 'react';
import { X, Bug, Check, CirclePlus, ArrowRight, ChevronLeft, CircleArrowUp } from 'lucide-react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';

import { CONFIG } from 'src/config-global';
import {
  RELEASES,
  RELEASE_SHOWN,
  shouldShowRelease,
  type ReleaseFeature,
} from 'src/services/release-notes';

import { ReleaseIllustration } from './release-illustration';

function ChangeIcon({ kind }: { kind: ReleaseFeature['kind'] }) {
  const { t } = useTranslation();
  const Icon = { feature: CirclePlus, fix: Bug, update: CircleArrowUp }[kind];
  return (
    <Tooltip title={t('releaseUi.kind.' + kind)} arrow>
      <Box
        component="span"
        tabIndex={0}
        role="img"
        aria-label={t('releaseUi.kind.' + kind)}
        sx={{
          display: 'inline-flex',
          color: { feature: '#85cdaa', fix: '#d5b787', update: '#94b8cf' }[kind],
        }}
      >
        <Icon size={17} strokeWidth={1.7} />
      </Box>
    </Tooltip>
  );
}
const surface = {
  outline: 'none',
  border: '1px solid #ffffff24',
  bgcolor: '#242829',
  backgroundImage: 'linear-gradient(155deg,#34383a,#202324)',
  boxShadow: 'inset 0 1px 0 #ffffff20,0 30px 80px #000a',
};
export function ReleaseNotes() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('es') ? 'es' : 'en';
  const [open, setOpen] = useState(false),
    [all, setAll] = useState(false),
    [index, setIndex] = useState(0),
    [version, setVersion] = useState(CONFIG.appVersion);
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle'),
    [direction, setDirection] = useState(1);
  const pending = useRef<number | null>(null);
  const acknowledge = useRef(false);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const release = RELEASES.find((item) => item.version === version) ?? RELEASES[0];
  const feature = release.features[index] ?? release.features[0];
  const copy = feature[lang];
  useEffect(() => {
    const start = () => {
      if (shouldShowRelease(CONFIG.appVersion, localStorage.getItem(RELEASE_SHOWN))) {
        acknowledge.current = true;
        setOpen(true);
      }
    };
    const history = () => {
      setVersion(CONFIG.appVersion);
      setAll(true);
    };
    if ('__TAURI_INTERNALS__' in window) start();
    window.addEventListener('wakeline:release-history', history);
    return () => window.removeEventListener('wakeline:release-history', history);
  }, []);
  useEffect(() => {
    if (reduced) {
      if (pending.current !== null) setIndex(pending.current);
      pending.current = null;
      setPhase('idle');
    }
  }, [reduced]);
  const dismiss = () => {
    setOpen(false);
    setAll(false);
    pending.current = null;
    setPhase('idle');
    if (acknowledge.current) {
      localStorage.setItem(RELEASE_SHOWN, CONFIG.appVersion);
      acknowledge.current = false;
      window.dispatchEvent(new CustomEvent('wakeline:release-dismissed'));
    }
  };
  const change = (next: number) => {
    if (phase !== 'idle' || next === index) return;
    if (reduced) {
      setIndex(next);
      return;
    }
    setDirection(next > index ? 1 : -1);
    pending.current = next;
    setPhase('out');
  };
  const showAll = () => {
    setOpen(false);
    setAll(true);
  };
  return (
    <>
      <Dialog
        open={open}
        onClose={dismiss}
        maxWidth={false}
        fullWidth
        aria-labelledby="release-title"
        data-release-dialog
        transitionDuration={reduced ? 0 : 260}
        slotProps={{
          backdrop: { sx: { backdropFilter: 'blur(6px)', bgcolor: '#000b' } },
          paper: {
            sx: {
              ...surface,
              width: 426,
              maxWidth: 'calc(100% - 32px)',
              m: 2,
              p: { xs: 1.5, sm: 2 },
              borderRadius: '30px',
              overflowX: 'hidden',
            },
          },
        }}
      >
        <Box
          key={feature.id}
          data-release-story={index}
          data-transition-phase={phase}
          onAnimationEnd={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.animationName === 'release-out' && pending.current !== null) {
              setIndex(pending.current);
              pending.current = null;
              setPhase('in');
            } else if (event.animationName === 'release-in') setPhase('idle');
          }}
          sx={{
            transition: 'none',
            animation:
              reduced || phase === 'idle'
                ? 'none'
                : phase === 'out'
                  ? 'release-out 180ms ease-in both'
                  : 'release-in 360ms cubic-bezier(.2,.8,.2,1) both',
            '@keyframes release-out': {
              from: { opacity: 1, transform: 'translateX(0)' },
              to: { opacity: 0, transform: 'translateX(' + -direction * 18 + 'px)' },
            },
            '@keyframes release-in': {
              from: { opacity: 0, transform: 'translateX(' + direction * 18 + 'px)' },
              to: { opacity: 1, transform: 'translateX(0)' },
            },
          }}
        >
          <ReleaseIllustration step={feature.scene} version={release.version} />
          <IconButton
            aria-label={t('releaseUi.close')}
            onClick={dismiss}
            sx={{
              position: 'absolute',
              right: 24,
              top: 24,
              color: '#bfc9c3',
              bgcolor: '#12181699',
              '&:hover': { bgcolor: '#242e29' },
            }}
            size="small"
          >
            <X size={15} />
          </IconButton>
          <Box sx={{ textAlign: 'center', px: 1.5, pt: 3, pb: 1 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                mb: 1.25,
              }}
            >
              <ChangeIcon kind={feature.kind} />
              <Typography sx={{ fontSize: 11, color: '#99b1a4' }}>
                {t('releaseUi.news')} / v{release.version}
              </Typography>
            </Box>
            <Typography
              id="release-title"
              component="h2"
              sx={{
                fontSize: { xs: 25, sm: 28 },
                fontWeight: 750,
                lineHeight: 1.2,
                color: '#f7f8f7',
                mb: 1.5,
              }}
            >
              {copy.title}
            </Typography>
            <Typography
              sx={{
                fontSize: 14,
                lineHeight: 1.8,
                color: '#c2c8c5',
                maxWidth: 330,
                mx: 'auto',
                minHeight: 76,
              }}
            >
              {copy.text}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', my: 1.75 }}>
          {release.features.map((item, i) => (
            <Box
              component="button"
              key={item.id}
              disabled={phase !== 'idle'}
              aria-label={item[lang].label}
              aria-current={i === index ? 'step' : undefined}
              onClick={() => change(i)}
              sx={{
                width: 24,
                height: 24,
                p: 0,
                border: 0,
                bgcolor: 'transparent',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                '&:focus-visible': { outline: '2px solid #92dbb6', borderRadius: 1 },
              }}
            >
              <Box
                sx={{
                  width: i === index ? 18 : 5,
                  height: 5,
                  borderRadius: 4,
                  bgcolor: i === index ? '#7ed3a9' : '#626d67',
                }}
              />
            </Box>
          ))}
        </Box>
        <Button
          variant="contained"
          fullWidth
          disabled={phase !== 'idle'}
          endIcon={
            index === release.features.length - 1 ? <Check size={19} /> : <ArrowRight size={19} />
          }
          onClick={() => (index < release.features.length - 1 ? change(index + 1) : dismiss())}
          sx={{
            minHeight: 56,
            borderRadius: '16px',
            fontSize: 15,
            fontWeight: 700,
            color: '#062e20',
            background: 'linear-gradient(180deg,#65d8a3,#32c98d)',
            '&:hover': { background: 'linear-gradient(180deg,#78e3b4,#43d79d)' },
          }}
        >
          {t(index === release.features.length - 1 ? 'releaseUi.start' : 'releaseUi.next')}
        </Button>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1,
            pt: 1.5,
            pb: 0.25,
          }}
        >
          <Button
            size="small"
            color="inherit"
            disabled={phase !== 'idle'}
            startIcon={index > 0 ? <ChevronLeft size={13} /> : undefined}
            onClick={() => (index > 0 ? change(index - 1) : showAll())}
            sx={{ fontSize: 11, color: '#a6b4ac' }}
          >
            {t(index > 0 ? 'releaseUi.previous' : 'releaseUi.all')}
          </Button>
          <Typography sx={{ fontSize: 10, color: '#77877d' }}>
            {t('releaseUi.counter', { current: index + 1, total: release.features.length })}
          </Typography>
          <Button size="small" onClick={dismiss} sx={{ fontSize: 11, color: '#a6b4ac' }}>
            {t('releaseUi.skip')}
          </Button>
        </Box>
      </Dialog>
      <Dialog
        open={all}
        onClose={dismiss}
        fullWidth
        maxWidth="md"
        aria-labelledby="all-changes-title"
        data-release-dialog
        slotProps={{
          backdrop: { sx: { backdropFilter: 'blur(6px)', bgcolor: '#000b' } },
          paper: { sx: { ...surface, borderRadius: '28px', maxHeight: 'calc(100% - 40px)', m: 2 } },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            p: 3,
            gap: 2,
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 11, color: '#9eafa4', mb: 1 }}>
              Wakeline / v{release.version}
            </Typography>
            <Typography
              id="all-changes-title"
              component="h2"
              sx={{ fontSize: 26, fontWeight: 700, color: '#f4f6f5' }}
            >
              {t('releaseUi.allTitle')}
            </Typography>
            <Typography sx={{ fontSize: 13, color: '#adb9b1', mt: 1 }}>
              {t('releaseUi.allSubtitle')}
            </Typography>
            {RELEASES.length > 1 && (
              <Select
                size="small"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                inputProps={{ 'aria-label': t('releaseUi.history') }}
                sx={{ mt: 2 }}
              >
                {RELEASES.map((item) => (
                  <MenuItem key={item.version} value={item.version}>
                    {item.version}
                  </MenuItem>
                ))}
              </Select>
            )}
          </Box>
          <IconButton aria-label={t('releaseUi.close')} onClick={dismiss} sx={{ color: '#bac8be' }}>
            <X size={18} />
          </IconButton>
        </Box>
        <Box sx={{ overflowY: 'auto', px: 3, pb: 3 }}>
          {release.features.map((item) => (
            <Box
              component="section"
              data-unified-change={item.id}
              key={item.id}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '280px minmax(0,1fr)' },
                gap: 3,
                alignItems: 'center',
                py: 3,
                borderTop: '1px solid #ffffff14',
              }}
            >
              <ReleaseIllustration step={item.scene} version={release.version} />
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <ChangeIcon kind={item.kind} />
                  <Typography sx={{ fontSize: 11, color: '#a5bbae' }}>
                    {item[lang].label}
                  </Typography>
                </Box>
                <Typography
                  component="h3"
                  sx={{ fontSize: 23, fontWeight: 700, color: '#f0f5f1', mb: 1.5 }}
                >
                  {item[lang].title}
                </Typography>
                <Typography sx={{ fontSize: 14, color: '#b7c2ba', lineHeight: 1.8 }}>
                  {item[lang].text}
                </Typography>
              </Box>
            </Box>
          ))}
          <Box sx={{ borderTop: '1px solid #ffffff14', pt: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <ChangeIcon kind="fix" />
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#e3eae5' }}>
                {t('releaseUi.fixes')}
              </Typography>
            </Box>
            {release.fixes[lang].map((fix) => (
              <Typography key={fix} sx={{ fontSize: 13, lineHeight: 1.8, color: '#aeb9b2', mb: 1 }}>
                {fix}
              </Typography>
            ))}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 3, pb: 3, pt: 1 }}>
          <Button
            onClick={() => {
              setIndex(0);
              setPhase('idle');
              setAll(false);
              setOpen(true);
            }}
          >
            {t('releaseUi.presentation')}
          </Button>
          <Button variant="contained" onClick={dismiss}>
            {t('releaseUi.done')}
          </Button>
        </Box>
      </Dialog>
    </>
  );
}
