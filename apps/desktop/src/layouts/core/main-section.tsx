import { varAlpha, mergeClasses } from 'minimal-shared/utils';

import { styled } from '@mui/material/styles';

import { layoutClasses } from './classes';

// ----------------------------------------------------------------------

export type MainSectionProps = React.ComponentProps<typeof MainRoot>;

export function MainSection({ children, className, sx, ...other }: MainSectionProps) {
  return (
    <MainRoot className={mergeClasses([layoutClasses.main, className])} sx={sx} {...other}>
      {children}
    </MainRoot>
  );
}

// ----------------------------------------------------------------------

const MainRoot = styled('main')(({ theme }) => ({
  display: 'flex',
  flex: '1 1 auto',
  minHeight: 0,
  flexDirection: 'column',
  overflowY: 'auto',
  overflowX: 'hidden',
  // Barra discreta solo en el área de contenido, como en design/mockup.html.
  '&::-webkit-scrollbar': {
    width: 10,
    height: 10,
  },
  '&::-webkit-scrollbar-track': {
    background: 'transparent',
  },
  '&::-webkit-scrollbar-thumb': {
    borderRadius: 10,
    border: '2px solid transparent',
    backgroundClip: 'padding-box',
    backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.28),
  },
  '&::-webkit-scrollbar-thumb:hover': {
    backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.45),
  },
}));
