import type { UiPullRequest, PullRequestDetails } from 'src/services/wakeline';

import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';
import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import ToggleButton from '@mui/material/ToggleButton';
import useMediaQuery from '@mui/material/useMediaQuery';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { openExternal, getPullRequestDetails } from 'src/services/wakeline';

import { parseDiff, splitDiff, highlightCode, type DiffLine } from './pr-diff';

export function PullRequestDialog({ pr, onClose }: { pr: UiPullRequest; onClose: () => void }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<PullRequestDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const compact = useMediaQuery('(max-width: 900px)', { noSsr: true });
  const [layout, setLayout] = useState<'split' | 'unified'>(compact ? 'unified' : 'split');

  useEffect(() => {
    let active = true;
    getPullRequestDetails(pr.project, pr.number).then(
      (value) => {
        if (active) setDetail(value);
      },
      (cause) => {
        if (active) setError(String(cause));
      }
    );
    return () => {
      active = false;
    };
  }, [pr.project, pr.number]);

  return (
    <Dialog open fullWidth maxWidth="xl" onClose={onClose} aria-labelledby="pr-detail-title">
      <DialogTitle id="pr-detail-title">
        #{pr.number} {pr.title}
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error">{error}</Alert>}
        {!detail && !error && <Typography>{t('common.loading')}</Typography>}
        {detail && (
          <>
            <Typography sx={{ whiteSpace: 'pre-wrap', mb: 3 }}>
              {detail.body || t('pullRequests.noDescription')}
            </Typography>
            <Typography sx={{ mb: 2, fontWeight: 700 }}>
              {t('pullRequests.changedFiles', { count: detail.files.length })}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={layout}
                onChange={(_, value) => value && setLayout(value)}
                aria-label={t('pullRequests.diffLayout')}
              >
                <ToggleButton value="split">{t('pullRequests.split')}</ToggleButton>
                <ToggleButton value="unified">{t('pullRequests.unified')}</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" sx={{ color: 'error.main' }}>
                − {t('pullRequests.removed')}
              </Typography>
              <Typography variant="caption" sx={{ color: 'success.main' }}>
                + {t('pullRequests.added')}
              </Typography>
            </Box>
            {detail.files.map((file) => (
              <Box key={file.filename} sx={{ mb: 3 }}>
                <Typography sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere', mb: 1 }}>
                  {file.filename}{' '}
                  <Box component="span" sx={{ color: 'success.main' }}>
                    +{file.additions}
                  </Box>{' '}
                  <Box component="span" sx={{ color: 'error.main' }}>
                    −{file.deletions}
                  </Box>
                </Typography>
                {file.patch ? (
                  <DiffLines patch={file.patch} filename={file.filename} layout={layout} />
                ) : (
                  <Typography color="text.secondary">{t('pullRequests.noPatch')}</Typography>
                )}
              </Box>
            ))}
            <Typography color="text.secondary" sx={{ fontSize: 12 }}>
              {t('pullRequests.diffNotice')}
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => openExternal(pr.url)}>{t('pullRequests.openGithub')}</Button>
        <Button onClick={onClose}>{t('account.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function DiffLines({
  patch,
  filename,
  layout,
}: {
  patch: string;
  filename: string;
  layout: 'split' | 'unified';
}) {
  const { t } = useTranslation();
  const lines = useMemo(() => parseDiff(patch), [patch]);
  const html = useMemo(
    () => new Map(lines.map((line) => [line, highlightCode(line.code, filename)])),
    [lines, filename]
  );
  return (
    <Box
      sx={(theme) => ({
        overflowX: 'auto',
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        fontFamily: 'Consolas, monospace',
        fontSize: 12,
        lineHeight: 1.8,
        '& .diff-added': { bgcolor: varAlpha(theme.vars.palette.success.mainChannel, 0.14) },
        '& .diff-removed': { bgcolor: varAlpha(theme.vars.palette.error.mainChannel, 0.14) },
        '& .diff-hunk, & .diff-note': {
          bgcolor: varAlpha(theme.vars.palette.info.mainChannel, 0.12),
          color: 'text.secondary',
        },
        '& .hljs-keyword, & .hljs-selector-tag, & .hljs-literal': { color: 'secondary.main' },
        '& .hljs-string, & .hljs-attr': { color: 'success.main' },
        '& .hljs-comment, & .hljs-quote': { color: 'text.secondary', fontStyle: 'italic' },
        '& .hljs-number, & .hljs-built_in, & .hljs-type': { color: 'warning.main' },
        '& .hljs-title, & .hljs-property': { color: 'info.main' },
      })}
    >
      <Box
        component="table"
        sx={{
          borderCollapse: 'collapse',
          width: 1,
          tableLayout: layout === 'split' ? 'fixed' : 'auto',
          minWidth: layout === 'split' ? 900 : 320,
        }}
      >
        {layout === 'split' && (
          <thead>
            <tr>
              <Box
                component="th"
                sx={{
                  textAlign: 'left',
                  px: 2,
                  py: 1,
                  color: 'text.secondary',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {t('pullRequests.before')}
              </Box>
              <Box
                component="th"
                sx={{
                  textAlign: 'left',
                  px: 2,
                  py: 1,
                  color: 'text.secondary',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {t('pullRequests.after')}
              </Box>
            </tr>
          </thead>
        )}
        <tbody>
          {layout === 'split'
            ? splitDiff(lines).map((row, index) => (
                <tr key={index}>
                  {row.left?.kind === 'hunk' || row.left?.kind === 'note' ? (
                    <Box
                      component="td"
                      className={`diff-${row.left.kind}`}
                      colSpan={2}
                      sx={{ px: 2, py: 0.5, whiteSpace: 'pre' }}
                    >
                      {row.left.code}
                    </Box>
                  ) : (
                    <>
                      <DiffCell
                        line={row.left}
                        side="old"
                        html={row.left ? html.get(row.left) : ''}
                      />
                      <DiffCell
                        line={row.right}
                        side="new"
                        html={row.right ? html.get(row.right) : ''}
                      />
                    </>
                  )}
                </tr>
              ))
            : lines.map((line, index) => (
                <tr key={index}>
                  <DiffCell line={line} side="both" html={html.get(line)} />
                </tr>
              ))}
        </tbody>
      </Box>
    </Box>
  );
}

function DiffCell({
  line,
  side,
  html,
}: {
  line: DiffLine | null;
  side: 'old' | 'new' | 'both';
  html?: string;
}) {
  const changed = line?.kind === 'added' || line?.kind === 'removed';
  return (
    <Box
      component="td"
      className={line ? `diff-${line.kind}` : undefined}
      sx={{
        p: 0,
        verticalAlign: 'top',
        borderRight: side === 'old' ? '1px solid' : undefined,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', minHeight: '1.8em' }}>
        {(side === 'old' || side === 'both') && (
          <Box
            component="span"
            sx={{
              width: 48,
              flexShrink: 0,
              textAlign: 'right',
              px: 1,
              color: 'text.secondary',
              userSelect: 'none',
            }}
          >
            {line?.oldNumber}
          </Box>
        )}
        {(side === 'new' || side === 'both') && (
          <Box
            component="span"
            sx={{
              width: 48,
              flexShrink: 0,
              textAlign: 'right',
              px: 1,
              color: 'text.secondary',
              userSelect: 'none',
            }}
          >
            {line?.newNumber}
          </Box>
        )}
        <Box
          component="span"
          sx={{
            width: 20,
            flexShrink: 0,
            color: changed
              ? line.kind === 'added'
                ? 'success.main'
                : 'error.main'
              : 'text.secondary',
            userSelect: 'none',
            fontWeight: 700,
          }}
        >
          {line?.kind === 'added' ? '+' : line?.kind === 'removed' ? '−' : ''}
        </Box>
        <Box
          component="code"
          sx={{
            m: 0,
            pr: 2,
            font: 'inherit',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            color: 'text.primary',
            flex: 1,
            minWidth: 0,
          }}
          dangerouslySetInnerHTML={{ __html: html ?? '' }}
        />
      </Box>
    </Box>
  );
}
