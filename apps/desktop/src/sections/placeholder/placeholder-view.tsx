import { useTranslation } from 'react-i18next';

import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';

import { DashboardContent } from 'src/layouts/dashboard';

// ----------------------------------------------------------------------

type PlaceholderViewProps = {
  /** Prefijo de las claves de traducción: `<section>.title` y `<section>.subtitle`. */
  section: 'summary' | 'cards' | 'pullRequests';
};

export function PlaceholderView({ section }: PlaceholderViewProps) {
  const { t } = useTranslation();

  return (
    <DashboardContent maxWidth="xl">
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        {t(`${section}.title`)}
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 5 }}>{t(`${section}.subtitle`)}</Typography>

      <Card sx={{ p: 5, color: 'text.secondary' }}>{t('common.comingSoon')}</Card>
    </DashboardContent>
  );
}
