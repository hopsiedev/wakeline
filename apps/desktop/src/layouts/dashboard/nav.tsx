import type { Theme, SxProps, Breakpoint } from '@mui/material/styles';
import type { UiCard, DashboardPayload, UiProjectSummary } from 'src/services/wakeline';

import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';
import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Popover from '@mui/material/Popover';
import Skeleton from '@mui/material/Skeleton';
import Collapse from '@mui/material/Collapse';
import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ListItemButton from '@mui/material/ListItemButton';
import Drawer, { drawerClasses } from '@mui/material/Drawer';

import { usePathname } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { fetchDashboardData } from 'src/services/wakeline';

import { Logo } from 'src/components/logo';
import { NavIcon } from 'src/components/nav-icon';

import { AccountSection } from '../components/account-section';

import type { NavItem } from '../nav-config-dashboard';

// ----------------------------------------------------------------------

export type NavContentProps = {
  data: NavItem[];
  /** Riel de íconos (barra colapsada). */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  sx?: SxProps<Theme>;
};

export function NavDesktop({
  layoutQuery,
  ...props
}: NavContentProps & { layoutQuery: Breakpoint }) {
  const theme = useTheme();

  return (
    <Box
      sx={[
        {
          pt: 1.25,
          pb: 1.25,
          px: props.collapsed ? 1 : 1.25,
          top: 0,
          left: 0,
          height: 1,
          display: 'none',
          position: 'fixed',
          overflow: 'hidden',
          flexDirection: 'column',
          zIndex: 'var(--layout-nav-zIndex)',
          width: 'var(--layout-nav-vertical-width)',
          transition: `width ${NAV_ANIMATION}, padding ${NAV_ANIMATION}`,
          // Fondo opaco: si el contenido pasa por debajo un instante, no se ve a través.
          bgcolor: 'background.default',
          borderRight: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.14)}`,
          [theme.breakpoints.up(layoutQuery)]: { display: 'flex' },
        },
        theme.applyStyles('dark', {
          background: 'linear-gradient(180deg, #131313 0%, #050505 100%)',
        }),
      ]}
    >
      <NavContent {...props} />
    </Box>
  );
}

// ----------------------------------------------------------------------

export function NavMobile({
  open,
  onClose,
  ...props
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
          pb: 1.25,
          px: 1.25,
          overflow: 'hidden',
          width: 'var(--layout-nav-mobile-width)',
        },
      }}
    >
      <NavContent {...props} collapsed={false} />
    </Drawer>
  );
}

// ----------------------------------------------------------------------

function useDashboard() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);

  useEffect(() => {
    let alive = true;
    const load = (force?: boolean) =>
      fetchDashboardData({ force }).then((p) => alive && setPayload(p));
    load();
    const onRescan = () => load(true);
    window.addEventListener('wakeline:rescan', onRescan);
    return () => {
      alive = false;
      window.removeEventListener('wakeline:rescan', onRescan);
    };
  }, []);

  return payload;
}

/** Duración de la animación al plegar o desplegar la barra (igual en el contenido). */
export const NAV_ANIMATION = '200ms cubic-bezier(0.2, 0, 0, 1)';

const isOpen = (c: UiCard) => c.status === 'new' || c.status === 'accepted';

type BranchRow = { name: string; open: number; hasErrors: boolean };

function branchesOf(project: UiProjectSummary, cards: UiCard[]): BranchRow[] {
  const map = new Map<string, BranchRow>();
  for (const card of cards) {
    if (!isOpen(card) || card.project.toLowerCase() !== project.name.toLowerCase()) continue;
    const row = map.get(card.branch) ?? { name: card.branch, open: 0, hasErrors: false };
    row.open += 1;
    row.hasErrors ||= card.kind === 'error';
    map.set(card.branch, row);
  }
  return [...map.values()].sort(
    (a, b) => Number(b.hasErrors) - Number(a.hasErrors) || b.open - a.open
  );
}

// ----------------------------------------------------------------------

export function NavContent({ data, collapsed = false, onToggleCollapse, sx }: NavContentProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const payload = useDashboard();
  const [alertsAnchor, setAlertsAnchor] = useState<HTMLElement | null>(null);

  const cards = useMemo(() => payload?.cards ?? [], [payload]);
  const projects = payload?.projects ?? [];
  const newCards = cards.filter((c) => c.status === 'new');
  const newErrors = newCards.filter((c) => c.kind === 'error');

  return (
    <Box
      sx={[
        { height: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {/* Marca y botón para ocultar la barra */}
      <Box
        sx={{
          pt: 0.5,
          pb: 1.5,
          px: collapsed ? 0 : 0.75,
          gap: 1,
          display: 'flex',
          alignItems: 'center',
          flexDirection: collapsed ? 'column' : 'row',
        }}
      >
        <Logo isSingle={collapsed} />
        {!collapsed && <Box sx={{ flexGrow: 1 }} />}
        {onToggleCollapse && (
          <Tooltip title={collapsed ? t('nav.expand') : t('nav.collapse')} placement="right">
            <IconButton
              size="small"
              onClick={onToggleCollapse}
              aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
              sx={{ width: 30, height: 30, borderRadius: 1, color: 'text.secondary' }}
            >
              <NavIcon name="panel" size={18} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Box
        component="nav"
        sx={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box component="ul" sx={{ gap: 0.25, display: 'flex', flexDirection: 'column' }}>
          {data.map((item) => (
            <NavRow
              key={item.path}
              href={item.path}
              icon={item.icon}
              label={t(item.titleKey)}
              active={item.path === pathname}
              collapsed={collapsed}
              trailing={
                item.path === '/cards' && newCards.length > 0 ? (
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'error.main' }}>
                    {t('nav.newCount', { count: newCards.length })}
                  </Typography>
                ) : undefined
              }
            />
          ))}

          <NavRow
            icon={<NavIcon name="bell" />}
            label={t('nav.notifications')}
            collapsed={collapsed}
            badge={newErrors.length}
            onClick={(e) => setAlertsAnchor(e.currentTarget)}
            trailing={
              newErrors.length > 0 ? (
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>
                  {newErrors.length}
                </Typography>
              ) : undefined
            }
          />
        </Box>

        {/* PROYECTOS */}
        {collapsed ? (
          <Box
            sx={{ mt: 2, gap: 0.5, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            {projects.map((p) => (
              <Tooltip key={p.name} title={p.name} placement="right">
                <IconButton
                  component={RouterLink}
                  href="/pull-requests"
                  sx={{ width: 36, height: 36, borderRadius: 1, fontSize: 14, fontWeight: 700 }}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </IconButton>
              </Tooltip>
            ))}
          </Box>
        ) : (
          <>
            <SectionHeader
              title={t('nav.projects')}
              actionLabel={t('nav.watchFolder')}
              actionHref="/pull-requests"
            />
            {!payload ? (
              <ProjectsSkeleton />
            ) : projects.length === 0 ? (
              <AddPlaceholder label={t('nav.addFirstProject')} href="/pull-requests" />
            ) : (
              <Box sx={{ gap: 0.25, display: 'flex', flexDirection: 'column' }}>
                {projects.map((p) => (
                  <ProjectTree key={p.name} project={p} branches={branchesOf(p, cards)} />
                ))}
              </Box>
            )}
          </>
        )}
      </Box>

      <AccountSection collapsed={collapsed} />

      <Popover
        open={!!alertsAnchor}
        anchorEl={alertsAnchor}
        onClose={() => setAlertsAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 340, p: 1 } } }}
      >
        <Typography sx={{ px: 1, py: 0.75, fontSize: 12, fontWeight: 700, color: 'text.disabled' }}>
          {t('nav.alertsTitle').toUpperCase()}
        </Typography>
        {newErrors.length === 0 ? (
          <Typography sx={{ px: 1, pb: 1, fontSize: 14, color: 'text.secondary' }}>
            {t('nav.noAlerts')}
          </Typography>
        ) : (
          newErrors.slice(0, 6).map((card) => (
            <ListItemButton
              key={card.fingerprint}
              component={RouterLink}
              href={`/cards?detail=${card.short_id}`}
              onClick={() => setAlertsAnchor(null)}
              sx={{ gap: 1.25, borderRadius: 1, alignItems: 'flex-start', py: 1 }}
            >
              <Box sx={{ color: 'error.main', mt: 0.25 }}>
                <NavIcon name="bug" size={17} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }} noWrap>
                  {card.title}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }} noWrap>
                  {card.project} · {card.branch} · ×{card.occurrences}
                </Typography>
              </Box>
            </ListItemButton>
          ))
        )}
      </Popover>
    </Box>
  );
}

// ----------------------------------------------------------------------

function NavRow({
  icon,
  label,
  href,
  active = false,
  collapsed,
  trailing,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  active?: boolean;
  collapsed: boolean;
  trailing?: React.ReactNode;
  badge?: number;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  const linkProps = href ? { component: RouterLink, href } : { onClick };

  const button = (
    <ListItemButton
      disableGutters
      {...linkProps}
      sx={(theme) => ({
        px: 1.25,
        gap: 1.5,
        minHeight: 38,
        borderRadius: 1.25,
        fontSize: 14.5,
        fontWeight: 500,
        position: 'relative',
        justifyContent: collapsed ? 'center' : 'flex-start',
        color: theme.vars.palette.text.primary,
        '& svg': { color: theme.vars.palette.text.secondary },
        ...(active && {
          fontWeight: 600,
          bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.14),
          '& svg': { color: theme.vars.palette.text.primary },
          '&::before': {
            content: '""',
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            borderRadius: 2,
            position: 'absolute',
            bgcolor: 'primary.main',
          },
          '&:hover': { bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.18) },
        }),
      })}
    >
      <Box component="span" sx={{ width: 20, height: 20, display: 'flex', position: 'relative' }}>
        {icon}
        {collapsed && !!badge && (
          <Box
            component="span"
            sx={(theme) => ({
              top: -2,
              right: -3,
              width: 7,
              height: 7,
              borderRadius: '50%',
              position: 'absolute',
              bgcolor: 'error.main',
              boxShadow: `0 0 0 2px ${theme.vars.palette.background.default}`,
            })}
          />
        )}
      </Box>
      {!collapsed && (
        <>
          <Box component="span" sx={{ flexGrow: 1 }}>
            {label}
          </Box>
          {trailing}
        </>
      )}
    </ListItemButton>
  );

  return (
    <Box component="li">
      {collapsed ? (
        <Tooltip title={label} placement="right">
          {button}
        </Tooltip>
      ) : (
        button
      )}
    </Box>
  );
}

function SectionHeader({
  title,
  actionLabel,
  actionHref,
}: {
  title: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <Box sx={{ pt: 2.5, pb: 0.75, pl: 1.25, pr: 0.25, display: 'flex', alignItems: 'center' }}>
      <Typography
        sx={{
          flexGrow: 1,
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: 1,
          color: 'text.disabled',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Typography>
      <Tooltip title={actionLabel}>
        <IconButton
          size="small"
          component={RouterLink}
          href={actionHref}
          aria-label={actionLabel}
          sx={{ width: 26, height: 26, borderRadius: 1, color: 'text.disabled' }}
        >
          <NavIcon name="plus" size={16} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function ProjectsSkeleton() {
  return (
    <Box sx={{ px: 1.25, gap: 1.25, display: 'flex', flexDirection: 'column' }}>
      {[70, 52, 60, 44, 66].map((width, i) => (
        <Box key={i} sx={{ gap: 1, display: 'flex', alignItems: 'center', pl: i % 3 ? 2.25 : 0 }}>
          <Skeleton variant="rounded" width={16} height={16} />
          <Skeleton variant="text" width={`${width}%`} sx={{ fontSize: 14 }} />
        </Box>
      ))}
    </Box>
  );
}

function AddPlaceholder({ label, href }: { label: string; href: string }) {
  return (
    <ListItemButton
      component={RouterLink}
      href={href}
      sx={(theme) => ({
        // ListItemButton crece por defecto: sin esto ocupa toda la barra.
        flexGrow: 0,
        mx: 0.25,
        px: 1.5,
        py: 1.25,
        gap: 1,
        fontSize: 13.5,
        borderRadius: 1.5,
        color: 'text.secondary',
        border: `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.32)}`,
      })}
    >
      <NavIcon name="plus" size={15} />
      {label}
    </ListItemButton>
  );
}

function ProjectTree({ project, branches }: { project: UiProjectSummary; branches: BranchRow[] }) {
  const storageKey = `wakeline-project-open:${project.name}`;
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) !== 'false');

  const toggle = () => {
    localStorage.setItem(storageKey, String(!open));
    setOpen(!open);
  };

  return (
    <Box>
      <ListItemButton
        disableGutters
        onClick={toggle}
        sx={{
          px: 1.25,
          gap: 1,
          minHeight: 32,
          borderRadius: 1,
          fontSize: 14,
          color: 'text.secondary',
        }}
      >
        <Box
          component="span"
          sx={{
            display: 'flex',
            transition: 'transform 120ms',
            transform: open ? 'rotate(90deg)' : 'none',
          }}
        >
          <NavIcon name="chevRight" size={14} />
        </Box>
        <NavIcon name="folder" size={17} />
        <Box component="span" sx={{ flexGrow: 1, minWidth: 0 }}>
          {project.name}
        </Box>
        {project.errors > 0 && (
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'error.main' }} />
        )}
      </ListItemButton>

      <Collapse in={open} unmountOnExit>
        <Box sx={{ pl: 2.25, gap: 0.25, display: 'flex', flexDirection: 'column' }}>
          {branches.map((b) => (
            <ListItemButton
              key={b.name}
              disableGutters
              component={RouterLink}
              href={`/cards?project=${encodeURIComponent(project.name)}&branch=${encodeURIComponent(b.name)}`}
              sx={{
                px: 1.25,
                gap: 1.25,
                minHeight: 32,
                borderRadius: 1,
                fontSize: 14,
                fontWeight: 500,
                color: 'text.primary',
              }}
            >
              <Box
                component="span"
                sx={{ display: 'flex', color: b.hasErrors ? 'error.main' : 'info.main' }}
              >
                <NavIcon name={b.hasErrors ? 'bug' : 'branch'} size={16} />
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
                {b.name}
              </Box>
              <Typography sx={{ color: 'text.disabled', fontWeight: 600, fontSize: 12 }}>
                {b.open}
              </Typography>
            </ListItemButton>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
