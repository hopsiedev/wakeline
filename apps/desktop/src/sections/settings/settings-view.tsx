import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { varAlpha } from 'minimal-shared/utils';
import { useRef, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';

import { CONFIG } from 'src/config-global';
import { DashboardContent } from 'src/layouts/dashboard';
import { dailySummaryEnabled, setDailySummaryEnabled } from 'src/services/daily-summary-state';
import { type Language, alertsEnabled, changeLanguage, setAlertsEnabled } from 'src/locales/i18n';
import {
  checkUpdate,
  openExternal,
  type UiUpdate,
  installUpdate,
  getAppVersion,
  importAllHistory,
  getMcpExecutable,
  getHistoryProgress,
  fetchDashboardData,
  historyImportStatus,
  type HistoryProgress,
} from 'src/services/wakeline';

import { Label } from 'src/components/label';
import { AppIcon } from 'src/components/nav-icon';
import { CopyButton } from 'src/components/copy-button';

import { GithubStatusCard } from './github-status-card';
import { ProjectCommandsCard } from './project-commands-card';

// ----------------------------------------------------------------------

type Mode = 'dark' | 'light' | 'system';

export function SettingsView() {
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useColorScheme();
  const [startWithWin, setStartWithWin] = useState(false);
  const [startupBusy, setStartupBusy] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [winToast, setWinToast] = useState(alertsEnabled);
  const [mcpExecutable, setMcpExecutable] = useState<string | null>(null);
  const [copiedMcp, setCopiedMcp] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dailySummary, setDailySummary] = useState(dailySummaryEnabled);
  const [historyProgress, setHistoryProgress] = useState(getHistoryProgress);
  const [allHistory, setAllHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);

  const currentLang: Language = i18n.language.startsWith('en') ? 'en' : 'es';
  const currentMode: Mode = (mode as Mode) ?? 'dark';
  const windowsPlatform = navigator.userAgent.includes('Windows');

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window) || !windowsPlatform) return;
    invoke<boolean>('get_startup_enabled')
      .then(setStartWithWin)
      .catch((e) => setStartupError(String(e)))
      .finally(() => setStartupBusy(false));
  }, [windowsPlatform]);
  const changeStartup = async (enabled: boolean) => {
    setStartupBusy(true);
    setStartupError(null);
    try {
      setStartWithWin(await invoke<boolean>('set_startup_enabled', { enabled }));
    } catch (e) {
      setStartupError(String(e));
    } finally {
      setStartupBusy(false);
    }
  };

  useEffect(() => {
    getMcpExecutable().then(setMcpExecutable);
  }, []);

  useEffect(() => {
    let active = true;
    const reload = () =>
      fetchDashboardData().then((data) => {
        if (active) setSessionCount(data.session_files);
      });
    void reload();
    window.addEventListener('wakeline:rescan', reload);
    return () => {
      active = false;
      window.removeEventListener('wakeline:rescan', reload);
    };
  }, []);

  useEffect(() => {
    let active = true;
    historyImportStatus()
      .then((value) => {
        if (active) setAllHistory(value);
      })
      .catch((error) => {
        if (active) setHistoryError(String(error));
      });
    const onProgress = (event: Event) =>
      setHistoryProgress((event as CustomEvent<HistoryProgress | null>).detail);
    window.addEventListener('wakeline:history-progress', onProgress);
    return () => {
      active = false;
      window.removeEventListener('wakeline:history-progress', onProgress);
    };
  }, []);

  const importHistory = async () => {
    setHistoryError(null);
    setHistoryNotice(null);
    try {
      const result = await importAllHistory();
      setAllHistory(true);
      setHistoryNotice(
        t(result.bad_lines ? 'settings.historyImportedWarnings' : 'settings.historyImported', {
          count: result.files,
          bad: result.bad_lines,
        })
      );
    } catch (error) {
      const message = String(error);
      setHistoryError(
        message.includes('NO_WATCHED_FOLDERS') ? t('pullRequests.noWatchedFolders') : message
      );
    }
  };

  useEffect(
    () => () => {
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    },
    []
  );

  const handleCopied = (label: string) => {
    if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    setCopiedMcp(label);
    copyTimer.current = setTimeout(() => setCopiedMcp(null), 2400);
  };

  const mcpCommand = mcpExecutable ?? 'wakeline';
  const mcpConfigs = [
    { label: t('account.claudeCode'), text: `claude mcp add wakeline -- "${mcpCommand}" mcp` },
    { label: t('account.codex'), text: `codex mcp add wakeline -- "${mcpCommand}" mcp` },
    {
      label: t('settings.mcpAntigravity', { path: '~/.gemini/config/mcp_config.json' }),
      text: JSON.stringify(
        { mcpServers: { wakeline: { command: mcpCommand, args: ['mcp'] } } },
        null,
        2
      ),
    },
  ];

  return (
    <DashboardContent maxWidth={false}>
      <Box sx={{ mb: 4 }}>
        <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.5 }}>
          {t('settings.title')}
        </Typography>
        <Box
          sx={{
            gap: 1.25,
            display: 'flex',
            alignItems: 'center',
            fontSize: 14,
            color: 'text.disabled',
          }}
        >
          <span>{t('nav.summary')}</span>
          <Box
            component="i"
            sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.disabled' }}
          />
          <Box component="b" sx={{ color: 'text.primary', fontWeight: 400 }}>
            {t('settings.title')}
          </Box>
        </Box>
      </Box>

      <Grid container spacing={3} sx={{ alignItems: 'flex-start' }}>
        {/* Columna izquierda */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
            {/* General */}
            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                {t('settings.general')}
              </Typography>
              <Typography sx={{ mt: 0.25, mb: 1.5, color: 'text.secondary', fontSize: 14 }}>
                {t('settings.generalSub')}
              </Typography>

              <SettingRow label={t('settings.language')} hint={t('settings.languageHint')}>
                <SegmentedPicker<Language>
                  value={currentLang}
                  onChange={(val) => changeLanguage(val)}
                  options={[
                    { value: 'es', label: t('settings.languageSpanish') },
                    { value: 'en', label: t('settings.languageEnglish') },
                  ]}
                />
              </SettingRow>

              <SettingRow label={t('settings.theme')} hint={t('settings.themeHint')}>
                <SegmentedPicker<Mode>
                  value={currentMode}
                  onChange={(val) => setMode(val)}
                  options={[
                    { value: 'dark', label: t('settings.themeDark') },
                    { value: 'light', label: t('settings.themeLight') },
                    { value: 'system', label: t('settings.themeSystem') },
                  ]}
                />
              </SettingRow>

              {windowsPlatform && (
                <SettingRow
                  label={t('settings.startWithWindows')}
                  hint={startupError || t('settings.startWithWindowsHint')}
                >
                  <Switch
                    checked={startWithWin}
                    disabled={startupBusy}
                    onChange={(e) => {
                      void changeStartup(e.target.checked);
                    }}
                  />
                </SettingRow>
              )}

              <SettingRow label={t('settings.exportPath')} hint={t('settings.exportPathHint')}>
                <Label color="default" sx={{ fontFamily: 'monospace' }}>
                  {t('settings.exportFolderValue')}
                </Label>
              </SettingRow>

              <UpdateRow />
              <SettingRow label={t('releaseUi.history')} hint={t('releaseUi.historyHint')}>
                <Button
                  color="inherit"
                  variant="outlined"
                  onClick={() => window.dispatchEvent(new CustomEvent('wakeline:release-history'))}
                >
                  {t('releaseUi.history')}
                </Button>
              </SettingRow>
            </Card>

            {/* Fuentes */}
            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                {t('settings.sourcesTitle')}
              </Typography>
              <Typography sx={{ mt: 0.25, mb: 1.5, color: 'text.secondary', fontSize: 14 }}>
                {t('settings.sourcesSub')}
              </Typography>

              <SettingRow
                label={t('settings.claudeSource')}
                hint={
                  sessionCount === null
                    ? t('common.loading')
                    : t('settings.claudeSourceHint', { count: sessionCount })
                }
              >
                <Label>{t('repositories.localSource')}</Label>
              </SettingRow>

              <SettingRow
                label={t('settings.cursorSource')}
                hint={t('settings.cursorSourceHint')}
                dimmed
              >
                <Label color="default">{t('common.soon')}</Label>
              </SettingRow>

              <SettingRow label={t('settings.githubSource')} hint={t('settings.githubSourceHint')}>
                <Label>{t('repositories.readOnly')}</Label>
              </SettingRow>

              <SettingRow
                label={t('settings.otherAgents')}
                hint={t('settings.otherAgentsHint')}
                dimmed
              >
                <Label color="default">{t('common.soon')}</Label>
              </SettingRow>

              <SettingRow
                label={t('settings.historyStart')}
                hint={t(allHistory ? 'settings.historyAllHint' : 'settings.historyStartHint')}
                isLast
              >
                <Box
                  sx={{
                    minWidth: 160,
                    maxWidth: '55%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 1,
                  }}
                >
                  <Button
                    size="small"
                    variant="outlined"
                    color="inherit"
                    onClick={importHistory}
                    disabled={historyProgress !== null}
                    startIcon={
                      historyProgress ? <CircularProgress color="inherit" size={14} /> : undefined
                    }
                    sx={(theme) => ({
                      height: 30,
                      px: 1.25,
                      fontSize: 13,
                      fontWeight: 700,
                      borderColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.32),
                    })}
                  >
                    {t(historyProgress ? 'settings.historyImporting' : 'settings.importAll')}
                  </Button>
                  {historyProgress && (
                    <Box sx={{ width: 1 }}>
                      <LinearProgress
                        variant={historyProgress.total ? 'determinate' : 'indeterminate'}
                        value={
                          historyProgress.total
                            ? (historyProgress.processed / historyProgress.total) * 100
                            : 0
                        }
                      />
                      <Typography sx={{ mt: 0.5, fontSize: 12, color: 'text.secondary' }}>
                        {t('settings.historyProgress', historyProgress)}
                      </Typography>
                    </Box>
                  )}
                  {historyError && (
                    <Typography role="alert" sx={{ color: 'error.main', fontSize: 12 }}>
                      {historyError}
                    </Typography>
                  )}
                </Box>
              </SettingRow>
            </Card>

            {/* Comandos de wakeline.toml */}
            <ProjectCommandsCard />

            {/* Estado de gh por proyecto */}
            <GithubStatusCard />
          </Box>
        </Grid>

        {/* Columna derecha */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
            {/* Avisos */}
            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>
                {t('settings.alertsTitle')}
              </Typography>

              <SettingRow label={t('settings.alertsWin')} hint={t('settings.alertsWinHint')}>
                <Switch
                  checked={winToast}
                  onChange={(e) => {
                    setWinToast(e.target.checked);
                    setAlertsEnabled(e.target.checked);
                  }}
                />
              </SettingRow>

              <SettingRow
                label={t('settings.alertsDaily')}
                hint={t('settings.alertsDailyHint')}
                isLast
              >
                <Switch
                  checked={dailySummary}
                  onChange={(e) => {
                    setDailySummary(e.target.checked);
                    setDailySummaryEnabled(e.target.checked);
                  }}
                />
              </SettingRow>
            </Card>

            {/* Exclusiones fijas (adaptadas a tema claro y oscuro) */}
            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                {t('settings.exclusionsTitle')}
              </Typography>
              <Typography sx={{ mt: 0.25, mb: 2.5, color: 'text.secondary', fontSize: 14 }}>
                {t('settings.exclusionsSub')}
              </Typography>

              <Box sx={{ gap: 1, display: 'flex', flexDirection: 'column', mb: 2 }}>
                {['~/.claude/sessions/', '**/.env · **/.env.*', t('settings.excludedTables')].map(
                  (rule) => (
                    <Box
                      key={rule}
                      sx={(theme) => ({
                        px: 1.5,
                        py: 1.25,
                        gap: 1.25,
                        borderRadius: 1,
                        display: 'flex',
                        alignItems: 'center',
                        fontFamily: 'monospace',
                        fontSize: 12.5,
                        color: 'text.primary',
                        bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
                        border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.18)}`,
                      })}
                    >
                      <Box sx={{ color: 'warning.main', display: 'flex' }}>
                        <AppIcon name="lock" size={16} />
                      </Box>
                      <Box component="span" sx={{ flexGrow: 1 }}>
                        {rule}
                      </Box>
                      <LockedSwitch />
                    </Box>
                  )
                )}
              </Box>

              <Box
                sx={(theme) => ({
                  p: 1.75,
                  gap: 1.5,
                  borderRadius: 1.25,
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 13.5,
                  color: 'text.primary',
                  bgcolor: varAlpha(theme.vars.palette.warning.mainChannel, 0.14),
                  border: `1px solid ${varAlpha(theme.vars.palette.warning.mainChannel, 0.28)}`,
                })}
              >
                <Box sx={{ color: 'warning.main', display: 'flex', flexShrink: 0 }}>
                  <AppIcon name="lock" size={20} />
                </Box>
                <Box>{t('settings.redactNotice')}</Box>
              </Box>
            </Card>

            {/* Servidor MCP (adaptado a tema claro y oscuro) */}
            <Card sx={{ p: 3 }}>
              <Box sx={{ mb: 2.5, display: 'flex', alignItems: 'center' }}>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                    {t('settings.mcpTitle')}
                  </Typography>
                  <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 14 }}>
                    {t('settings.mcpSub')}
                  </Typography>
                </Box>
                <Label color={mcpExecutable ? 'success' : 'warning'}>
                  {mcpExecutable ? t('settings.mcpCliReady') : t('settings.mcpCliMissing')}
                </Label>
              </Box>

              {!mcpExecutable && (
                <Typography sx={{ mb: 2, color: 'text.secondary', fontSize: 13 }}>
                  {t('settings.mcpBuildHint')}
                </Typography>
              )}

              {mcpConfigs.map((config) => (
                <Box key={config.label} sx={{ mb: 2 }}>
                  <Typography sx={{ mb: 0.75, fontSize: 13, fontWeight: 600 }}>
                    {config.label}
                  </Typography>
                  <Box
                    sx={(theme) => ({
                      position: 'relative',
                      borderRadius: 1.5,
                      bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
                      border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.18)}`,
                    })}
                  >
                    <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
                      <CopyButton
                        text={config.text}
                        disabled={!mcpExecutable}
                        onCopied={() => handleCopied(config.label)}
                      />
                    </Box>
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        py: 1.75,
                        pl: 2,
                        pr: 6,
                        overflowX: 'auto',
                        fontFamily: 'monospace',
                        fontSize: 12.5,
                        lineHeight: 1.6,
                        color: 'text.primary',
                      }}
                    >
                      {config.text}
                    </Box>
                  </Box>
                </Box>
              ))}

              <Box sx={{ gap: 1, display: 'flex', flexWrap: 'wrap' }}>
                {['list_cards', 'get_card', 'create_card', 'complete_card'].map((tool) => (
                  <Label key={tool} color="default" sx={{ fontFamily: 'monospace' }}>
                    {tool}
                  </Label>
                ))}
              </Box>
            </Card>
          </Box>
        </Grid>
      </Grid>
      <Snackbar
        open={copiedMcp !== null || historyNotice !== null}
        autoHideDuration={4000}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setHistoryNotice(null);
        }}
        transitionDuration={0}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="success" variant="filled" sx={{ boxShadow: 3 }}>
          {copiedMcp ? t('settings.copiedAlert') : historyNotice}
        </Alert>
      </Snackbar>
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

