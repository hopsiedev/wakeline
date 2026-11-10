import type { LinkProps } from '@mui/material/Link';

import { useTranslation } from 'react-i18next';
import { mergeClasses } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { styled } from '@mui/material/styles';

import { RouterLink } from 'src/routes/components';

import { logoClasses } from './classes';

// ----------------------------------------------------------------------

export type LogoProps = LinkProps & {
  /** Solo el símbolo (true) o el símbolo con el nombre (false). */
  isSingle?: boolean;
  disabled?: boolean;
};

export function Logo({
  sx,
  disabled,
  className,
  href = '/',
  isSingle = true,
  ...other
}: LogoProps) {
  const { t } = useTranslation();
  return (
    <LogoRoot
      component={RouterLink}
      href={href}
      aria-label={t('common.appName')}
      underline="none"
      className={mergeClasses([logoClasses.root, className])}
      sx={[
        {
          gap: 1,
          display: 'inline-flex',
          alignItems: 'center',
          ...(disabled && { pointerEvents: 'none' }),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...other}
    >
      <Box
        component="img"
        src="/logo/wakeline-mark.svg"
        alt=""
        sx={{ width: 28, height: 'auto' }}
      />
      {!isSingle && (
        <Box
          component="span"
          sx={{ typography: 'subtitle1', fontWeight: 700, color: 'text.primary' }}
        >
          {t('common.appName')}
        </Box>
      )}
    </LogoRoot>
  );
}

// ----------------------------------------------------------------------

const LogoRoot = styled(Link)(() => ({
  flexShrink: 0,
  color: 'transparent',
}));
