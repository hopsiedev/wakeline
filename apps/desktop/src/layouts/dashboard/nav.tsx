import type { Theme, SxProps, Breakpoint } from '@mui/material/styles';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import ListItemButton from '@mui/material/ListItemButton';
import Drawer, { drawerClasses } from '@mui/material/Drawer';

import { usePathname } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { Logo } from 'src/components/logo';
import { Scrollbar } from 'src/components/scrollbar';

import type { NavItem } from '../nav-config-dashboard';

// ----------------------------------------------------------------------

export type NavContentProps = {
  data: NavItem[];
  slots?: {
    topArea?: React.ReactNode;
    bottomArea?: React.ReactNode;
  };
  sx?: SxProps<Theme>;
};

export function NavDesktop({
  sx,
  data,
  slots,
  layoutQuery,
}: NavContentProps & { layoutQuery: Breakpoint }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        pt: 2,
        px: 1.25,
        top: 0,
        left: 0,
        height: 1,
        display: 'none',
        position: 'fixed',
        flexDirection: 'column',
        zIndex: 'var(--layout-nav-zIndex)',
        width: 'var(--layout-nav-vertical-width)',
        borderRight: `1px solid ${varAlpha(theme.vars.palette.common.whiteChannel, 0.06)}`,
        [theme.breakpoints.up(layoutQuery)]: {
          display: 'flex',
        },
        ...sx,
      }}
    >
      <NavContent data={data} slots={slots} />
    </Box>
  );
}

// ----------------------------------------------------------------------

export function NavMobile({
  sx,
  data,
  open,
  slots,
  onClose,
}: NavContentProps & { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  useEffect(() => {
    if (open) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      sx={{
        [`& .${drawerClasses.paper}`]: {
          pt: 2,
          px: 1.25,
          overflow: 'unset',
          width: 'var(--layout-nav-mobile-width)',
          ...sx,
        },
      }}
    >
      <NavContent data={data} slots={slots} />
    </Drawer>
  );
}

// ----------------------------------------------------------------------

export function NavContent({ data, slots, sx }: NavContentProps) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <>
      <Logo isSingle={false} sx={{ px: 1, mb: 2 }} />

      {slots?.topArea}

      <Scrollbar fillContent>
        <Box
          component="nav"
          sx={[
            {
              display: 'flex',
              flex: '1 1 auto',
              flexDirection: 'column',
            },
            ...(Array.isArray(sx) ? sx : [sx]),
          ]}
        >
          <Box component="ul" sx={{ gap: 0.25, display: 'flex', flexDirection: 'column' }}>
            {data.map((item) => {
              const isActive = item.path === pathname;

              return (
                <ListItem disableGutters disablePadding key={item.path}>
                  <ListItemButton
                    disableGutters
                    component={RouterLink}
                    href={item.path}
                    sx={[
                      (theme) => ({
                        pl: 1.25,
                        pr: 1.25,
                        gap: 1.5,
                        minHeight: 36,
                        borderRadius: 1,
                        typography: 'body2',
                        fontWeight: 'fontWeightMedium',
                        color: theme.vars.palette.text.primary,
                        '& svg': { color: theme.vars.palette.text.secondary },
                        ...(isActive && {
                          bgcolor: varAlpha(theme.vars.palette.common.whiteChannel, 0.08),
                          '& svg': { color: theme.vars.palette.text.primary },
                          '&:hover': {
                            bgcolor: varAlpha(theme.vars.palette.common.whiteChannel, 0.12),
                          },
                        }),
                      }),
                    ]}
                  >
                    <Box component="span" sx={{ width: 20, height: 20, display: 'flex' }}>
                      {item.icon}
                    </Box>

                    <Box component="span" sx={{ flexGrow: 1 }}>
                      {t(item.titleKey)}
                    </Box>

                    {item.info && item.info}
                  </ListItemButton>
                </ListItem>
              );
            })}
          </Box>

          <Typography
            variant="caption"
            sx={{
              px: 1.25,
              pt: 2.5,
              pb: 0.75,
              fontWeight: 600,
              color: 'text.disabled',
            }}
          >
            {t('nav.projects')}
          </Typography>

          <Box sx={{ gap: 0.5, display: 'flex', flexDirection: 'column' }}>
            {[
              { name: 'contastack', branch: 'main', color: 'error.main' },
              { name: 'app-expo', branch: 'app-movil-expo', color: 'info.main' },
              { name: 'wakeline', branch: 'main', color: 'primary.main' },
            ].map((p) => (
              <ListItemButton
                key={p.name}
                disableGutters
                component={RouterLink}
                href="/pull-requests"
                sx={{
                  px: 1.25,
                  minHeight: 32,
                  borderRadius: 1,
                  gap: 1.25,
                  typography: 'body2',
                  color: 'text.secondary',
                }}
              >
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: p.color,
                  }}
                />
                <Box component="span" sx={{ flexGrow: 1, fontWeight: 500, color: 'text.primary' }}>
                  {p.name}
                </Box>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: 11 }}
                >
                  {p.branch}
                </Typography>
              </ListItemButton>
            ))}
          </Box>

          <Box
            sx={(theme) => ({
              mt: 'auto',
              pt: 1.5,
              pb: 1.5,
              px: 1.25,
              borderTop: `1px solid ${varAlpha(theme.vars.palette.common.whiteChannel, 0.06)}`,
            })}
          >
            <Box sx={{ gap: 1, display: 'flex', alignItems: 'center', mb: 0.25 }}>
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  bgcolor: 'success.main',
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                {t('nav.watching')}
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled' }}>
              {t('nav.lastSignal')}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled' }}>
              {t('nav.metrics')}
            </Typography>
          </Box>
        </Box>
      </Scrollbar>

      {slots?.bottomArea}
    </>
  );
}
