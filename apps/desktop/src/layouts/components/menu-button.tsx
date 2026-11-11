import type { IconButtonProps } from '@mui/material/IconButton';

import { useTranslation } from 'react-i18next';

import IconButton from '@mui/material/IconButton';

import { AppIcon } from 'src/components/nav-icon';

// ----------------------------------------------------------------------

export function MenuButton({ sx, ...other }: IconButtonProps) {
  const { t } = useTranslation();
  return (
    <IconButton aria-label={t('nav.expand')} sx={sx} {...other}>
      <AppIcon name="menu" size={24} />
    </IconButton>
  );
}