function SettingRow({
  label,
  hint,
  dimmed,
  isLast,
  children,
}: {
  label: string;
  hint?: string;
  dimmed?: boolean;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={(theme) => ({
        py: 1.75,
        gap: 2,
        display: 'flex',
        alignItems: 'center',
        opacity: dimmed ? 0.55 : 1,
        borderBottom: isLast
          ? 0
          : `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.2)}`,
      })}
    >
      <Box sx={{ flexGrow: 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{label}</Typography>
        {hint && <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>{hint}</Typography>}
      </Box>
      {children}
    </Box>
  );
}

// Busca una versión firmada en GitHub Releases y la instala si el usuario lo pide (Q60).
function UpdateRow() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const checkRequested = searchParams.get('checkUpdates') === '1';
  const checking = useRef(false);
  const [update, setUpdate] = useState<UiUpdate | null>(null);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'installing'>('idle');
  const [version, setVersion] = useState(CONFIG.appVersion);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAppVersion()
      .then((value) => {
        if (active) setVersion(value);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  const check = useCallback(async () => {
    if (checking.current) return;
    if (update?.state === 'manual') {
      await openExternal('https://github.com/hopsiedev/wakeline/releases');
      return;
    }
    checking.current = true;
    setPhase('checking');
    setError(null);
    try {
      const result = await checkUpdate();
      setUpdate(result);
      if (result) setVersion(result.current_version);
      if (result?.state === 'available' && result.version) {
        setPhase('installing');
        await installUpdate();
      }
    } catch (reason) {
      setError(String(reason));
    } finally {
      checking.current = false;
      setPhase('idle');
    }
  }, [update?.state]);

  useEffect(() => {
    if (!checkRequested) return;
    setSearchParams(
      (params) => {
        params.delete('checkUpdates');
        return params;
      },
      { replace: true }
    );
    void check();
  }, [checkRequested, check, setSearchParams]);

  let hint = t('settings.updatesHint');
  if (phase === 'installing')
    hint = t('settings.autoInstallingUpdate', { version: update?.version });
  else if (update?.state === 'unpublished') hint = t('settings.noPublishedUpdates');
  else if (update?.state === 'unconfigured') hint = t('settings.updateSigningMissing');
  else if (update?.state === 'manual') hint = t('settings.manualUpdates');
  else if (update?.state === 'up_to_date') hint = t('settings.upToDate', { version });

  return (
    <SettingRow label={t('settings.updates')} hint={hint} isLast>
      <Box sx={{ gap: 0.5, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          {t('settings.currentVersion', { version })}
        </Typography>
        <Button
          size="small"
          color="inherit"
          variant="outlined"
          disabled={phase !== 'idle'}
          onClick={check}
          startIcon={phase !== 'idle' ? <CircularProgress color="inherit" size={14} /> : undefined}
        >
          {t(
            update?.state === 'manual'
              ? 'settings.openDownloads'
              : phase === 'checking'
                ? 'settings.checkingUpdates'
                : phase === 'installing'
                  ? 'settings.installingUpdate'
                  : 'settings.checkUpdates'
          )}
        </Button>
        {phase === 'installing' && <LinearProgress sx={{ width: 1 }} />}
        {error && (
          <Typography sx={{ color: 'error.main', fontSize: 12, maxWidth: 280 }}>
            {t('settings.updateFailed')}: {error}
          </Typography>
        )}
      </Box>
    </SettingRow>
  );
}

function SegmentedPicker<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (val: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <Box
      sx={(theme) => ({
        p: '3px',
        gap: 0.5,
        display: 'flex',
        borderRadius: '10px',
        bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
      })}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Box
            key={opt.value}
            component="button"
            type="button"
            onClick={() => onChange(opt.value)}
            sx={(theme) => ({
              px: 1.5,
              height: 30,
              border: 0,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              borderRadius: '8px',
              fontFamily: 'inherit',
              color: active ? 'text.primary' : 'text.secondary',
              bgcolor: active ? 'background.paper' : 'transparent',
              boxShadow: active ? theme.vars.customShadows.z1 : 'none',
            })}
          >
            {opt.label}
          </Box>
        );
      })}
    </Box>
  );
}

function LockedSwitch() {
  return (
    <Box
      sx={{
        width: 38,
        height: 22,
        opacity: 0.55,
        flexShrink: 0,
        borderRadius: '11px',
        position: 'relative',
        bgcolor: 'primary.main',
        cursor: 'not-allowed',
      }}
    >
      <Box
        sx={{
          top: 4,
          left: 20,
          width: 14,
          height: 14,
          borderRadius: '50%',
          position: 'absolute',
          bgcolor: '#FFFFFF',
        }}
      />
    </Box>
  );
}
