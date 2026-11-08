import type { Theme, SxProps, Breakpoint } from '@mui/material/styles';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ListItemButton from '@mui/material/ListItemButton';
import Drawer, { drawerClasses } from '@mui/material/Drawer';

import { usePathname } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { Logo } from 'src/components/logo';
import { NavIcon } from 'src/components/nav-icon';

import type { NavItem } from '../nav-config-dashboard';

// ----------------------------------------------------------------------

export type NavContentProps = {
  data: NavItem[];
  onOpenToast?: () => void;
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
  onOpenToast,
}: NavContentProps & { layoutQuery: Breakpoint }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        pt: 1.25,
        pb: 1.5,
        px: 1.25,
        top: 0,
        left: 0,
        height: 1,
        display: 'none',
        position: 'fixed',
        overflow: 'hidden',
        flexDirection: 'column',
        zIndex: 'var(--layout-nav-zIndex)',
        width: 'var(--layout-nav-vertical-width)',
        borderRight: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.14)}`,
        [theme.breakpoints.up(layoutQuery)]: {
          display: 'flex',
        },
        ...sx,
      }}
    >
      <NavContent data={data} slots={slots} onOpenToast={onOpenToast} />
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
  onOpenToast,
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
          pt: 1.25,
          pb: 1.5,
          px: 1.25,
          overflow: 'hidden',
          width: 'var(--layout-nav-mobile-width)',
          ...sx,
        },
      }}
    >
      <NavContent data={data} slots={slots} onOpenToast={onOpenToast} />
    </Drawer>
  );
}

// ----------------------------------------------------------------------

export function NavContent({ data, slots, sx, onOpenToast }: NavContentProps) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <Box
      sx={[
        {
          height: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        sx={{
          pt: 0.75,
          pb: 1.75,
          px: 1,
          gap: 0.75,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Logo isSingle={false} />
        <Box component="span" sx={{ color: 'text.disabled', display: 'inline-flex', ml: -0.25 }}>
          <NavIcon name="chev" size={14} />
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <IconButton
          size="small"
          aria-label={t('nav.notifications')}
          onClick={onOpenToast}
          sx={{
            width: 30,
            height: 30,
            borderRadius: 1,
            color: 'text.secondary',
            position: 'relative',
          }}
        >
          <NavIcon name="bell" size={18} />
          <Box
            component="span"
            sx={(theme) => ({
              top: 5,
              right: 6,
              width: 7,
              height: 7,
              borderRadius: '50%',
              position: 'absolute',
              bgcolor: '#8E7CFF',
              boxShadow: `0 0 0 2px ${theme.vars.palette.background.default}`,
            })}
          />
        </IconButton>

        <IconButton
          size="small"
          component={RouterLink}
          href="/cards"
          aria-label={t('nav.search')}
          sx={{
            width: 30,
            height: 30,
            borderRadius: 1,
            color: 'text.secondary',
          }}
        >
          <NavIcon name="search" size={18} />
        </IconButton>
      </Box>

      {slots?.topArea}

      <Box
        component="nav"
        sx={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          display: 'flex',
          flexDirection: 'column',
        }}
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
                      px: 1.25,
                      gap: 1.5,
                      minHeight: 36,
                      borderRadius: 1,
                      fontSize: 14.5,
                      fontWeight: 500,
                      color: theme.vars.palette.text.primary,
                      '& svg': { color: theme.vars.palette.text.secondary },
                      ...(isActive && {
                        bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.14),
                        fontWeight: 600,
                        '& svg': { color: theme.vars.palette.text.primary },
                        '&:hover': {
                          bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.18),
                        },
                      }),
                    }),
                  ]}
                >
                  <Box component="span" sx={{ width: 19, height: 19, display: 'flex' }}>
                    {item.icon}
                  </Box>

                  <Box component="span" sx={{ flexGrow: 1 }}>
                    {t(item.titleKey)}
                  </Box>

                  {item.path === '/cards' && (
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 600, color: 'error.main', fontSize: 12 }}
                    >
                      {t('nav.newBadge')}
                    </Typography>
                  )}

                  {item.path === '/pull-requests' && (
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 600, color: 'text.secondary', fontSize: 12 }}
                    >
                      3
                    </Typography>
                  )}

                  {item.info && item.info}
                </ListItemButton>
              </ListItem>
            );
          })}
        </Box>

        <Box
          sx={{
            pt: 2.25,
            pb: 0.75,
            pl: 1.25,
            pr: 0.5,
            gap: 0.5,
            display: 'flex',
            alignItems: 'center',
            color: 'text.disabled',
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 500, fontSize: 13 }}>
            {t('nav.projects')}
          </Typography>
          <NavIcon name="chev" size={13} />
          <Box sx={{ flexGrow: 1 }} />
          <IconButton
            size="small"
            aria-label={t('nav.sort')}
            sx={{ width: 26, height: 26, borderRadius: 1, color: 'text.disabled' }}
          >
            <NavIcon name="filter" size={16} />
          </IconButton>
          <IconButton
            size="small"
            component={RouterLink}
            href="/pull-requests"
            aria-label={t('nav.watchFolder')}
            sx={{ width: 26, height: 26, borderRadius: 1, color: 'text.disabled' }}
          >
            <NavIcon name="folderPlus" size={16} />
          </IconButton>
        </Box>

        <Box sx={{ gap: 0.25, display: 'flex', flexDirection: 'column' }}>
          <TreeFolder name="contastack" />
          <TreeBranch
            icon="bug"
            iconColor="error.main"
            name="ecf-minimalista"
            count={3}
            href="/cards?detail=V-142"
          />
          <TreeBranch
            icon="branch"
            iconColor="info.main"
            name="caja-reintentos"
            count={2}
            href="/cards"
          />
          <TreeBranch icon="branch" iconColor="text.disabled" name="clientes-merge" href="/cards" />

          <TreeFolder name="app-expo" />
          <TreeBranch
            icon="branch"
            iconColor="warning.main"
            name="pantalla-cobros"
            dot
            href="/cards"
          />

          <TreeFolder name="wakeline" />
        </Box>
      </Box>

      <Box
        sx={(theme) => ({
          mt: 'auto',
          pt: 1.5,
          px: 1.25,
          borderTop: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.14)}`,
        })}
      >
        <Box sx={{ gap: 1, display: 'flex', alignItems: 'center', mb: 0.4 }}>
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: 'success.main',
              boxShadow: '0 0 0 3px rgba(34, 197, 94, 0.16)',
            }}
          />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 13 }}>
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

      {slots?.bottomArea}
    </Box>
  );
}

