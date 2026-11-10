import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';
import { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Drawer from '@mui/material/Drawer';
import Select from '@mui/material/Select';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import InputLabel from '@mui/material/InputLabel';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import LinearProgress from '@mui/material/LinearProgress';
import TablePagination from '@mui/material/TablePagination';

import { DashboardContent } from 'src/layouts/dashboard';
import {
  type UiCard,
  originLabel,
  openInVscode,
  openExternal,
  type CardKind,
  type CardStatus,
  createManualCard,
  updateCardStatus,
  updateCardsStatus,
  chooseWatchFolder,
  fetchDashboardData,
  getImportingFolder,
  resumeClaudeSession,
  type UiProjectSummary,
} from 'src/services/wakeline';

import { Label } from 'src/components/label';
import { EvidenceMarkdown } from 'src/components/evidence-markdown';
import { AppIcon, type AppIconName } from 'src/components/nav-icon';

import { type SourceFilter, type StatusFilter, matchesCardFilters } from './card-filters';
import { toggleCardSelection, togglePageSelection, selectedStatusInputs } from './card-selection';

// ----------------------------------------------------------------------

type ViewMode = 'table' | 'kanban';
type TypeFilter = 'all' | CardKind;

export function CardsView() {
  const { t } = useTranslation();
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [cards, setCards] = useState<UiCard[]>([]);
  const [projects, setProjects] = useState<UiProjectSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [importingFolder, setImportingFolder] = useState<string | null>(() => getImportingFolder());
  const [watchError, setWatchError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedCard, setSelectedCard] = useState<UiCard | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [resumedSession, setResumedSession] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKind, setNewKind] = useState<CardKind>('task');
  const [newProject, setNewProject] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const loadCards = (force = false) => {
    fetchDashboardData({ force }).then((res) => {
      setCards(res.cards);
      setProjects(res.projects);
      setLoaded(true);
      setNewProject((current) =>
        res.projects.some((project) => project.name === current)
          ? current
          : (res.projects[0]?.name ?? '')
      );
    });
  };

  useEffect(() => {
    loadCards();
    const onRescan = () => loadCards(true);
    const onImporting = (event: Event) => {
      const custom = event as CustomEvent<string | null>;
      setImportingFolder(custom.detail ?? null);
    };
    window.addEventListener('wakeline:rescan', onRescan);
    window.addEventListener('wakeline:importing', onImporting);
    return () => {
      window.removeEventListener('wakeline:rescan', onRescan);
      window.removeEventListener('wakeline:importing', onImporting);
    };
  }, []);

  // El Detalle se abre en `/cards/<huella>` (Q49). La huella no cambia entre escaneos,
  // así que el enlace sirve desde el MCP o desde otra pantalla. `?detail=` queda por
  // compatibilidad con enlaces viejos.
  const detailId = routeId ?? searchParams.get('detail');
  useEffect(() => {
    if (!detailId) {
      setSelectedCard(null);
      return;
    }
    if (!loaded) return;
    setSelectedCard(
      cards.find(
        (c) =>
          c.fingerprint === detailId || c.fingerprints.includes(detailId) || c.short_id === detailId
      ) ?? null
    );
  }, [detailId, cards, loaded]);

  const openDetail = (card: UiCard) => {
    setSelectedCard(card);
    navigate(`/cards/${card.fingerprint}`);
  };

  const scopedCards = useMemo(
    () =>
      cards.filter((card) =>
        matchesCardFilters(card, {
          kind: 'all',
          project: projectFilter,
          source: sourceFilter,
          status: statusFilter,
          search,
        })
      ),
    [cards, projectFilter, sourceFilter, statusFilter, search]
  );
  const filtered = useMemo(
    () => scopedCards.filter((card) => typeFilter === 'all' || card.kind === typeFilter),
    [scopedCards, typeFilter]
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1));
  const pageCards = filtered.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage);
  const pageIds = pageCards.map((card) => card.fingerprint);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));
  const selectedCards = filtered.filter((card) => selected.has(card.fingerprint));
  useEffect(() => setPage(0), [typeFilter, projectFilter, sourceFilter, statusFilter, search]);
  useEffect(() => {
    const visible = new Set(filtered.map((card) => card.fingerprint));
    setSelected((previous) => {
      const next = new Set([...previous].filter((id) => visible.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [filtered]);

  const changeSelectedStatus = async (status: CardStatus) => {
    setBulkBusy(true);
    setBulkError(null);
    const inputs = selectedStatusInputs(filtered, selected, status);
    try {
      await updateCardsStatus(inputs);
      const changed = new Set(inputs.map((input) => input.fingerprint));
      setCards((previous) =>
        previous.map((card) => (changed.has(card.fingerprint) ? { ...card, status } : card))
      );
      setSelected(new Set());
    } catch (error) {
      setBulkError(String(error));
    } finally {
      setBulkBusy(false);
    }
  };

  const sourceOptions = [
    { value: 'all', label: t('common.all') },
    { value: 'code', label: t('sources.code') },
    { value: 'session', label: t('sources.session') },
    { value: 'github', label: t('github.title') },
    { value: 'document', label: t('cards.sourceDocuments') },
  ] as const;
  const statusOptions = [
    { value: 'all', label: t('common.all') },
    { value: 'open', label: t('cards.openStatuses') },
    ...(['new', 'accepted', 'done', 'dismissed'] as const).map((value) => ({
      value,
      label: t(`common.${value}`),
    })),
  ];

  const handleStatusChange = async (card: UiCard, status: CardStatus) => {
    await updateCardStatus(card.fingerprint, status, card.fingerprints);
    setCards((prev) =>
      prev.map((c) => (c.fingerprint === card.fingerprint ? { ...c, status } : c))
    );
    if (selectedCard?.fingerprint === card.fingerprint) {
      setSelectedCard({ ...card, status });
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newProject) return;
    await createManualCard(newTitle, newKind, newProject);
    setNewTitle('');
    setCreateOpen(false);
    loadCards();
  };

  const copyPromptText = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 1400);
  };

  const handleResumeSession = (card: UiCard) => {
    const cmd = card.session_id ? `claude --resume ${card.session_id}` : 'claude --continue';
    navigator.clipboard?.writeText(cmd);
    setResumedSession(true);
    setTimeout(() => setResumedSession(false), 1400);
    resumeClaudeSession(card);
  };

  const closeDetail = () => {
    setSelectedCard(null);
    navigate('/cards');
  };

  const detail = selectedCard ? (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          mb: 1.5,
          gap: 1.25,
          display: 'flex',
          alignItems: 'center',
          fontSize: 14,
          color: 'text.disabled',
        }}
      >
        <Box
          component="button"
          type="button"
          onClick={closeDetail}
          sx={{
            p: 0,
            border: 0,
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: 'inherit',
            bgcolor: 'transparent',
            color: 'text.secondary',
            '&:hover': { color: 'text.primary' },
          }}
        >
          ‹ {t('cards.backToCards')}
        </Box>
        <Box
          component="i"
          sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.disabled' }}
        />
        <Box component="b" sx={{ color: 'text.primary', fontWeight: 400 }}>
          {selectedCard.short_id}
        </Box>
      </Box>
      <Box
        sx={{
          mb: 3,
          gap: 2,
          display: 'flex',
          alignItems: 'flex-start',
        }}
      >
        <Box sx={{ maxWidth: 740, minWidth: 0 }}>
          <Box sx={{ gap: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <KindBadge kind={selectedCard.kind} />
            <StatusBadge status={selectedCard.status} />
            <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>
              {selectedCard.short_id} · {selectedCard.project}
            </Typography>
          </Box>

          <Typography sx={{ mt: 0.75, mb: 1, fontSize: 24, fontWeight: 700, lineHeight: 1.4 }}>
            {selectedCard.title}
          </Typography>

          <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>
            {t('cards.seenPrefix')}{' '}
            <Box component="b" sx={{ color: 'text.primary' }}>
              {t('cards.seenTimes', { count: selectedCard.occurrences })}
            </Box>{' '}
            · {t('cards.firstSeen')} {selectedCard.first_seen} · {t('cards.lastSeen')}{' '}
            {selectedCard.last_seen}
          </Typography>
        </Box>

        <Box
          sx={{
            gap: 1,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-start',
          }}
        >
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => openInVscode(selectedCard)}
            startIcon={<AppIcon name="vscode" size={18} />}
            sx={(theme) => ({
              height: 36,
              px: 1.75,
              fontWeight: 700,
              borderColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.32),
            })}
          >
            {t('cards.openVscode')}
          </Button>

          <Button
            variant="outlined"
            color="inherit"
            onClick={() => handleResumeSession(selectedCard)}
            startIcon={<AppIcon name={resumedSession ? 'check' : 'play'} size={18} />}
            sx={(theme) => ({
              height: 36,
              px: 1.75,
              fontWeight: 700,
              borderColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.32),
            })}
          >
            {t('cards.resumeSession')}
          </Button>

          <Button
            variant="contained"
            color="primary"
            onClick={() =>
              copyPromptText(
                [
                  `${t('cards.promptProject')}: ${selectedCard.project} (${selectedCard.branch})`,
                  `${t('cards.promptOrigin')}: ${selectedCard.location}`,
                  `${t('cards.promptPending')}: ${selectedCard.title}`,
                  selectedCard.evidence &&
                    `${t('cards.promptEvidence')}:\n${selectedCard.evidence}`,
                  selectedCard.code_excerpt &&
                    `${t('cards.promptCode')}:\n${selectedCard.code_excerpt}`,
                ]
                  .filter(Boolean)
                  .join('\n\n')
              )
            }
            startIcon={<AppIcon name={copiedPrompt ? 'check' : 'copy'} size={18} />}
            sx={{ height: 36, px: 1.75, fontWeight: 700 }}
          >
            {copiedPrompt ? t('common.copied') : t('cards.copyPrompt')}
          </Button>

          <Button
            color="inherit"
            onClick={() =>
              handleStatusChange(
                selectedCard,
                selectedCard.status === 'accepted' ? 'done' : 'accepted'
              )
            }
            sx={(theme) => ({
              height: 36,
              px: 1.75,
              fontWeight: 700,
              bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
            })}
          >
            {selectedCard.status === 'accepted'
              ? t('common.markDone')
              : selectedCard.status === 'done'
                ? t('common.done')
                : t('common.accept')}
          </Button>

          <Button
            onClick={async () => {
              await handleStatusChange(selectedCard, 'dismissed');
              closeDetail();
            }}
            sx={{
              height: 36,
              px: 1.75,
              fontWeight: 700,
              color: 'error.main',
              bgcolor: 'rgba(255, 86, 48, 0.16)',
              '&:hover': { bgcolor: 'rgba(255, 86, 48, 0.24)' },
            }}
          >
            {t('common.dismiss')}
          </Button>
        </Box>
      </Box>
      <Grid container spacing={3}>
        <Grid size={12}>
          <Card sx={{ p: 3 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{t('cards.whereTitle')}</Typography>
            <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 14 }}>
              {selectedCard.location}
            </Typography>
            {selectedCard.code_excerpt ? (
              <CodeExcerptBlock code={selectedCard.code_excerpt} location={selectedCard.location} />
            ) : !selectedCard.evidence ? (
              <Typography sx={{ mt: 2, color: 'text.secondary', fontSize: 13 }}>
                {t(
                  /[/\\]/.test(selectedCard.location)
                    ? 'cards.unreadableFile'
                    : 'cards.noCodeExcerpt'
                )}
              </Typography>
            ) : null}
          </Card>
        </Grid>
        <Grid size={12}>
          <Card sx={{ p: 3 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{t('cards.metaTitle')}</Typography>
            <Box sx={{ mt: 2, gap: 1.5, display: 'grid', fontSize: 14 }}>
              <Box>
                <b>{t('cards.project')}:</b> {selectedCard.project}
              </Box>
              <Box>
                <b>{t('cards.metaBranch')}:</b> {selectedCard.branch}
              </Box>
              <Box>
                <b>{t('cards.metaOrigin')}:</b>
                {selectedCard.origins.length > 1 ? (
                  <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                    {selectedCard.origins.map((origin) => (
                      <li key={origin.fingerprint}>
                        {originLabel(t, origin.source_kind, origin.source_label)}
                        {origin.location ? ` · ${origin.location}` : ''}
                        {origin.url && (
                          <Box
                            component="button"
                            type="button"
                            onClick={() => openExternal(origin.url ?? '')}
                            sx={{
                              ml: 0.75,
                              p: 0,
                              border: 0,
                              cursor: 'pointer',
                              fontSize: 'inherit',
                              fontFamily: 'inherit',
                              color: 'primary.main',
                              bgcolor: 'transparent',
                            }}
                          >
                            {t('cards.openOnGithub')}
                          </Box>
                        )}
                      </li>
                    ))}
                  </Box>
                ) : (
                  ` ${originLabel(t, selectedCard.source_kind, selectedCard.source_label)}`
                )}
                {selectedCard.origins.length <= 1 && selectedCard.url && (
                  <Button
                    size="small"
                    color="inherit"
                    variant="outlined"
                    onClick={() => openExternal(selectedCard.url ?? '')}
                    sx={{ ml: 1 }}
                  >
                    {t('cards.openOnGithub')}
                  </Button>
                )}
              </Box>
              <Box>
                <b>{t('cards.whereTitle')}:</b> {selectedCard.location}
              </Box>
              {selectedCard.session_id && (
                <Box sx={{ overflowWrap: 'anywhere' }}>
                  <b>{t('cards.metaSession')}:</b> {selectedCard.session_id}
                </Box>
              )}
              <Box sx={{ overflowWrap: 'anywhere', color: 'text.secondary', fontSize: 12 }}>
                <b>{t('cards.metaFingerprint')}:</b> {selectedCard.fingerprint}
              </Box>
            </Box>
          </Card>
        </Grid>
        {selectedCard.evidence && (
          <Grid size={12}>
            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                {selectedCard.kind === 'error' ? t('cards.errorOutput') : t('cards.sourceEvidence')}
              </Typography>
              <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 13 }}>
                {originLabel(t, selectedCard.source_kind, selectedCard.source_label)}
                {selectedCard.session_id ? ` · ${selectedCard.session_id}` : ''}
              </Typography>
              {selectedCard.kind !== 'error' ? (
                <EvidenceMarkdown text={selectedCard.evidence} />
              ) : (
                <Box
                  component="pre"
                  sx={(theme) => ({
                    mt: 2,
                    p: 2,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    borderRadius: 1.5,
                    fontSize: 12.5,
                    lineHeight: 1.7,
                    color: selectedCard.kind === 'error' ? 'error.main' : 'text.primary',
                    bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
                  })}
                >
                  {selectedCard.evidence}
                </Box>
              )}
            </Card>
          </Grid>
        )}
        <Grid size={12}>
          <Card sx={{ p: 3 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
              {t('cards.occurrencesTitle')}
            </Typography>
            <Typography sx={{ mt: 1, fontSize: 30, fontWeight: 700 }}>
              {selectedCard.occurrences}
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>
              {t('cards.firstSeen')} {selectedCard.first_seen} · {t('cards.lastSeen')}{' '}
              {selectedCard.last_seen}
            </Typography>
          </Card>
        </Grid>
      </Grid>
    </Box>
  ) : null;

  const errTotal = scopedCards.filter((c) => c.kind === 'error').length;
  const taskTotal = scopedCards.filter((c) => c.kind === 'task').length;
  const ideaTotal = scopedCards.filter((c) => c.kind === 'idea').length;

  return (
    <DashboardContent maxWidth={false}>
      <Box
        sx={{
          mb: 4,
          gap: 2,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.5 }}>
            {t('cards.title')}
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
              {t('cards.title')}
            </Box>
          </Box>
        </Box>

        <Box sx={{ gap: 1, display: 'flex', alignItems: 'center' }}>
          <Box
            sx={(theme) => ({
              p: '4px',
              gap: '4px',
              display: 'flex',
              borderRadius: '10px',
              bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
            })}
          >
            {(
              [
                ['table', 'table', t('cards.table')],
                ['kanban', 'kanban', t('cards.kanban')],
              ] as const
            ).map(([modeKey, ico, lbl]) => {
              const active = viewMode === modeKey;
              return (
                <Box
                  key={modeKey}
                  component="button"
                  type="button"
                  onClick={() => setViewMode(modeKey)}
                  sx={(theme) => ({
                    px: 1.5,
                    height: 40,
                    border: 0,
                    gap: 0.75,
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    color: active ? 'text.primary' : 'text.disabled',
                    bgcolor: active ? 'background.paper' : 'transparent',
                    boxShadow: active ? theme.vars.customShadows.z1 : 'none',
                  })}
                >
                  <AppIcon name={ico} size={18} />
                  {lbl}
                </Box>
              );
            })}
          </Box>

          <Button
            variant="contained"
            disabled={projects.length === 0}
            onClick={() => setCreateOpen(true)}
            startIcon={<AppIcon name="plus" size={18} />}
            sx={{
              height: 48,
              px: 1.75,
              borderRadius: 1,
              fontWeight: 700,
              bgcolor: 'text.primary',
              color: 'background.paper',
              '&:hover': { bgcolor: 'text.secondary' },
            }}
          >
            {t('cards.newCard')}
          </Button>
        </Box>
      </Box>

      {watchError && <Typography sx={{ mb: 2, color: 'error.main' }}>{watchError}</Typography>}

      {importingFolder && (
        <Card
          sx={(theme) => ({
            p: 2.5,
            mb: 3,
            border: `1px solid ${varAlpha(theme.vars.palette.primary.mainChannel, 0.28)}`,
            bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.06),
          })}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                {t('pullRequests.importingFolder')}: {importingFolder.split(/[/\\]/).pop()}
              </Typography>
              <Typography sx={{ mt: 0.25, fontSize: 12.5, color: 'text.secondary' }}>
                {t('pullRequests.importingFolderSub')}
              </Typography>
            </Box>
          </Box>
          <LinearProgress sx={{ mt: 1.5, height: 6, borderRadius: 1 }} />
        </Card>
      )}

      {loaded && !importingFolder && projects.length === 0 && (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ fontWeight: 600 }}>{t('pullRequests.noWatchedFolders')}</Typography>
          <Button
            sx={{ mt: 2 }}
            onClick={() => chooseWatchFolder().catch((error) => setWatchError(String(error)))}
          >
            {t('pullRequests.watchFolder')}
          </Button>
        </Card>
      )}

      {projects.length > 0 && (
        <Card sx={{ mb: viewMode === 'kanban' ? 3 : 0 }}>
          {/* Pestañas por tipo */}
          <Box
            sx={(theme) => ({
              px: 2.5,
              gap: 5,
              display: 'flex',
              boxShadow: `inset 0 -2px 0 ${varAlpha(theme.vars.palette.grey['500Channel'], 0.2)}`,
            })}
          >
            {(
              [
                ['all', t('common.all'), scopedCards.length, 'default'],
                ['error', t('common.errors'), errTotal, 'error'],
                ['task', t('common.tasks'), taskTotal, 'info'],
                ['idea', t('common.ideas'), ideaTotal, 'secondary'],
              ] as const
            ).map(([key, lbl, count, color]) => {
              const active = typeFilter === key;
              return (
                <Box
                  key={key}
                  component="button"
                  type="button"
                  onClick={() => setTypeFilter(key)}
                  sx={{
                    p: 0,
                    height: 48,
                    border: 0,
                    gap: 1,
                    display: 'flex',
                    cursor: 'pointer',
                    position: 'relative',
                    alignItems: 'center',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    bgcolor: 'transparent',
                    color: active ? 'text.primary' : 'text.secondary',
                    ...(active && {
                      '&::after': {
                        content: '""',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 2,
                        position: 'absolute',
                        bgcolor: 'text.primary',
                      },
                    }),
                  }}
                >
                  <span>{lbl}</span>
                  <Label color={color} variant={key === 'all' ? 'filled' : 'soft'}>
                    {count}
                  </Label>
                </Box>
              );
            })}
          </Box>

          {/* Barra de herramientas */}
          <Box sx={{ p: 2.5, gap: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
            <Select
              size="small"
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              inputProps={{ 'aria-label': t('cards.project') }}
              sx={{ width: 200, height: 54 }}
            >
              <MenuItem value="all">{t('common.all')}</MenuItem>
              {projects.map((project) => (
                <MenuItem key={project.path} value={project.name}>
                  {project.name}
                </MenuItem>
              ))}
            </Select>

            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel id="cards-source-label">{t('cards.source')}</InputLabel>
              <Select
                labelId="cards-source-label"
                label={t('cards.source')}
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
                sx={{ height: 54 }}
              >
                {sourceOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="cards-status-label">{t('cards.colStatus')}</InputLabel>
              <Select
                labelId="cards-status-label"
                label={t('cards.colStatus')}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                sx={{ height: 54 }}
              >
                {statusOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box
              sx={(theme) => ({
                flexGrow: 1,
                height: 54,
                px: 1.75,
                gap: 1,
                display: 'flex',
                alignItems: 'center',
                borderRadius: 1,
                color: 'text.secondary',
                border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.32)}`,
              })}
            >
              <AppIcon name="search" size={20} />
              <Box
                component="input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('cards.searchPlaceholder')}
                aria-label={t('cards.searchPlaceholder')}
                sx={{
                  border: 0,
                  outline: 'none',
                  flexGrow: 1,
                  font: 'inherit',
                  color: 'text.primary',
                  bgcolor: 'transparent',
                }}
              />
            </Box>
          </Box>

          {/* Chips de filtros activos */}
          <Box
            sx={{
              px: 2.5,
              pb: 2.5,
              gap: 1,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              fontSize: 13,
              color: 'text.secondary',
            }}
          >
            <Box component="b" sx={{ color: 'text.primary' }}>
              {filtered.length}
            </Box>{' '}
            {t('cards.results')} ·
            {statusFilter !== 'all' && (
              <FilterChip
                text={`${t('cards.colStatus')}: ${statusOptions.find((option) => option.value === statusFilter)?.label}`}
                onDelete={() => setStatusFilter('all')}
              />
            )}
            {projectFilter !== 'all' && (
              <FilterChip
                text={`${t('cards.chipProject')}: ${projectFilter === 'all' ? t('common.all') : projectFilter}`}
                onDelete={() => setProjectFilter('all')}
              />
            )}
            {sourceFilter !== 'all' && (
              <FilterChip
                text={`${t('cards.source')}: ${sourceOptions.find((option) => option.value === sourceFilter)?.label}`}
                onDelete={() => setSourceFilter('all')}
              />
            )}
            {typeFilter !== 'all' && (
              <FilterChip text={t(`common.${typeFilter}`)} onDelete={() => setTypeFilter('all')} />
            )}
            {search.trim() && <FilterChip text={search.trim()} onDelete={() => setSearch('')} />}
            <Button
              size="small"
              onClick={() => {
                setTypeFilter('all');
                setProjectFilter('all');
                setSourceFilter('all');
                setStatusFilter('all');
                setSearch('');
              }}
              sx={{ color: 'error.main', fontWeight: 700, fontSize: 13 }}
            >
              {t('common.clear')}
            </Button>
          </Box>

          {/* Tabla limpia sin barra horizontal */}
          <Box
            sx={{ px: 2.5, pb: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}
          >
            <Typography sx={{ mr: 1, fontSize: 13, fontWeight: 600 }} aria-live="polite">
              {t('cards.selectedCount', { count: selectedCards.length })}
            </Typography>
            <Button
              size="small"
              disabled={bulkBusy || !filtered.length}
              onClick={() => setSelected(new Set(filtered.map((card) => card.fingerprint)))}
            >
              {t('cards.selectResults', { count: filtered.length })}
            </Button>
            {selectedCards.length > 0 && (
              <>
                <Button size="small" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
                  {t('cards.clearSelection')}
                </Button>
                <Button
                  size="small"
                  disabled={bulkBusy}
                  onClick={() => changeSelectedStatus('accepted')}
                >
                  {t('common.accept')}
                </Button>
                <Button
                  size="small"
                  disabled={bulkBusy}
                  onClick={() => changeSelectedStatus('done')}
                >
                  {t('common.markDone')}
                </Button>
                <Button
                  size="small"
                  color="error"
                  disabled={bulkBusy}
                  onClick={() => changeSelectedStatus('dismissed')}
                >
                  {t('common.dismiss')}
                </Button>
              </>
            )}
          </Box>
          {bulkBusy && <LinearProgress aria-label={t('cards.updatingSelected')} />}
          {bulkError && (
            <Alert severity="error" sx={{ mx: 2.5, mb: 2 }}>
              {bulkError}
            </Alert>
          )}
          {viewMode === 'table' && (
            <>
              <Table sx={{ width: 1, borderCollapse: 'collapse' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 48 }}>
                      <Checkbox
                        checked={allPageSelected}
                        indeterminate={!allPageSelected && somePageSelected}
                        disabled={bulkBusy || !pageIds.length}
                        onChange={() =>
                          setSelected((previous) => togglePageSelection(previous, pageIds))
                        }
                        slotProps={{ input: { 'aria-label': t('cards.selectPage') } }}
                      />
                    </TableCell>
                    <TableCell>{t('cards.colCard')}</TableCell>
                    <TableCell>{t('cards.colType')}</TableCell>
                    <TableCell>{t('cards.colSource')}</TableCell>
                    <TableCell align="right">{t('cards.colOccurrences')}</TableCell>
                    <TableCell>{t('cards.colStatus')}</TableCell>
                    <TableCell>{t('cards.colLastSeen')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pageCards.map((card, idx) => (
                    <TableRow
                      hover
                      key={card.fingerprint}
                      selected={selected.has(card.fingerprint)}
                      onClick={() => openDetail(card)}
                      sx={{
                        cursor: 'pointer',
                        ...(idx === 0 &&
                          typeFilter === 'all' && {
                            bgcolor: 'rgba(0, 167, 111, 0.08)',
                          }),
                      }}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(card.fingerprint)}
                          disabled={bulkBusy}
                          onChange={() =>
                            setSelected((previous) =>
                              toggleCardSelection(previous, card.fingerprint)
                            )
                          }
                          slotProps={{
                            input: { 'aria-label': t('cards.selectCard', { title: card.title }) },
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{card.title}</Typography>
                        <Typography
                          sx={{ color: 'text.disabled', fontSize: 12, fontFamily: 'monospace' }}
                        >
                          {card.short_id} · {card.location}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <KindBadge kind={card.kind} />
                      </TableCell>
                      <TableCell>
                        <SourcePill card={card} />
                      </TableCell>
                      <TableCell align="right">
                        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                          ×{card.occurrences}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={card.status} />
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>
                          {card.last_seen}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                        {t('cards.noResults')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <TablePagination
                component="div"
                count={filtered.length}
                page={currentPage}
                rowsPerPage={rowsPerPage}
                rowsPerPageOptions={[10, 25, 50]}
                onPageChange={(_, value) => setPage(value)}
                onRowsPerPageChange={(event) => {
                  setRowsPerPage(Number(event.target.value));
                  setPage(0);
                }}
                labelRowsPerPage={t('cards.rowsPerPageLabel')}
                labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
                getItemAriaLabel={(type) =>
                  t(type === 'next' ? 'cards.nextPage' : 'cards.previousPage')
                }
              />
            </>
          )}
        </Card>
      )}

      {viewMode === 'kanban' && projects.length > 0 && (
        <Grid container spacing={3}>
          {(
            [
              ['new', t('common.newPlural'), 'warning'],
              ['accepted', t('common.acceptedPlural'), 'default'],
              ['done', t('common.donePlural'), 'success'],
              ['dismissed', t('common.dismissedPlural'), 'default'],
            ] as const
          ).map(([st, colTitle, colColor]) => {
            const colCards = filtered.filter((c) => c.status === st);
            return (
              <Grid key={st} size={{ xs: 12, sm: 6, md: 3 }}>
                <Box
                  sx={(theme) => ({
                    p: 2,
                    gap: 1.5,
                    display: 'flex',
                    borderRadius: 2,
                    flexDirection: 'column',
                    bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.06),
                  })}
                >
                  <Box
                    sx={{ px: 0.5, gap: 1, display: 'flex', alignItems: 'center', fontWeight: 600 }}
                  >
                    <span>{colTitle}</span>
                    <Label color={colColor}>{colCards.length}</Label>
                  </Box>

                  {colCards.map((card) => (
                    <Card
                      key={card.fingerprint}
                      onClick={() => openDetail(card)}
                      sx={{
                        p: 2,
                        gap: 1.25,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        outline: selected.has(card.fingerprint) ? '2px solid' : 'none',
                        outlineColor: 'primary.main',
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <KindBadge kind={card.kind} />
                        <Checkbox
                          checked={selected.has(card.fingerprint)}
                          disabled={bulkBusy}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() =>
                            setSelected((previous) =>
                              toggleCardSelection(previous, card.fingerprint)
                            )
                          }
                          slotProps={{
                            input: { 'aria-label': t('cards.selectCard', { title: card.title }) },
                          }}
                        />
                      </Box>
                      <Typography sx={{ fontWeight: 600, fontSize: 14, lineHeight: 1.45 }}>
                        {card.title}
                      </Typography>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <SourcePill card={card} />
                        <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>
                          {card.occurrences > 1 ? `×${card.occurrences} · ` : ''}
                          {card.short_id}
                        </Typography>
                      </Box>
                    </Card>
                  ))}
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
              {projects.map((project) => (
                <MenuItem key={project.path} value={project.name}>
                  {project.name}
                </MenuItem>
              ))}
            </Select>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setCreateOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newProject}>
            {t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>
      <Drawer
        anchor="right"
        open={selectedCard !== null}
        onClose={closeDetail}
        slotProps={{ paper: { sx: { width: { xs: 1, md: 760 }, maxWidth: 1 } } }}
      >
        {detail}
      </Drawer>
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

function KindBadge({ kind }: { kind: CardKind }) {
  const { t } = useTranslation();
  if (kind === 'error') {
    return (
      <Label color="error" sx={{ gap: 0.75 }}>
        <AppIcon name="bug" size={14} />
        {t('common.error')}
      </Label>
    );
  }
  if (kind === 'idea') {
    return (
      <Label color="secondary" sx={{ gap: 0.75 }}>
        <AppIcon name="idea" size={14} />
        {t('common.idea')}
      </Label>
    );
  }
  return (
    <Label color="info" sx={{ gap: 0.75 }}>
      <AppIcon name="task" size={14} />
      {t('common.task')}
    </Label>
  );
}

function StatusBadge({ status }: { status: CardStatus }) {
  const { t } = useTranslation();
  if (status === 'new') return <Label color="warning">{t('common.new')}</Label>;
  if (status === 'done') return <Label color="success">{t('common.done')}</Label>;
  if (status === 'dismissed') return <Label color="default">{t('common.dismissed')}</Label>;
  return <Label color="default">{t('common.accepted')}</Label>;
}

function sourceIcon(kind: UiCard['source_kind']): AppIconName {
  if (kind === 'comment' || kind === 'command') return 'code';
  if (kind === 'document') return 'doc';
  if (kind === 'pull_request') return 'pr';
  if (kind === 'issue') return 'issue';
  return 'chat';
}

// Un chip por origen: «tsc · CI» cuando la tarjeta junta varios (Q62).
function SourcePill({ card }: { card: UiCard }) {
  const { t } = useTranslation();
  const origins =
    card.origins.length > 0
      ? card.origins
      : [{ source_kind: card.source_kind, source_label: card.source_label }];

  return (
    <Box component="span" sx={{ gap: 1, display: 'inline-flex', alignItems: 'center' }}>
      {origins.map((origin, idx) => (
        <Box
          key={`${origin.source_label}-${idx}`}
          component="span"
          sx={{
            gap: 0.75,
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 13,
            color: 'text.secondary',
            whiteSpace: 'nowrap',
          }}
        >
          <AppIcon name={sourceIcon(origin.source_kind)} size={16} />
          {originLabel(t, origin.source_kind, origin.source_label)}
        </Box>
      ))}
    </Box>
  );
}

function FilterChip({ text, onDelete }: { text: string; onDelete: () => void }) {
  return <Chip label={text} onDelete={onDelete} size="small" />;
}

const CODE_KEYWORDS = new Set([
  'import',
  'from',
  'export',
  'default',
  'type',
  'interface',
  'const',
  'let',
  'var',
  'function',
  'return',
  'async',
  'await',
  'if',
  'else',
  'for',
  'while',
  'switch',
  'case',
  'break',
  'continue',
  'try',
  'catch',
  'finally',
  'throw',
  'new',
  'class',
  'extends',
  'implements',
  'true',
  'false',
  'null',
  'undefined',
  'fn',
  'pub',
  'use',
  'mod',
  'struct',
  'enum',
  'impl',
  'trait',
  'match',
  'mut',
  'where',
  'crate',
  'self',
  'super',
]);

const TOKEN_REGEX =
  /(\/\/.*$|#.*$|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][A-Za-z0-9_$]*\b|[{}()[\].,:;=<>&|+-/*?!]+)/g;

function highlightCodeLine(text: string) {
  if (!text) return ' ';
  const trimmed = text.trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
    return (
      <Box component="span" sx={{ color: '#6A9955' }}>
        {text}
      </Box>
    );
  }

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(TOKEN_REGEX.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    let color = 'text.primary';

    if (token.startsWith('//') || token.startsWith('#')) {
      color = '#6A9955';
    } else if (token.startsWith("'") || token.startsWith('"') || token.startsWith('`')) {
      color = '#9ECE6A';
    } else if (/^\d/.test(token)) {
      color = '#FF9E64';
    } else if (CODE_KEYWORDS.has(token)) {
      color = '#BB9AF7';
    } else if (/^[A-Za-z_$]/.test(token)) {
      color = '#7DCFFF';
    } else {
      color = '#89DDFF';
    }

    nodes.push(
      <Box key={`${match.index}-${token}`} component="span" sx={{ color }}>
        {token}
      </Box>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function CodeExcerptBlock({ code, location }: { code: string; location: string }) {
  const targetLineMatch = /:(\d+)(?::\d+)?$/.exec(location.trim());
  const targetLine = targetLineMatch ? Number(targetLineMatch[1]) : null;
  const rawLines = code.replace(/\r\n/g, '\n').split('\n');

  return (
    <Box
      component="pre"
      sx={{
        mt: 2,
        py: 1.75,
        px: 0,
        m: 0,
        overflowX: 'auto',
        borderRadius: 1.5,
        fontSize: 12.5,
        lineHeight: 1.75,
        fontFamily:
          '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, "Courier New", monospace',
        color: 'text.primary',
        bgcolor: 'background.neutral',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      {rawLines.map((rawLine, index) => {
        const parsed = /^(\s*\d+)(?:\s*\|\s?|\s{2})(.*)$/.exec(rawLine);
        const lineNum = parsed ? Number(parsed[1].trim()) : index + 1;
        const content = parsed ? parsed[2] : rawLine;
        const isTarget = targetLine !== null && lineNum === targetLine;

        return (
          <Box
            key={`${lineNum}-${index}`}
            sx={{
              px: 2,
              display: 'flex',
              alignItems: 'baseline',
              bgcolor: isTarget ? 'rgba(0, 167, 111, 0.1)' : 'transparent',
              borderLeft: isTarget ? '2px solid #00A76F' : '2px solid transparent',
            }}
          >
            <Box
              component="span"
              sx={{
                minWidth: 28,
                mr: 2,
                textAlign: 'right',
                userSelect: 'none',
                color: isTarget ? 'warning.main' : 'text.secondary',
                fontWeight: isTarget ? 700 : 400,
                flexShrink: 0,
              }}
            >
              {lineNum}
            </Box>
            <Box component="span" sx={{ whiteSpace: 'pre' }}>
              {highlightCodeLine(content)}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
