import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Switch from '@mui/material/Switch';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { DashboardContent } from 'src/layouts/dashboard';
import { type Language, changeLanguage } from 'src/locales/i18n';

import { Label } from 'src/components/label';

// ----------------------------------------------------------------------

type Mode = 'dark' | 'light' | 'system';
type LlmMode = 'off' | 'ollama' | 'api';

export function SettingsView() {
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useColorScheme();
  const [llmMode, setLlmMode] = useState<LlmMode>('off');
  const [startWithWin, setStartWithWin] = useState(true);
  const [winToast, setWinToast] = useState(true);
  const [trayBadge, setTrayBadge] = useState(true);

  return (
    <DashboardContent maxWidth="xl">
      <Typography variant="h4" sx={{ mb: 4 }}>
        {t('settings.title')}
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
            <Card sx={{ p: 3 }}>
              <Typography variant="h6">{t('settings.general')}</Typography>
              <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                {t('settings.generalSub')}
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

              <Divider sx={{ borderStyle: 'dashed' }} />

              <SettingRow
                label={t('settings.startWithWindows')}
                hint={t('settings.startWithWindowsHint')}
              >
                <Switch
                  checked={startWithWin}
                  onChange={(e) => setStartWithWin(e.target.checked)}
                />
              </SettingRow>

              <Divider sx={{ borderStyle: 'dashed' }} />

              <SettingRow label={t('settings.exportPath')} hint={t('settings.exportPathHint')}>
                <Label color="default" sx={{ fontFamily: 'monospace' }}>
                  docs/TODO.md
                </Label>
              </SettingRow>
            </Card>

            <Card sx={{ p: 3 }}>
              <Typography variant="h6">{t('settings.llmTitle')}</Typography>
              <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
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
                      sx={{
                        p: 2,
                        cursor: 'pointer',
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: selected ? 'primary.main' : 'divider',
                        bgcolor: (theme) =>
                          selected
                            ? varAlpha(theme.vars.palette.primary.mainChannel, 0.06)
                            : 'transparent',
                      }}
                    >
                      <Typography variant="subtitle2">{title}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {hint}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Card>

            <Card sx={{ p: 3 }}>
              <Typography variant="h6">{t('settings.sourcesTitle')}</Typography>
              <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                {t('settings.sourcesSub')}
              </Typography>

              <SettingRow label={t('settings.claudeSource')} hint={t('settings.claudeSourceHint')}>
                <Switch defaultChecked />
              </SettingRow>

              <Divider sx={{ borderStyle: 'dashed' }} />

              <SettingRow label={t('settings.githubSource')} hint={t('settings.githubSourceHint')}>
                <Switch defaultChecked />
              </SettingRow>

              <Divider sx={{ borderStyle: 'dashed' }} />

              <SettingRow label={t('settings.otherAgents')} hint={t('settings.otherAgentsHint')}>
                <Label color="default">{t('common.soon')}</Label>
              </SettingRow>
            </Card>
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
            <Card sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {t('settings.alertsTitle')}
              </Typography>

              <SettingRow label={t('settings.alertsWin')} hint={t('settings.alertsWinHint')}>
                <Switch checked={winToast} onChange={(e) => setWinToast(e.target.checked)} />
              </SettingRow>

              <Divider sx={{ borderStyle: 'dashed' }} />

              <SettingRow label={t('settings.alertsTray')} hint={t('settings.alertsTrayHint')}>
                <Switch checked={trayBadge} onChange={(e) => setTrayBadge(e.target.checked)} />
              </SettingRow>
            </Card>

            <Card sx={{ p: 3 }}>
              <Typography variant="h6">{t('settings.exclusionsTitle')}</Typography>
              <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                {t('settings.exclusionsSub')}
              </Typography>

              <Box sx={{ gap: 1, display: 'flex', flexDirection: 'column', mb: 2 }}>
                {[
                  '~/.claude/sessions/',
                  '**/.env · **/.env.*',
                  'opencode.db · tablas account, credential, control_account',
                ].map((rule) => (
                  <Box
                    key={rule}
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderRadius: 1,
                      bgcolor: '#101010',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontFamily: 'monospace',
                      fontSize: 12.5,
                    }}
                  >
                    <span>{rule}</span>
                    <Switch checked disabled size="small" />
                  </Box>
                ))}
              </Box>

              <Alert severity="warning">{t('settings.redactNotice')}</Alert>
            </Card>

            <Card sx={{ p: 3 }}>
              <Box sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h6">{t('settings.mcpTitle')}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {t('settings.mcpSub')}
                  </Typography>
                </Box>
                <Label color="success">{t('common.active')}</Label>
              </Box>

              <Box
                sx={{
                  p: 1.5,
                  mb: 1.5,
                  borderRadius: 1,
                  bgcolor: '#101010',
                  fontFamily: 'monospace',
                  fontSize: 12.5,
                }}
              >
                claude mcp add wakeline -- wakeline mcp
              </Box>

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
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ py: 1.75, gap: 2, display: 'flex', alignItems: 'center' }}>
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
