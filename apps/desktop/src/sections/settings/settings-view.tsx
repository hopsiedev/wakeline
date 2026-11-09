import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';

import { DashboardContent } from 'src/layouts/dashboard';
import { getMcpExecutable, sendTestNotification } from 'src/services/wakeline';
import { type Language, alertsEnabled, changeLanguage, setAlertsEnabled } from 'src/locales/i18n';

import { Label } from 'src/components/label';
import { AppIcon } from 'src/components/nav-icon';

// ----------------------------------------------------------------------

type Mode = 'dark' | 'light' | 'system';
type LlmMode = 'off' | 'ollama' | 'api';

export function SettingsView() {
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useColorScheme();
  const [llmMode, setLlmMode] = useState<LlmMode>('off');
  const [startWithWin, setStartWithWin] = useState(true);
  const [claudeEnabled, setClaudeEnabled] = useState(true);
  const [githubEnabled, setGithubEnabled] = useState(true);
  const [winToast, setWinToast] = useState(alertsEnabled);
  const [testError, setTestError] = useState<string | null>(null);
  const [mcpExecutable, setMcpExecutable] = useState<string | null>(null);
  const [trayBadge, setTrayBadge] = useState(true);
  const [dailySummary, setDailySummary] = useState(false);

  const currentLang: Language = i18n.language.startsWith('en') ? 'en' : 'es';
  const currentMode: Mode = (mode as Mode) ?? 'dark';

  useEffect(() => {
    getMcpExecutable().then(setMcpExecutable);
  }, []);

  const mcpCommand = mcpExecutable ?? 'wakeline';
  const mcpConfigs = [
    { label: 'Claude Code', text: `claude mcp add wakeline -- "${mcpCommand}" mcp` },
    { label: 'Codex', text: `codex mcp add wakeline -- "${mcpCommand}" mcp` },
    {
      label: 'Antigravity · ~/.gemini/config/mcp_config.json',
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
                    { value: 'es', label: 'Español' },
                    { value: 'en', label: 'English' },
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

              <SettingRow
                label={t('settings.startWithWindows')}
                hint={t('settings.startWithWindowsHint')}
              >
                <Switch
                  checked={startWithWin}
                  onChange={(e) => setStartWithWin(e.target.checked)}
                />
              </SettingRow>

              <SettingRow
                label={t('settings.exportPath')}
                hint={t('settings.exportPathHint')}
                isLast
              >
                <Label color="default" sx={{ fontFamily: 'monospace' }}>
                  docs/TODO.md
                </Label>
              </SettingRow>
            </Card>

            {/* Inteligencia (opcional) */}
            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                {t('settings.llmTitle')}
              </Typography>
              <Typography sx={{ mt: 0.25, mb: 2.5, color: 'text.secondary', fontSize: 14 }}>
                {t('settings.llmSub')}
              </Typography>

              <Box sx={{ gap: 1.5, display: 'flex', flexDirection: 'column' }}>
                {(
                  [
                    ['off', t('settings.llmOff'), t('settings.llmOffHint')],
                    ['ollama', t('settings.llmOllama'), t('settings.llmOllamaHint')],
                    ['api', t('settings.llmApi'), t('settings.llmApiHint')],
                  ] as const
                ).map(([key, title, hint]) => {
                  const selected = llmMode === key;
                  return (
                    <Box
                      key={key}
                      onClick={() => setLlmMode(key)}
                      sx={(theme) => ({
                        p: 2,
                        gap: 1.75,
                        display: 'flex',
                        cursor: 'pointer',
                        borderRadius: 1.5,
                        alignItems: 'flex-start',
                        border: '1px solid',
                        borderColor: selected ? 'primary.main' : 'divider',
                        boxShadow: selected
                          ? `inset 0 0 0 1px ${theme.vars.palette.primary.main}`
                          : 'none',
                        bgcolor: selected
                          ? varAlpha(theme.vars.palette.primary.mainChannel, 0.06)
                          : 'transparent',
                      })}
                    >
                      <Box
                        sx={{
                          mt: 0.25,
                          width: 20,
                          height: 20,
                          flexShrink: 0,
                          borderRadius: '50%',
                          display: 'grid',
                          placeItems: 'center',
                          border: '2px solid',
                          borderColor: selected ? 'primary.main' : 'text.disabled',
                        }}
                      >
                        {selected && (
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: 'primary.main',
                            }}
                          />
                        )}
                      </Box>

                      <Box>
                        <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{title}</Typography>
                        <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>
                          {hint}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}

                <Box
                  sx={(theme) => ({
                    mt: 1,
                    px: 1.75,
                    height: 54,
                    display: 'flex',
                    position: 'relative',
                    alignItems: 'center',
                    borderRadius: 1,
                    opacity: llmMode === 'ollama' ? 1 : 0.5,
                    color: 'text.secondary',
                    border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.32)}`,
                  })}
                >
                  <Box
                    component="span"
                    sx={{
                      top: -9,
                      left: 10,
                      px: 0.5,
                      fontSize: 12,
                      fontWeight: 600,
                      position: 'absolute',
                      color: 'text.secondary',
                      bgcolor: 'background.paper',
                    }}
                  >
                    {t('settings.ollamaModelLegend')}
                  </Box>
                  <span>{t('settings.ollamaModelHint')}</span>
                  <Box component="span" sx={{ ml: 'auto' }}>
                    ▾
                  </Box>
                </Box>
              </Box>
            </Card>

            {/* Fuentes */}
            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                {t('settings.sourcesTitle')}
              </Typography>
              <Typography sx={{ mt: 0.25, mb: 1.5, color: 'text.secondary', fontSize: 14 }}>
                {t('settings.sourcesSub')}
              </Typography>

              <SettingRow label={t('settings.claudeSource')} hint={t('settings.claudeSourceHint')}>
                <Switch
                  checked={claudeEnabled}
                  onChange={(e) => setClaudeEnabled(e.target.checked)}
                />
              </SettingRow>

              <SettingRow
                label={t('settings.cursorSource')}
                hint={t('settings.cursorSourceHint')}
                dimmed
              >
                <Label color="default">{t('common.soon')}</Label>
              </SettingRow>

              <SettingRow label={t('settings.githubSource')} hint={t('settings.githubSourceHint')}>
                <Switch
                  checked={githubEnabled}
                  onChange={(e) => setGithubEnabled(e.target.checked)}
                />
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
                hint={t('settings.historyStartHint')}
                isLast
              >
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  sx={(theme) => ({
                    height: 30,
                    px: 1.25,
                    fontSize: 13,
                    fontWeight: 700,
                    borderColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.32),
                  })}
                >
                  {t('settings.importAll')}
                </Button>
              </SettingRow>
            </Card>
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
                <Box
                  sx={{
                    gap: 0.5,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                  }}
                >
                  <Box sx={{ gap: 1, display: 'flex', alignItems: 'center' }}>
                    <Button
                      size="small"
                      color="inherit"
                      variant="outlined"
                      disabled={!winToast}
                      onClick={async () => {
                        try {
                          await sendTestNotification();
                          setTestError(null);
                        } catch (error) {
                          setTestError(String(error));
                        }
                      }}
                    >
                      {t('settings.alertsTest')}
                    </Button>
                    <Switch
                      checked={winToast}
                      onChange={(e) => {
                        setWinToast(e.target.checked);
                        setAlertsEnabled(e.target.checked);
                      }}
                    />
                  </Box>
                  {testError && (
                    <Typography sx={{ color: 'error.main', fontSize: 12, maxWidth: 280 }}>
                      {t('settings.alertsTestFailed')}: {testError}
                    </Typography>
                  )}
                </Box>
              </SettingRow>

              <SettingRow label={t('settings.alertsTray')} hint={t('settings.alertsTrayHint')}>
                <Switch checked={trayBadge} onChange={(e) => setTrayBadge(e.target.checked)} />
              </SettingRow>

              <SettingRow
                label={t('settings.alertsDaily')}
                hint={t('settings.alertsDailyHint')}
                isLast
              >
                <Switch
                  checked={dailySummary}
                  onChange={(e) => setDailySummary(e.target.checked)}
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
                {[
                  '~/.claude/sessions/',
                  '**/.env · **/.env.*',
                  'opencode.db · tablas account, credential',
                ].map((rule) => (
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
                ))}
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
                <Box key={config.label} sx={{ mb: 1.5 }}>
                  <Typography sx={{ mb: 0.5, fontSize: 13, fontWeight: 600 }}>
                    {config.label}
                  </Typography>
                  <Box
                    component="pre"
                    sx={(theme) => ({
                      py: 1.5,
                      px: 2,
                      mb: 0.5,
                      borderRadius: 1.5,
                      overflowX: 'auto',
                      fontFamily: 'monospace',
                      fontSize: 12.5,
                      color: 'text.primary',
                      bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
                      border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.18)}`,
                    })}
                  >
                    {config.text}
                  </Box>
                  <Button size="small" onClick={() => navigator.clipboard?.writeText(config.text)}>
                    {t('settings.copyConfig')}
                  </Button>
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