// ----------------------------------------------------------------------

function TreeFolder({ name }: { name: string }) {
  return (
    <ListItemButton
      disableGutters
      component={RouterLink}
      href="/pull-requests"
      sx={{
        mt: 0.75,
        px: 1.25,
        gap: 1,
        minHeight: 30,
        borderRadius: 1,
        fontSize: 14,
        color: 'text.secondary',
      }}
    >
      <NavIcon name="folder" size={17} />
      <Box component="span">{name}</Box>
    </ListItemButton>
  );
}

function TreeBranch({
  icon,
  iconColor,
  name,
  count,
  dot,
  href,
}: {
  icon: 'bug' | 'branch';
  iconColor: string;
  name: string;
  count?: number;
  dot?: boolean;
  href: string;
}) {
  return (
    <ListItemButton
      disableGutters
      component={RouterLink}
      href={href}
      sx={{
        px: 1.25,
        gap: 1.25,
        minHeight: 34,
        borderRadius: 1,
        fontSize: 14,
        fontWeight: 500,
        color: 'text.primary',
      }}
    >
      <Box
        component="span"
        sx={{
          width: 18,
          height: 18,
          display: 'grid',
          placeItems: 'center',
          color: iconColor,
          flexShrink: 0,
        }}
      >
        <NavIcon name={icon} size={17} />
      </Box>
      <Box
        component="span"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </Box>
      {count !== undefined && (
        <Typography
          variant="caption"
          sx={{ color: 'text.disabled', fontWeight: 600, fontSize: 12 }}
        >
          {count}
        </Typography>
      )}
      {dot && (
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: 'text.secondary',
            flexShrink: 0,
          }}
        />
      )}
    </ListItemButton>
  );
}
