import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';
import { useMemo, useState, useEffect } from 'react';

import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Tabs from '@mui/material/Tabs';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import ToggleButton from '@mui/material/ToggleButton';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import TableContainer from '@mui/material/TableContainer';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { DashboardContent } from 'src/layouts/dashboard';
import {
  type UiCard,
  type CardKind,
  type CardStatus,
  createManualCard,
  updateCardStatus,
  fetchDashboardData,
} from 'src/services/wakeline';

import { Label } from 'src/components/label';

// ----------------------------------------------------------------------

type ViewMode = 'table' | 'kanban';
type TypeFilter = 'all' | CardKind;

export function CardsView() {
  const { t } = useTranslation();
  const [cards, setCards] = useState<UiCard[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedCard, setSelectedCard] = useState<UiCard | null>(null);
  const [copiedNote, setCopiedNote] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKind, setNewKind] = useState<CardKind>('task');
  const [newProject, setNewProject] = useState('Contastack');

  const loadCards = () => {
    fetchDashboardData().then((res) => {
      setCards(res.cards);
    });
  };

  useEffect(() => {
    loadCards();
  }, []);

  const filtered = useMemo(
    () =>
      cards.filter((c) => {
        if (typeFilter !== 'all' && c.kind !== typeFilter) return false;
        if (projectFilter !== 'all' && c.project !== projectFilter) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          return (
            c.title.toLowerCase().includes(q) ||
            c.location.toLowerCase().includes(q) ||
            c.branch.toLowerCase().includes(q)
          );
        }
        return true;
      }),
    [cards, typeFilter, projectFilter, search]
  );

  const handleStatusChange = async (card: UiCard, status: CardStatus) => {
    await updateCardStatus(card.fingerprint, status);
    setCards((prev) =>
      prev.map((c) => (c.fingerprint === card.fingerprint ? { ...c, status } : c))
    );
    if (selectedCard?.fingerprint === card.fingerprint) {
      setSelectedCard({ ...card, status });
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await createManualCard(newTitle, newKind, newProject);
    setNewTitle('');
    setCreateOpen(false);
    loadCards();
  };

  const copyText = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedNote(t('common.copied'));
    setTimeout(() => setCopiedNote(null), 2500);
  };

  if (selectedCard) {
    return (
      <DashboardContent maxWidth="xl">
        <Button
          variant="text"
          color="inherit"
          onClick={() => setSelectedCard(null)}
          sx={{ mb: 2, alignSelf: 'flex-start' }}
        >
          ‹ {t('cards.backToCards')} · {selectedCard.short_id}
        </Button>

        {copiedNote && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {copiedNote}
          </Alert>
        )}

        <Box
          sx={{
            mb: 3,
            gap: 2,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ maxWidth: 760 }}>
            <Box sx={{ mb: 1, gap: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
              <KindBadge kind={selectedCard.kind} />
              <StatusBadge status={selectedCard.status} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {selectedCard.short_id} · {selectedCard.project}
              </Typography>
            </Box>
            <Typography variant="h4" sx={{ mb: 1 }}>
              {selectedCard.title}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('cards.seenTimes', { count: selectedCard.occurrences })} · {t('cards.firstSeen')}{' '}
              {selectedCard.first_seen} · {t('cards.lastSeen')} {selectedCard.last_seen}
            </Typography>
          </Box>

          <Box sx={{ gap: 1, display: 'flex', flexWrap: 'wrap' }}>
            {selectedCard.session_id && (
              <Button
                variant="outlined"
                color="inherit"
                onClick={() => copyText(`claude --resume ${selectedCard.session_id}`)}
              >
                {t('cards.resumeSession')}
              </Button>
            )}
            <Button
              variant="contained"
              color="primary"
              onClick={() =>
                copyText(
                  `Proyecto: ${selectedCard.project} (${selectedCard.branch})\nOrigen: ${selectedCard.location}\nPendiente: ${selectedCard.title}`
                )
              }
            >
              {t('cards.copyPrompt')}
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => handleStatusChange(selectedCard, 'accepted')}
            >
              {t('common.accept')}
            </Button>
            <Button
              variant="outlined"
              color="success"
              onClick={() => handleStatusChange(selectedCard, 'done')}
            >
              {t('common.markDone')}
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={() => handleStatusChange(selectedCard, 'dismissed')}
            >
              {t('common.dismiss')}
            </Button>
          </Box>
        </Box>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Card sx={{ p: 3 }}>
              <Typography variant="h6">{t('cards.aiQuoteTitle')}</Typography>
              <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                {t('cards.aiQuoteSubtitle')} · {selectedCard.location}
              </Typography>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1.5,
                  borderLeft: '3px solid',
                  borderColor: selectedCard.kind === 'error' ? 'error.main' : 'primary.main',
                  bgcolor: (theme) => varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
                }}
              >
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  «{selectedCard.title}»
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ mt: 1, display: 'block', color: 'text.secondary' }}
                >
                  {selectedCard.source_label} · {selectedCard.last_seen}
                </Typography>
              </Box>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {t('cards.metaTitle')}
              </Typography>
              <Box sx={{ gap: 1.5, display: 'flex', flexDirection: 'column' }}>
                <MetaRow label={t('cards.project')} value={selectedCard.project} />
                <MetaRow label={t('cards.metaBranch')} value={selectedCard.branch} mono />
                <MetaRow label={t('cards.metaOrigin')} value={selectedCard.source_label} />
                <MetaRow label={t('cards.metaLocation')} value={selectedCard.location} mono />
                <MetaRow
                  label={t('cards.metaClosure')}
                  value={
                    selectedCard.source_kind === 'session' ||
                    selectedCard.source_kind === 'document'
                      ? t('cards.metaClosureHuman')
                      : t('cards.metaClosureAuto')
                  }
                />
                <MetaRow label={t('cards.metaFingerprint')} value={selectedCard.fingerprint} mono />
              </Box>
            </Card>

            <Alert severity="info">{t('cards.ollamaNotice')}</Alert>
          </Grid>
        </Grid>
      </DashboardContent>
    );
  }

  return (
    <DashboardContent maxWidth="xl">
      <Box
        sx={{
          mb: 3,
          gap: 2,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Typography variant="h4">{t('cards.title')}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('cards.subtitle')}
          </Typography>
        </Box>

        <Box sx={{ gap: 1.5, display: 'flex', alignItems: 'center' }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={viewMode}
            onChange={(_, val: ViewMode | null) => val && setViewMode(val)}
          >
            <ToggleButton value="table">{t('cards.table')}</ToggleButton>
            <ToggleButton value="kanban">{t('cards.kanban')}</ToggleButton>
          </ToggleButtonGroup>

          <Button variant="contained" color="primary" onClick={() => setCreateOpen(true)}>
            + {t('cards.newCard')}
          </Button>
        </Box>
      </Box>

      <Card sx={{ mb: 3 }}>
        <Tabs
          value={typeFilter}
          onChange={(_, val: TypeFilter) => setTypeFilter(val)}
          sx={{ px: 2.5, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="all" label={`${t('common.all')} (${cards.length})`} />
          <Tab
            value="error"
            label={`${t('common.error')} (${cards.filter((c) => c.kind === 'error').length})`}
          />
          <Tab
            value="task"
            label={`${t('common.task')} (${cards.filter((c) => c.kind === 'task').length})`}
          />
          <Tab
            value="idea"
            label={`${t('common.idea')} (${cards.filter((c) => c.kind === 'idea').length})`}
          />
        </Tabs>

        <Box sx={{ p: 2.5, gap: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
          <Select
            size="small"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">{t('common.all')}</MenuItem>
            <MenuItem value="Contastack">Contastack</MenuItem>
            <MenuItem value="app-expo">app-expo</MenuItem>
            <MenuItem value="wakeline">wakeline</MenuItem>
          </Select>

          <TextField
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('cards.searchPlaceholder')}
            sx={{ flexGrow: 1 }}
          />

          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            <b>{filtered.length}</b> {t('cards.results')}
          </Typography>
        </Box>

        {viewMode === 'table' && (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('cards.colCard')}</TableCell>
                  <TableCell>{t('cards.colType')}</TableCell>
                  <TableCell>{t('cards.colSource')}</TableCell>
                  <TableCell align="right">{t('cards.colOccurrences')}</TableCell>
                  <TableCell>{t('cards.colStatus')}</TableCell>
                  <TableCell>{t('cards.colLastSeen')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.slice(0, 60).map((card) => (
                  <TableRow
                    hover
                    key={card.fingerprint}
                    onClick={() => setSelectedCard(card)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ maxWidth: 520 }}>
                      <Typography variant="subtitle2" noWrap>
                        {card.title}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontFamily: 'monospace' }}
                      >
                        {card.project} · {card.location}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <KindBadge kind={card.kind} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {card.source_label}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="subtitle2">×{card.occurrences}</Typography>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={card.status} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {card.last_seen}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {viewMode === 'kanban' && (
        <Grid container spacing={2.5}>
          {(['new', 'accepted', 'done', 'dismissed'] as const).map((st) => {
            const colCards = filtered.filter((c) => c.status === st);
            return (
              <Grid key={st} size={{ xs: 12, sm: 6, md: 3 }}>
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: (theme) => varAlpha(theme.vars.palette.grey['500Channel'], 0.06),
                  }}
                >
                  <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <StatusBadge status={st} />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      ({colCards.length})
                    </Typography>
                  </Box>

                  <Box sx={{ gap: 1.5, display: 'flex', flexDirection: 'column' }}>
                    {colCards.slice(0, 20).map((card) => (
                      <Card
                        key={card.fingerprint}
                        onClick={() => setSelectedCard(card)}
                        sx={{ p: 2, cursor: 'pointer' }}
                      >
                        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                          <KindBadge kind={card.kind} />
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            ×{card.occurrences}
                          </Typography>
                        </Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          {card.title}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', fontFamily: 'monospace' }}
                        >
                          {card.project} · {card.branch}
                        </Typography>
                      </Card>
                    ))}
                  </Box>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('cards.newCard')}</DialogTitle>
        <DialogContent sx={{ pt: 2, gap: 2, display: 'flex', flexDirection: 'column' }}>
          <TextField
            autoFocus
            fullWidth
            label={t('cards.newCardTitle')}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            sx={{ mt: 1 }}
          />
          <Box sx={{ gap: 2, display: 'flex' }}>
            <Select
              fullWidth
              size="small"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as CardKind)}
            >
              <MenuItem value="task">{t('common.task')}</MenuItem>
              <MenuItem value="error">{t('common.error')}</MenuItem>
              <MenuItem value="idea">{t('common.idea')}</MenuItem>
            </Select>
            <Select
              fullWidth
              size="small"
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
            >
              <MenuItem value="Contastack">Contastack</MenuItem>
              <MenuItem value="app-expo">app-expo</MenuItem>
              <MenuItem value="wakeline">wakeline</MenuItem>
            </Select>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setCreateOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="contained" onClick={handleCreate}>
            {t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

function KindBadge({ kind }: { kind: CardKind }) {
  const { t } = useTranslation();
  if (kind === 'error') return <Label color="error">{t('common.error')}</Label>;
  if (kind === 'idea') return <Label color="secondary">{t('common.idea')}</Label>;
  return <Label color="info">{t('common.task')}</Label>;
}

function StatusBadge({ status }: { status: CardStatus }) {
  const { t } = useTranslation();
  if (status === 'new') return <Label color="warning">{t('common.new')}</Label>;
  if (status === 'done') return <Label color="success">{t('common.done')}</Label>;
  if (status === 'dismissed') return <Label color="error">{t('common.dismissed')}</Label>;
  return <Label color="default">{t('common.accepted')}</Label>;
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          textAlign: 'right',
          wordBreak: 'break-all',
          ...(mono && { fontFamily: 'monospace', fontSize: 12 }),
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
