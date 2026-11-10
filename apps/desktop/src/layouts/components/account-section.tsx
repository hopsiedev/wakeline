import type { AccountInfo } from 'src/services/wakeline';

import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';
import { useRef, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Menu from '@mui/material/Menu';
import Avatar from '@mui/material/Avatar';
import Dialog from '@mui/material/Dialog';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

import { useRouter } from 'src/routes/hooks';

import { quitApp, REPO_URL, fetchAccount, openExternal } from 'src/services/wakeline';

import { AppIcon } from 'src/components/nav-icon';

// ----------------------------------------------------------------------

const LOCAL_NAME_KEY = 'wakeline-local-name';

/** Atajos que la app escucha (ver `use-shortcuts.ts`). */
export const SHORTCUTS = [
  { keys: 'Ctrl + B', labelKey: 'account.shortcutToggle' },
  { keys: 'Ctrl + ,', labelKey: 'account.shortcutSettings' },
] as const;

type AccountSectionProps = {
  collapsed?: boolean;
};

export function AccountSection({ collapsed = false }: AccountSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [localName, setLocalName] = useState(() => localStorage.getItem(LOCAL_NAME_KEY) ?? '');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [connAnchor, setConnAnchor] = useState<HTMLElement | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Ancla estable: el elemento del menú desaparece al cerrarlo.
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetchAccount().then((info) => alive && setAccount(info));
    return () => {
      alive = false;
    };
  }, []);

  const github = account?.github ?? null;
  const displayName = github?.name || github?.login || localName || t('account.you');
  const initials = displayName.slice(0, 1).toUpperCase();
  const connectionsOk =
    !!account && (account.claude_code || account.codex_mcp || account.antigravity_mcp);

  const renameLocal = () => {
    const value = window.prompt(t('account.renamePrompt'), localName);
    if (value !== null) {
      const trimmed = value.trim();
      localStorage.setItem(LOCAL_NAME_KEY, trimmed);
      setLocalName(trimmed);
    }
  };

  const reportProblem = () => {
    const body = encodeURIComponent(
      `\n\n---\nWakeline ${account?.version ?? ''} · ${navigator.userAgent}`
    );
    openExternal(`${REPO_URL}/issues/new?body=${body}`);
  };

  const closeMenu = () => setMenuAnchor(null);

  const avatar = (
    <Avatar
      src={github?.avatar_url}
      alt={displayName}
      sx={{ width: 30, height: 30, fontSize: 13, fontWeight: 700, bgcolor: 'primary.dark' }}
    >
      {initials}
    </Avatar>
  );

  const connectionsButton = (
    <Tooltip title={t('account.connections')} placement={collapsed ? 'right' : 'top'}>
      <IconButton
        size="small"
        aria-label={t('account.connections')}
        onClick={(e) => {
          setConnAnchor(e.currentTarget);
          fetchAccount(true).then(setAccount);
        }}
        sx={{
          width: 30,
          height: 30,
          borderRadius: 1,
          color: 'text.secondary',
          position: 'relative',
        }}
      >
        <AppIcon name="plug" size={17} />
        {account && (
          <Box
            component="span"
            sx={(theme) => ({
              top: 5,
              right: 5,
              width: 7,
              height: 7,
              borderRadius: '50%',
              position: 'absolute',
              bgcolor: connectionsOk ? 'success.main' : 'error.main',
              boxShadow: `0 0 0 2px ${theme.vars.palette.background.default}`,
            })}
          />
        )}
      </IconButton>
    </Tooltip>
  );

  const settingsButton = (
    <Tooltip title={t('account.settings')} placement={collapsed ? 'right' : 'top'}>
      <IconButton
        size="small"
        aria-label={t('account.settings')}
        onClick={() => router.push('/settings')}
        sx={{ width: 30, height: 30, borderRadius: 1, color: 'text.secondary' }}
      >
        <AppIcon name="settings" size={17} />
      </IconButton>
    </Tooltip>
  );

  return (
    <>
      <Box
        ref={rowRef}
        sx={(theme) => ({
          mt: 'auto',
          pt: 1.25,
          gap: 0.5,
          display: 'flex',
          alignItems: 'center',
          flexDirection: collapsed ? 'column' : 'row',
          borderTop: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.14)}`,
        })}
      >
        <Box
          component="button"
          type="button"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={(theme) => ({
            p: 0.5,
            gap: 1.25,
            border: 0,
            minWidth: 0,
            flexGrow: 1,
            display: 'flex',
            cursor: 'pointer',
            borderRadius: 1,
            alignItems: 'center',
            color: 'text.primary',
            bgcolor: 'transparent',
            fontFamily: 'inherit',
            '&:hover': { bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.1) },
          })}
        >
          {avatar}
          {!collapsed && (
            <Typography
              noWrap
              component="span"
              sx={{ fontSize: 14, fontWeight: 600, textAlign: 'left' }}
            >
              {displayName}
            </Typography>
          )}
        </Box>

        {connectionsButton}
        {settingsButton}
      </Box>

      {/* Menú de la cuenta */}
      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'top', horizontal: collapsed ? 'right' : 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 270, mt: -1, '& .MuiMenuItem-root': { gap: 1.5 } } } }}
      >
        <Box sx={{ px: 1.5, py: 1, gap: 1.5, display: 'flex', alignItems: 'center' }}>
          {avatar}
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>
              {displayName}
            </Typography>
            <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
              {github
                ? `@${github.login} · ${t('account.githubAccount')}`
                : t('account.localProfile')}
            </Typography>
          </Box>
        </Box>
        {!github && (
          <Typography sx={{ px: 1.5, pb: 1, fontSize: 12, color: 'text.secondary' }}>
            {t('account.githubMissing')}
          </Typography>
        )}
        {!github && (
          <MenuItem
            onClick={() => {
              closeMenu();
              renameLocal();
            }}
          >
            <AppIcon name="user" size={17} />
            {t('account.rename')}
          </MenuItem>
        )}
        <Divider />
        <MenuItem
          onClick={() => {
            closeMenu();
            setConnAnchor(rowRef.current);
            fetchAccount(true).then(setAccount);
          }}
        >
          <AppIcon name="plug" size={17} />
          {t('account.connections')}
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeMenu();
            router.push('/settings');
          }}
        >
          <AppIcon name="settings" size={17} />
          {t('account.settings')}
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeMenu();
            setShortcutsOpen(true);
          }}
        >
          <AppIcon name="keyboard" size={17} />
          {t('account.shortcuts')}
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            closeMenu();
            router.push('/settings?checkUpdates=1');
          }}
        >
          <AppIcon name="refresh" size={17} />
          <Box>
            <Typography sx={{ fontSize: 14 }}>{t('account.checkUpdates')}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              {t('account.version', { version: account?.version ?? '…' })}
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeMenu();
            reportProblem();
          }}
        >
          <AppIcon name="help" size={17} />
          {t('account.report')}
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => quitApp()} sx={{ color: 'error.main' }}>
          <AppIcon name="logout" size={17} />
          {t('account.quit')}
        </MenuItem>
      </Menu>

      {/* Conexiones */}
      <Menu
        anchorEl={connAnchor}
        open={!!connAnchor}
        onClose={() => setConnAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 250 } } }}
      >
        <Typography
          sx={{ px: 1.5, py: 0.75, fontSize: 12, fontWeight: 700, color: 'text.disabled' }}
        >
          {t('account.connections').toUpperCase()}
        </Typography>
        <ConnectionRow label={t('account.claudeCode')} ok={!!account?.claude_code} t={t} />
        <ConnectionRow label={t('account.codex')} ok={!!account?.codex_mcp} t={t} />
        <ConnectionRow label={t('account.antigravity')} ok={!!account?.antigravity_mcp} t={t} />
        <ConnectionRow
          label={t('account.github')}
          detail={github ? `@${github.login}` : undefined}
          ok={!!github}
          t={t}
        />
        <ConnectionRow label={t('account.ollama')} ok={!!account?.ollama} optional t={t} />
      </Menu>

      {/* Atajos de teclado */}
      <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('account.shortcuts')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.5 }}>
          {SHORTCUTS.map((s) => (
            <Box key={s.keys} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography sx={{ flexGrow: 1, fontSize: 14 }}>{t(s.labelKey)}</Typography>
              <Box
                component="kbd"
                sx={(theme) => ({
                  px: 1,
                  py: 0.25,
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 0.75,
                  fontFamily: 'inherit',
                  bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
                })}
              >
                {s.keys}
              </Box>
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShortcutsOpen(false)}>{t('account.close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// ----------------------------------------------------------------------

function ConnectionRow({
  label,
  detail,
  ok,
  optional,
  t,
}: {
  label: string;
  detail?: string;
  ok: boolean;
  optional?: boolean;
  t: (key: string) => string;
}) {
  const color = ok ? 'success.main' : optional ? 'text.disabled' : 'error.main';
  return (
    <Box sx={{ px: 1.5, py: 0.75, gap: 1.25, display: 'flex', alignItems: 'center' }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Typography sx={{ flexGrow: 1, fontSize: 14 }}>{label}</Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
        {detail ??
          (ok
            ? t('account.connected')
            : optional
              ? t('account.optional')
              : t('account.notConnected'))}
      </Typography>
    </Box>
  );
}
