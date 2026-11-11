import type { Breakpoint } from '@mui/material/styles';

import { merge } from 'es-toolkit';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';
import { useBoolean } from 'minimal-shared/hooks';
import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';

import { useRouter } from 'src/routes/hooks';

import {
  subscribeToChanges,
  fetchDashboardData,
  invalidateDashboardCache,
} from 'src/services/wakeline';

import { AppIcon } from 'src/components/nav-icon';

import { layoutClasses } from '../core/classes';
import { dashboardLayoutVars } from './css-vars';
import { navData } from '../nav-config-dashboard';
import { MainSection } from '../core/main-section';
import { MenuButton } from '../components/menu-button';
import { HeaderSection } from '../core/header-section';
import { LayoutSection } from '../core/layout-section';
import { NavMobile, NavDesktop, NAV_ANIMATION } from './nav';

import type { MainSectionProps } from '../core/main-section';
import type { HeaderSectionProps } from '../core/header-section';
import type { LayoutSectionProps } from '../core/layout-section';

// ----------------------------------------------------------------------

const COLLAPSED_KEY = 'wakeline-nav-collapsed';
const NAV_WIDTH = '264px';
const NAV_RAIL_WIDTH = '68px';

type LayoutBaseProps = Pick<LayoutSectionProps, 'sx' | 'children' | 'cssVars'>;

export type DashboardLayoutProps = LayoutBaseProps & {
  layoutQuery?: Breakpoint;
  slotProps?: {
    header?: HeaderSectionProps;
    main?: MainSectionProps;
  };
};

export function DashboardLayout({
  sx,
  cssVars,
  children,
  slotProps,
  layoutQuery = 'lg',
}: DashboardLayoutProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const router = useRouter();
  const { value: open, onFalse: onClose, onTrue: onOpen } = useBoolean();
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === 'true');

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSED_KEY, String(!prev));
      return !prev;
    });
  }, []);

  useEffect(() => subscribeToChanges(), []);

  // Atajos: Ctrl+B oculta o muestra la barra; Ctrl+, abre la configuración.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleCollapsed();
      } else if (event.key === ',') {
        event.preventDefault();
        router.push('/settings');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, toggleCollapsed]);

  const handleRescan = async () => {
    if (rescanning) return;
    setRescanning(true);
    setRescanError(null);
    try {
      invalidateDashboardCache();
      window.dispatchEvent(new CustomEvent('wakeline:rescan'));
      const data = await fetchDashboardData({ force: true });
      if (data.scan_error) setRescanError(data.scan_error);
    } catch (error) {
      setRescanError(String(error));
    } finally {
      setRescanning(false);
    }
  };

  const renderHeader = () => {
    const headerSlotProps: HeaderSectionProps['slotProps'] = {
      container: {
        maxWidth: false,
        sx: {
          [theme.breakpoints.up(layoutQuery)]: {
            px: 'var(--layout-dashboard-content-px)',
          },
        },
      },
    };

    const headerSlots: HeaderSectionProps['slots'] = {
      leftArea: (
        <>
          <MenuButton
            onClick={onOpen}
            sx={{ mr: 1, ml: -1, [theme.breakpoints.up(layoutQuery)]: { display: 'none' } }}
          />
          <NavMobile data={navData} open={open} onClose={onClose} />
        </>
      ),
      rightArea: (
        <Box sx={{ gap: 1.5, display: 'flex', alignItems: 'center' }}>
          {rescanError && (
            <Alert severity="error" onClose={() => setRescanError(null)}>
              {rescanError}
            </Alert>
          )}
          <Button
            size="small"
            color="inherit"
            onClick={handleRescan}
            disabled={rescanning}
            title={rescanError ?? undefined}
            startIcon={<AppIcon name="term" size={18} />}
            sx={{
              height: 30,
              px: 1.25,
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 1,
              bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
              '&:hover': {
                bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
              },
            }}
          >
            {rescanning ? t('nav.rescanning') : t('nav.rescan')}
          </Button>
        </Box>
      ),
    };

    return (
      <HeaderSection
        disableElevation
        layoutQuery={layoutQuery}
        {...slotProps?.header}
        slots={{ ...headerSlots, ...slotProps?.header?.slots }}
        slotProps={merge(headerSlotProps, slotProps?.header?.slotProps ?? {})}
        sx={slotProps?.header?.sx}
      />
    );
  };

  const renderFooter = () => null;

  const renderMain = () => <MainSection {...slotProps?.main}>{children}</MainSection>;

  return (
    <LayoutSection
      headerSection={renderHeader()}
      sidebarSection={
        <NavDesktop
          data={navData}
          layoutQuery={layoutQuery}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      }
      footerSection={renderFooter()}
      cssVars={{
        ...dashboardLayoutVars(theme),
        '--layout-nav-vertical-width': collapsed ? NAV_RAIL_WIDTH : NAV_WIDTH,
        ...cssVars,
      }}
      sx={[
        {
          [`& .${layoutClasses.sidebarContainer}`]: {
            [theme.breakpoints.up(layoutQuery)]: {
              pl: 'var(--layout-nav-vertical-width)',
              transition: `padding-left ${NAV_ANIMATION}`,
            },
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {renderMain()}
    </LayoutSection>
  );
}
