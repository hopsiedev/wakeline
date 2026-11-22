import type { TFunction } from 'i18next';
import type { Theme, CSSObject } from '@mui/material/styles';

import { useTranslation } from 'react-i18next';
import { useRouteError, isRouteErrorResponse } from 'react-router';

import GlobalStyles from '@mui/material/GlobalStyles';

// ----------------------------------------------------------------------

export function ErrorBoundary() {
  const { t } = useTranslation();
  const error = useRouteError();

  return (
    <>
      {inputGlobalStyles()}

      <div className={errorBoundaryClasses.root}>
        <div className={errorBoundaryClasses.container}>
          {renderErrorMessage(error, t)}
          {/* F5 is blocked in the desktop app: without these there is no way out. */}
          <div className={errorBoundaryClasses.actions}>
            <button type="button" onClick={() => window.location.reload()}>
              {t('errors.reload')}
            </button>
            <button type="button" onClick={() => window.location.assign('/')}>
              {t('notFound.back')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ----------------------------------------------------------------------

function parseStackTrace(stack?: string) {
  if (!stack) return { filePath: null, functionName: null };

  const filePathMatch = stack.match(/\/src\/[^?]+/);
  const functionNameMatch = stack.match(/at (\S+)/);

  return {
    filePath: filePathMatch ? filePathMatch[0] : null,
    functionName: functionNameMatch ? functionNameMatch[1] : null,
  };
}

function renderErrorMessage(error: unknown, t: TFunction) {
  if (isRouteErrorResponse(error)) {
    return (
      <>
        <h1 className={errorBoundaryClasses.title}>
          {error.status}: {error.statusText}
        </h1>
        <p className={errorBoundaryClasses.message}>{error.data}</p>
      </>
    );
  }

  if (error instanceof Error) {
    const { filePath, functionName } = parseStackTrace(error.stack);

    return (
      <>
        <h1 className={errorBoundaryClasses.title}>{t('errors.unexpected')}</h1>
        <p className={errorBoundaryClasses.message}>
          {error.name}: {error.message}
        </p>
        <pre className={errorBoundaryClasses.details}>{error.stack}</pre>
        {(filePath || functionName) && (
          <p className={errorBoundaryClasses.filePath}>
            {filePath} ({functionName})
          </p>
        )}
      </>
    );
  }

  return <h1 className={errorBoundaryClasses.title}>{t('errors.unknown')}</h1>;
}

// ----------------------------------------------------------------------

const errorBoundaryClasses = {
  root: 'error-boundary-root',
  container: 'error-boundary-container',
  title: 'error-boundary-title',
  details: 'error-boundary-details',
  message: 'error-boundary-message',
  filePath: 'error-boundary-file-path',
  actions: 'error-boundary-actions',
};

const cssVars: CSSObject = {
  '--info-color': '#2dd9da',
  '--warning-color': '#e2aa53',
  '--error-color': '#ff5555',
  '--error-background': '#2a1e1e',
  '--details-background': '#111111',
  '--root-background': '#131313',
  '--container-background': '#1B1B1B',
  '--font-stack-monospace':
    '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace',
  '--font-stack-sans':
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
};

const rootStyles = (): CSSObject => ({
  display: 'flex',
  flex: '1 1 auto',
  alignItems: 'center',
  padding: '10vh 15px 0',
  flexDirection: 'column',
  fontFamily: 'var(--font-stack-sans)',
});

const contentStyles = (): CSSObject => ({
  gap: 24,
  padding: 20,
  width: '100%',
  maxWidth: 960,
  display: 'flex',
  borderRadius: 8,
  flexDirection: 'column',
  backgroundColor: 'var(--container-background)',
});

const titleStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  lineHeight: 1.2,
  fontSize: theme.typography.pxToRem(20),
  fontWeight: theme.typography.fontWeightBold,
});

const messageStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  lineHeight: 1.5,
  padding: '12px 16px',
  whiteSpace: 'pre-wrap',
  color: 'var(--error-color)',
  fontSize: theme.typography.pxToRem(14),
  fontFamily: 'var(--font-stack-monospace)',
  backgroundColor: 'var(--error-background)',
  borderLeft: '2px solid var(--error-color)',
  fontWeight: theme.typography.fontWeightBold,
});

const detailsStyles = (): CSSObject => ({
  margin: 0,
  padding: 16,
  lineHeight: 1.5,
  overflow: 'auto',
  borderRadius: 'inherit',
  color: 'var(--warning-color)',
  backgroundColor: 'var(--details-background)',
});

const filePathStyles = (): CSSObject => ({
  marginTop: 0,
  color: 'var(--info-color)',
});

const actionsStyles = (theme: Theme): CSSObject => ({
  gap: 12,
  display: 'flex',
  flexWrap: 'wrap',
  '& button': {
    color: 'white',
    cursor: 'pointer',
    borderRadius: 6,
    padding: '8px 14px',
    fontFamily: 'inherit',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.24)',
    fontSize: theme.typography.pxToRem(14),
    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
    '&:focus-visible': { outline: '2px solid var(--info-color)', outlineOffset: 2 },
  },
});

const inputGlobalStyles = () => (
  <GlobalStyles
    styles={(theme) => ({
      body: {
        ...cssVars,
        margin: 0,
        color: 'white',
        backgroundColor: 'var(--root-background)',
        [`& .${errorBoundaryClasses.root}`]: rootStyles(),
        [`& .${errorBoundaryClasses.container}`]: contentStyles(),
        [`& .${errorBoundaryClasses.title}`]: titleStyles(theme),
        [`& .${errorBoundaryClasses.message}`]: messageStyles(theme),
        [`& .${errorBoundaryClasses.filePath}`]: filePathStyles(),
        [`& .${errorBoundaryClasses.details}`]: detailsStyles(),
        [`& .${errorBoundaryClasses.actions}`]: actionsStyles(theme),
      },
    })}
  />
);
