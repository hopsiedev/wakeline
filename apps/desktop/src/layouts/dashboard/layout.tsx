import type { Breakpoint } from '@mui/material/styles';

import { useState } from 'react';
import { merge } from 'es-toolkit';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';
import { useBoolean } from 'minimal-shared/hooks';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import { RouterLink } from 'src/routes/components';

import { AppIcon } from 'src/components/nav-icon';

import { NavMobile, NavDesktop } from './nav';
import { layoutClasses } from '../core/classes';
import { dashboardLayoutVars } from './css-vars';
import { navData } from '../nav-config-dashboard';
import { MainSection } from '../core/main-section';
import { MenuButton } from '../components/menu-button';
import { HeaderSection } from '../core/header-section';
import { LayoutSection } from '../core/layout-section';

import type { MainSectionProps } from '../core/main-section';
import type { HeaderSectionProps } from '../core/header-section';
import type { LayoutSectionProps } from '../core/layout-section';

// ----------------------------------------------------------------------

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

  const { value: open, onFalse: onClose, onTrue: onOpen } = useBoolean();
  const [rescanning, setRescanning] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);

  const handleRescan = () => {
    setRescanning(true);
    window.dispatchEvent(new CustomEvent('wakeline:rescan'));
    setTimeout(() => setRescanning(false), 1200);
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
      topArea: (
        <Alert severity="info" sx={{ display: 'none', borderRadius: 0 }}>
          This is an info Alert.
        </Alert>
      ),
      leftArea: (
        <>
          <MenuButton
            onClick={onOpen}
            sx={{ mr: 1, ml: -1, [theme.breakpoints.up(layoutQuery)]: { display: 'none' } }}
          />
          <NavMobile
            data={navData}
            open={open}
            onClose={onClose}
            onOpenToast={() => setToastOpen((prev) => !prev)}
          />
        </>
      ),
      rightArea: (
        <Box sx={{ gap: 1.5, display: 'flex', alignItems: 'center' }}>
          <Button
            size="small"
            color="inherit"
            onClick={handleRescan}
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

          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 700,
              fontSize: 14,
              color: '#FFFFFF',
              userSelect: 'none',
              background: 'linear-gradient(135deg, #00B8D9, #8E33FF)',
            }}
          >
            H
          </Box>
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

  const renderMain = () => (
    <MainSection {...slotProps?.main}>
      {children}

      {toastOpen && (
        <Box
          sx={{
            right: 20,
            bottom: 20,
            width: 364,
            zIndex: 1300,
            position: 'fixed',
            borderRadius: 1.25,
            p: '14px 16px 16px',
            bgcolor: 'background.paper',
            border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.2)}`,
            boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
          }}
        >
          <Box
            sx={{
              mb: 1.25,
              gap: 1,
              display: 'flex',
              alignItems: 'center',
              fontSize: 12,
              color: 'text.secondary',
            }}
          >
            <Box component="img" src="/logo/wakeline-mark.svg" alt="" sx={{ width: 16 }} />
            <span>Wakeline</span>
            <Box
              component="button"
              type="button"
              onClick={() => setToastOpen(false)}
              sx={{
                ml: 'auto',
                p: 0,
                border: 0,
                cursor: 'pointer',
                bgcolor: 'transparent',
                color: 'text.secondary',
              }}
            >
              ✕
            </Box>
          </Box>
          <Typography variant="subtitle2" sx={{ mb: 0.25 }}>
            {t('toast.title')}
          </Typography>
          <Typography variant="body2" sx={{ mb: 1.5, fontSize: 13, color: 'text.secondary' }}>
            {t('toast.body')}
          </Typography>
          <Box sx={{ gap: 1, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <Button
              size="small"
              variant="contained"
              color="primary"
              component={RouterLink}
              href="/cards?detail=V-142"
              onClick={() => setToastOpen(false)}
              sx={{ height: 32, borderRadius: 0.75 }}
            >
              {t('toast.open')}
            </Button>
            <Button
              size="small"
              color="inherit"
              onClick={() => setToastOpen(false)}
              sx={{
                height: 32,
                borderRadius: 0.75,
                bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
              }}
            >
              {t('toast.dismiss')}
            </Button>
          </Box>
        </Box>
      )}
    </MainSection>
  );

  return (
    <LayoutSection
      headerSection={renderHeader()}
      sidebarSection={
        <NavDesktop
          data={navData}
          layoutQuery={layoutQuery}
          onOpenToast={() => setToastOpen((prev) => !prev)}
        />
      }
      footerSection={renderFooter()}
      cssVars={{ ...dashboardLayoutVars(theme), ...cssVars }}
      sx={[
        {
          [`& .${layoutClasses.sidebarContainer}`]: {
            [theme.breakpoints.up(layoutQuery)]: {
              pl: 'var(--layout-nav-vertical-width)',
              transition: theme.transitions.create(['padding-left'], {
                easing: 'var(--layout-transition-easing)',
                duration: 'var(--layout-transition-duration)',
              }),
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
