import type { IconButtonProps } from '@mui/material/IconButton';

import IconButton from '@mui/material/IconButton';

import { AppIcon } from 'src/components/nav-icon';

// ----------------------------------------------------------------------

export function MenuButton({ sx, ...other }: IconButtonProps) {
  return (
    <IconButton sx={sx} {...other}>
      <AppIcon name="menu" size={24} />
    </IconButton>
  );
}
