import { useTranslation } from 'react-i18next';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { DashboardContent } from 'src/layouts/dashboard';
import { type Language, changeLanguage } from 'src/locales/i18n';

// ----------------------------------------------------------------------

type Mode = 'dark' | 'light' | 'system';

export function SettingsView() {
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useColorScheme();

  return (
    <DashboardContent maxWidth="md">
      <Typography variant="h4" sx={{ mb: 5 }}>
        {t('settings.title')}
      </Typography>

      <Card sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t('settings.general')}
        </Typography>

        <SettingRow label={t('settings.language')} hint={t('settings.languageHint')}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={i18n.language}
            onChange={(_, value: Language | null) => value && changeLanguage(value)}
          >
            <ToggleButton value="es">Español</ToggleButton>
            <ToggleButton value="en">English</ToggleButton>
          </ToggleButtonGroup>
        </SettingRow>

        <Divider sx={{ borderStyle: 'dashed' }} />

        <SettingRow label={t('settings.theme')}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={mode ?? 'dark'}
            onChange={(_, value: Mode | null) => value && setMode(value)}
          >
            <ToggleButton value="dark">{t('settings.themeDark')}</ToggleButton>
            <ToggleButton value="light">{t('settings.themeLight')}</ToggleButton>
            <ToggleButton value="system">{t('settings.themeSystem')}</ToggleButton>
          </ToggleButtonGroup>
        </SettingRow>
      </Card>
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ py: 2, gap: 2, display: 'flex', alignItems: 'center' }}>
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="subtitle2">{label}</Typography>
        {hint && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {hint}
          </Typography>
        )}
      </Box>
      {children}
    </Box>
  );
}
