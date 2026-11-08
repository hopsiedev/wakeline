import { useTranslation } from 'react-i18next';

import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

import { RouterLink } from 'src/routes/components';

import { Logo } from 'src/components/logo';

// ----------------------------------------------------------------------

export function NotFoundView() {
  const { t } = useTranslation();

  return (
    <>
      <Logo sx={{ position: 'fixed', top: 20, left: 20 }} />

      <Container
        sx={{
          py: 10,
          flexGrow: 1,
          display: 'flex',
          alignItems: 'center',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <Typography variant="h3" sx={{ mb: 5 }}>
          {t('notFound.title')}
        </Typography>

        <Button component={RouterLink} href="/" size="large" variant="contained" color="inherit">
          {t('notFound.back')}
        </Button>
      </Container>
    </>
  );
}
