import type { UiPullRequest, PullRequestDetails } from 'src/services/wakeline';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

import { openExternal, getPullRequestDetails } from 'src/services/wakeline';

export function PullRequestDialog({ pr, onClose }: { pr: UiPullRequest; onClose: () => void }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<PullRequestDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <Dialog open fullWidth maxWidth="lg" onClose={onClose} aria-labelledby="pr-detail-title">
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
                  <DiffLines patch={file.patch} />
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

function DiffLines({ patch }: { patch: string }) {
  let oldLine = 0;
  let newLine = 0;
  return (
    <Box sx={{ overflowX: 'auto', bgcolor: 'background.neutral', borderRadius: 1, p: 1 }}>
      {patch.split('\n').map((line, index) => {
        const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
        if (hunk) {
          oldLine = Number(hunk[1]);
          newLine = Number(hunk[2]);
        }
        const added = !hunk && line.startsWith('+');
        const removed = !hunk && line.startsWith('-');
        const content = !hunk && !line.startsWith('\\');
        const oldNumber = content && !added ? oldLine++ : '';
        const newNumber = content && !removed ? newLine++ : '';
        return (
          <Box
            key={index}
            sx={{
              display: 'flex',
              width: 'max-content',
              minWidth: 1,
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.7,
              whiteSpace: 'pre',
              color: added ? 'success.main' : removed ? 'error.main' : 'text.secondary',
            }}
          >
            <Box
              component="span"
              sx={{ width: 48, flexShrink: 0, textAlign: 'right', pr: 1, userSelect: 'none' }}
            >
              {oldNumber}
            </Box>
            <Box
              component="span"
              sx={{ width: 48, flexShrink: 0, textAlign: 'right', pr: 2, userSelect: 'none' }}
            >
              {newNumber}
            </Box>
            <Box component="span">{line}</Box>
          </Box>
        );
      })}
    </Box>
  );
}
