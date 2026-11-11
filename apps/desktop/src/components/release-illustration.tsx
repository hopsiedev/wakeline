import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const enter = {
  animation: 'story-in 360ms cubic-bezier(.2,.8,.2,1)',
  '@keyframes story-in': {
    from: { opacity: 0, transform: 'translateY(8px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
};
const material = {
  background: 'linear-gradient(145deg,#3a3e40 0%,#232728 42%,#161a1b 100%)',
  border: '1px solid rgba(255,255,255,.15)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12), 0 20px 35px rgba(0,0,0,.55)',
};

export function ReleaseIllustration({
  step,
  version,
}: {
  step: 'priorities' | 'snooze' | 'history';
  version: string;
}) {
  const { t } = useTranslation();
  return (
    <Box
      aria-hidden="true"
      sx={{
        height: { xs: 218, sm: 244 },
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '22px',
        background: 'radial-gradient(ellipse at 50% 110%,#1c4433 0%,#101917 35%,#080b0b 72%)',
        border: '1px solid rgba(255,255,255,.09)',
        boxShadow: 'inset 0 1px 12px rgba(0,0,0,.8)',
        perspective: '850px',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: 18,
          top: 16,
          fontSize: 10,
          color: '#b9c2bf',
          letterSpacing: 0.5,
        }}
      >
        Wakeline{' '}
        <Box component="span" sx={{ color: '#6e7b75', ml: 0.5 }}>
          {' '}
          / {version}
        </Box>
      </Box>
      <Box
        key={step}
        sx={{ ...enter, position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}
      >
        {step === 'priorities' && (
          <Box
            sx={{
              width: 226,
              height: 154,
              position: 'relative',
              transform: 'translate(-6px,24px) rotateX(12deg) rotateY(-16deg) rotateZ(-10deg)',
            }}
          >
            {[2, 1, 0].map((layer) => (
              <Box
                key={layer}
                sx={{
                  ...material,
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '17px',
                  transform: 'translate(' + layer * 9 + 'px,' + -layer * 13 + 'px)',
                  opacity: layer === 0 ? 1 : 0.6,
                  p: 2,
                  animation: 'card-fan 6s ease-in-out infinite',
                  animationDelay: (2 - layer) * 110 + 'ms',
                  '@keyframes card-fan': {
                    '0%, 100%': {
                      transform: 'translate(' + layer * 3 + 'px,' + -layer * 4 + 'px)',
                    },
                    '35%, 65%': {
                      transform: 'translate(' + layer * 9 + 'px,' + (-layer * 13 - 3) + 'px)',
                    },
                  },
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                }}
              >
                {layer === 0 && (
                  <>
                    <Typography sx={{ fontSize: 10, color: '#a5b1aa', mb: 1.5 }}>
                      {t('releaseUi.art.priority')}
                    </Typography>
                    {[
                      t('releaseUi.art.reconnect'),
                      t('releaseUi.art.import'),
                      t('releaseUi.art.review'),
                    ].map((text, i) => (
                      <Box
                        key={text}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          py: 0.75,
                          borderTop: '1px solid #ffffff0d',
                        }}
                      >
                        <Box
                          sx={{
                            width: 4,
                            height: 17,
                            bgcolor: i === 0 ? '#00bf86' : '#53615a',
                            borderRadius: 1,
                          }}
                        />
                        <Typography sx={{ fontSize: 10, color: i === 0 ? '#f4f6f5' : '#a2aaa5' }}>
                          {text}
                        </Typography>
                      </Box>
                    ))}
                  </>
                )}
              </Box>
            ))}
            <Box
              sx={{
                position: 'absolute',
                right: -35,
                bottom: -16,
                width: 68,
                height: 68,
                borderRadius: '20px',
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(135deg,#a5eac8,#20bc86 40%,#08794f)',
                border: '1px solid #b6f2d98c',
                boxShadow: 'inset 0 2px 2px #ffffff66,0 12px 22px #0008',
                transform: 'rotateZ(10deg)',
                animation: 'check-arrive 6s ease-in-out infinite',
                '@keyframes check-arrive': {
                  '0%, 100%': { transform: 'translateY(3px) rotateZ(8deg) scale(.96)' },
                  '35%, 65%': { transform: 'translateY(-3px) rotateZ(12deg) scale(1)' },
                },
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            >
              <Check size={35} strokeWidth={2.8} color="#063b29" />
            </Box>
          </Box>
        )}
        {step === 'snooze' && (
          <Box sx={{ position: 'relative', mt: 3, transform: 'rotateY(-16deg) rotateZ(-9deg)' }}>
            <Box
              sx={{
                ...material,
                width: 150,
                height: 150,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                border: '7px solid #3b4240',
                outline: '1px solid #ffffff20',
              }}
            >
              <Box
                sx={{
                  width: 125,
                  height: 125,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle at 40% 25%,#202b26,#0b1210)',
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: 'inset 0 3px 14px #000',
                }}
              >
                <Box
                  component="svg"
                  viewBox="0 0 100 100"
                  sx={{ width: 98, height: 98, color: '#8cddb5', overflow: 'visible' }}
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="44"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                  />
                  {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => (
                    <line
                      key={angle}
                      x1="50"
                      y1="9"
                      x2="50"
                      y2="13"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      transform={'rotate(' + angle + ' 50 50)'}
                    />
                  ))}
                  <Box
                    component="g"
                    sx={{
                      transformOrigin: '50px 50px',
                      animation: 'clock-hand 8s linear infinite',
                      '@keyframes clock-hand': {
                        from: { transform: 'rotate(0deg)' },
                        to: { transform: 'rotate(360deg)' },
                      },
                      '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                    }}
                  >
                    <line
                      x1="50"
                      y1="50"
                      x2="50"
                      y2="20"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </Box>
                  <Box
                    component="g"
                    sx={{
                      transformOrigin: '50px 50px',
                      animation: 'clock-hand 48s linear infinite',
                      '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                    }}
                  >
                    <line
                      x1="50"
                      y1="50"
                      x2="68"
                      y2="58"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </Box>
                  <circle cx="50" cy="50" r="3" fill="currentColor" />
                </Box>
              </Box>
            </Box>
            <Box
              sx={{
                ...material,
                position: 'absolute',
                bottom: -12,
                right: -47,
                px: 2,
                py: 1,
                borderRadius: '12px',
                transform: 'rotateZ(9deg)',
                color: '#c9edda',
                fontSize: 12,
              }}
            >
              {t('releaseUi.art.tomorrow')}
            </Box>
          </Box>
        )}
        {step === 'history' && (
          <Box
            sx={{
              ...material,
              width: 224,
              mt: 4,
              p: 2.5,
              borderRadius: '18px',
              transform: 'rotateX(10deg) rotateY(-18deg) rotateZ(-7deg)',
            }}
          >
            {[
              { title: t('releaseUi.art.detected'), time: '09:12' },
              { title: t('releaseUi.art.reviewing'), time: '09:26' },
              { title: t('releaseUi.art.resolved'), time: '10:04' },
            ].map((item, i) => (
              <Box
                key={item.title}
                sx={{
                  display: 'flex',
                  gap: 1.5,
                  alignItems: 'center',
                  py: 1,
                  animation: 'milestone-in 6s ease-in-out infinite',
                  animationDelay: i * 420 + 'ms',
                  '@keyframes milestone-in': {
                    '0%, 100%': { opacity: 0.15, transform: 'translateX(-8px)' },
                    '18%, 78%': { opacity: 1, transform: 'translateX(0)' },
                  },
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                }}
              >
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    background: i === 2 ? '#3bc692' : '#303c36',
                    color: i === 2 ? '#063b29' : '#91a79b',
                    fontSize: 10,
                  }}
                >
                  {i === 2 ? <Check size={14} /> : i + 1}
                </Box>
                <Typography sx={{ fontSize: 11, color: '#e1e9e4', flex: 1 }}>
                  {item.title}
                </Typography>
                <Typography sx={{ fontSize: 9, color: '#7d9586' }}>{item.time}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: '15%',
          right: '15%',
          height: 1,
          background: 'linear-gradient(90deg,transparent,#8ce2b944,transparent)',
        }}
      />
    </Box>
  );
}
