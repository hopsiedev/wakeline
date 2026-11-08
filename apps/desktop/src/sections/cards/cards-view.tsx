import { useTranslation } from 'react-i18next';
import { varAlpha } from 'minimal-shared/utils';
import { useSearchParams } from 'react-router-dom';
import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
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
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

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
import { AppIcon, type AppIconName } from 'src/components/nav-icon';

// ----------------------------------------------------------------------

type ViewMode = 'table' | 'kanban';
type TypeFilter = 'all' | CardKind;

const FEATURED_CARDS: UiCard[] = [
  {
    fingerprint: 'err·tsc·estado.tsx·ts2339',
    short_id: 'V-142',
    title: 'Type error: «estado» no existe en «EcfResumen»',
    kind: 'error',
    status: 'new',
    source_kind: 'command',
    source_label: 'tsc + PR #20',
    project: 'Contastack',
    branch: 'ecf-minimalista',
    location: 'components/ecf/estado.tsx:38',
    occurrences: 5,
    first_seen: 'hace 2 h',
    last_seen: 'hace 4 min',
    session_id: '6d22581',
  },
  {
    fingerprint: 'err·lint·estado.tsx·3',
    short_id: 'V-141',
    title: 'npm run lint falla por import sin usar',
    kind: 'error',
    status: 'new',
    source_kind: 'session',
    source_label: 'Sesión IA',
    project: 'Contastack',
    branch: 'ecf-minimalista',
    location: 'components/ecf/estado.tsx:3',
    occurrences: 3,
    first_seen: 'hace 1 h',
    last_seen: 'hace 22 min',
    session_id: '6d22581',
  },
  {
    fingerprint: 'err·gh·issue-34',
    short_id: 'V-143',
    title: 'El ticket sale sin ITBIS en impresora de 58 mm',
    kind: 'error',
    status: 'new',
    source_kind: 'issue',
    source_label: 'Issue #34',
    project: 'Contastack',
    branch: 'main',
    location: 'issue #34 · bug',
    occurrences: 1,
    first_seen: 'hace 1 día',
    last_seen: 'hace 1 día',
    session_id: null,
  },
  {
    fingerprint: 'task·gh·pr-21',
    short_id: 'V-140',
    title: 'Cambios pedidos: reintentos con backoff',
    kind: 'task',
    status: 'new',
    source_kind: 'pull_request',
    source_label: 'PR #21',
    project: 'Contastack',
    branch: 'caja-reintentos',
    location: 'PR #21 · 2 comentarios de revisión',
    occurrences: 1,
    first_seen: 'hace 1 h',
    last_seen: 'hace 1 h',
    session_id: null,
  },
  {
    fingerprint: 'task·session·caja-188',
    short_id: 'V-139',
    title: 'Probar la caja sin conexión en el móvil',
    kind: 'task',
    status: 'new',
    source_kind: 'session',
    source_label: 'Sesión IA',
    project: 'Contastack',
    branch: 'caja-solo-servidor',
    location: 'sesión caja-solo-servidor · msg 188',
    occurrences: 1,
    first_seen: 'hace 2 h',
    last_seen: 'hace 2 h',
    session_id: 'caja-solo-servidor',
  },
  {
    fingerprint: 'idea·session·ncf-97',
    short_id: 'V-137',
    title: 'Aviso cuando el NCF esté por agotarse',
    kind: 'idea',
    status: 'new',
    source_kind: 'session',
    source_label: 'Sesión IA',
    project: 'Contastack',
    branch: 'ecf-pestana-terminos',
    location: 'sesión ecf-pestana-terminos · msg 97',
    occurrences: 2,
    first_seen: 'hace 3 h',
    last_seen: 'hace 3 h',
    session_id: 'ecf-pestana-terminos',
  },
  {
    fingerprint: 'task·doc·auditoria-88',
    short_id: 'V-131',
    title: 'Fase 5: registro de auditoría',
    kind: 'task',
    status: 'accepted',
    source_kind: 'document',
    source_label: 'Hoja de ruta',
    project: 'Contastack',
    branch: 'main',
    location: 'docs/hoja-de-ruta.md:88',
    occurrences: 1,
    first_seen: 'ayer',
    last_seen: 'ayer',
    session_id: null,
  },
  {
    fingerprint: 'task·doc·limites-42',
    short_id: 'V-128',
    title: 'Límite de peticiones en memoria por instancia',
    kind: 'task',
    status: 'accepted',
    source_kind: 'document',
    source_label: 'specs/',
    project: 'Contastack',
    branch: 'main',
    location: 'specs/limites.md:42',
    occurrences: 1,
    first_seen: 'ayer',
    last_seen: 'ayer',
    session_id: null,
  },
  {
    fingerprint: 'task·code·saldo-17',
    short_id: 'V-124',
    title: 'TODO: mover cálculo de saldo a customer-store',
    kind: 'task',
    status: 'accepted',
    source_kind: 'comment',
    source_label: 'TODO',
    project: 'Contastack',
    branch: 'main',
    location: 'lib/customers/saldo.ts:17',
    occurrences: 1,
    first_seen: 'hace 3 días',
    last_seen: 'hace 3 días',
    session_id: null,
  },
  {
    fingerprint: 'idea·session·facturas-54',
    short_id: 'V-119',
    title: 'Exportar facturas a Excel desde el historial',
    kind: 'idea',
    status: 'accepted',
    source_kind: 'session',
    source_label: 'Sesión IA',
    project: 'Contastack',
    branch: 'facturas-filtros',
    location: 'sesión facturas-filtros · msg 54',
    occurrences: 1,
    first_seen: 'hace 4 días',
    last_seen: 'hace 4 días',
    session_id: 'facturas-filtros',
  },
];

export function CardsView() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cards, setCards] = useState<UiCard[]>(FEATURED_CARDS);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedCard, setSelectedCard] = useState<UiCard | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKind, setNewKind] = useState<CardKind>('task');
  const [newProject, setNewProject] = useState('Contastack');

  const loadCards = () => {
    fetchDashboardData().then((res) => {
      const merged = [...FEATURED_CARDS];
      for (const item of res.cards) {
        if (!merged.some((m) => m.fingerprint === item.fingerprint)) {
          merged.push(item);
        }
      }
      setCards(merged);
    });
  };

  useEffect(() => {
    loadCards();
  }, []);

  useEffect(() => {
    const detailId = searchParams.get('detail');
    if (detailId) {
      const found = cards.find((c) => c.short_id === detailId) ?? FEATURED_CARDS[0];
      setSelectedCard(found);
    }
  }, [searchParams, cards]);

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

  const copyPromptText = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 1400);
  };

  const closeDetail = () => {
    setSelectedCard(null);
    if (searchParams.has('detail')) {
      setSearchParams({});
    }
  };

  if (selectedCard) {
    return (
      <DashboardContent maxWidth={false}>
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
              maxWidth: 460,
              ml: 'auto',
              justifyContent: 'flex-end',
            }}
          >
            <Button
              variant="outlined"
              color="inherit"
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
              onClick={() =>
                copyPromptText(`claude --resume ${selectedCard.session_id ?? '6d22581'}`)
              }
              startIcon={<AppIcon name="play" size={18} />}
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
                  `Proyecto: ${selectedCard.project} (${selectedCard.branch})\nOrigen: ${selectedCard.location}\nPendiente: ${selectedCard.title}`
                )
              }
              startIcon={<AppIcon name="copy" size={18} />}
              sx={{ height: 36, px: 1.75, fontWeight: 700 }}
            >
              {copiedPrompt ? t('common.copied') : t('cards.copyPrompt')}
            </Button>

            <Button
              color="inherit"
              onClick={() => handleStatusChange(selectedCard, 'accepted')}
              sx={(theme) => ({
                height: 36,
                px: 1.75,
                fontWeight: 700,
                bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
              })}
            >
              {t('common.accept')}
            </Button>

            <Button
              onClick={() => handleStatusChange(selectedCard, 'dismissed')}
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
          <Grid size={{ xs: 12, lg: 8 }}>
            <Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
              {/* Dónde aparece */}
              <Card>
                <Box sx={{ pt: 3, px: 3 }}>
                  <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                    {t('cards.whereTitle')}
                  </Typography>
                  <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 14 }}>
                    {selectedCard.location} · npm run typecheck
                  </Typography>
                </Box>
                <Box sx={{ p: 3 }}>
                  <Box
                    sx={(theme) => ({
                      py: 2,
                      borderRadius: 1.5,
                      overflowX: 'auto',
                      fontFamily: 'monospace',
                      fontSize: 12.5,
                      lineHeight: 1.7,
                      color: 'text.primary',
                      bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
                      border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.18)}`,
                    })}
                  >
                    <CodeLine num={35}>
                      <Box component="span" sx={{ color: 'secondary.main' }}>
                        export function
                      </Box>{' '}
                      <Box component="span" sx={{ color: 'info.main' }}>
                        EstadoEcf
                      </Box>
                      {'({ resumen }: { resumen: EcfResumen }) {'}
                    </CodeLine>
                    <CodeLine num={36}>
                      {'  '}
                      <Box component="span" sx={{ color: 'secondary.main' }}>
                        const
                      </Box>{' '}
                      pendientes = resumen.documentos.
                      <Box component="span" sx={{ color: 'info.main' }}>
                        filter
                      </Box>
                      (esPendiente)
                    </CodeLine>
                    <CodeLine num={37}>
                      <Box component="span" sx={{ color: 'text.disabled' }}>
                        {'  // la vista nueva ya no recibe el estado desde la API'}
                      </Box>
                    </CodeLine>
                    <CodeLine num={38} highlight>
                      {'  '}
                      <Box component="span" sx={{ color: 'secondary.main' }}>
                        if
                      </Box>{' '}
                      (resumen.
                      <Box component="span" sx={{ color: 'error.main', fontWeight: 700 }}>
                        estado
                      </Box>{' '}
                      ==={' '}
                      <Box component="span" sx={{ color: 'success.main' }}>
                        &quot;rechazado&quot;
                      </Box>
                      ){' '}
                      <Box component="span" sx={{ color: 'secondary.main' }}>
                        return
                      </Box>{' '}
                      {'<'}
                      <Box component="span" sx={{ color: 'info.main' }}>
                        Rechazo
                      </Box>
                      {' />'}
                    </CodeLine>
                    <CodeLine num={39}>
                      {'  '}
                      <Box component="span" sx={{ color: 'secondary.main' }}>
                        return
                      </Box>{' '}
                      {'<'}
                      <Box component="span" sx={{ color: 'info.main' }}>
                        Lista
                      </Box>
                      {' items={pendientes} />'}
                    </CodeLine>
                    <CodeLine num={40}>{'}'}</CodeLine>
                  </Box>

                  <Box
                    sx={(theme) => ({
                      mt: 1.5,
                      py: 1.5,
                      px: 2,
                      borderRadius: 1.5,
                      fontFamily: 'monospace',
                      fontSize: 12.5,
                      color: 'error.main',
                      bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
                      border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.18)}`,
                    })}
                  >
                    TS2339: Property &apos;estado&apos; does not exist on type
                    &apos;EcfResumen&apos;.
                  </Box>
                </Box>
              </Card>

              {/* Lo que dijo la IA */}
              <Card>
                <Box sx={{ pt: 3, px: 3 }}>
                  <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                    {t('cards.aiQuoteTitle')}
                  </Typography>
                  <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 14 }}>
                    {t('cards.aiQuoteSubtitle')}
                  </Typography>
                </Box>
                <Box sx={{ p: 3, gap: 1.5, display: 'grid' }}>
                  <Box
                    component="blockquote"
                    sx={{
                      m: 0,
                      py: 1.25,
                      px: 2,
                      fontSize: 13.5,
                      color: 'text.secondary',
                      borderRadius: '0 10px 10px 0',
                      borderLeft: '3px solid #8E33FF',
                      bgcolor: 'rgba(142, 51, 255, 0.08)',
                    }}
                  >
                    «{selectedCard.title}»
                    <Box
                      component="small"
                      sx={{ mt: 0.75, display: 'block', color: 'text.disabled', fontSize: 12 }}
                    >
                      Asistente · hoy 14:31 · mensaje 212 de 340
                    </Box>
                  </Box>

                  <Box
                    component="blockquote"
                    sx={{
                      m: 0,
                      py: 1.25,
                      px: 2,
                      fontSize: 13.5,
                      color: 'text.secondary',
                      borderRadius: '0 10px 10px 0',
                      borderLeft: '3px solid #FF5630',
                      bgcolor: 'rgba(255, 86, 48, 0.08)',
                    }}
                  >
                    Bash · <code>npm run typecheck</code> salió con código 2 (3 veces en esta
                    sesión)
                    <Box
                      component="small"
                      sx={{ mt: 0.75, display: 'block', color: 'text.disabled', fontSize: 12 }}
                    >
                      Resultado de herramienta · is_error · hoy 14:52
                    </Box>
                  </Box>
                </Box>
              </Card>

              {/* En GitHub */}
              <Card>
                <Box sx={{ pt: 3, px: 3, display: 'flex', alignItems: 'center' }}>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                      {t('cards.githubTitle')}
                    </Typography>
                    <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 14 }}>
                      {t('cards.githubSubtitle')}: {selectedCard.branch}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    color="inherit"
                    startIcon={<AppIcon name="gh" size={16} />}
                    sx={(theme) => ({
                      height: 30,
                      px: 1.25,
                      fontSize: 13,
                      fontWeight: 700,
                      borderColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.32),
                    })}
                  >
                    {t('cards.openPr')}
                  </Button>
                </Box>

                <Box sx={{ p: 3, gap: 1.25, display: 'grid' }}>
                  <Box
                    sx={(theme) => ({
                      pb: 1.5,
                      gap: 1.75,
                      display: 'flex',
                      alignItems: 'center',
                      borderBottom: `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.2)}`,
                    })}
                  >
                    <Box sx={{ color: 'error.main', display: 'flex' }}>
                      <AppIcon name="pr" size={20} />
                    </Box>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
                        #20 ecf: quitar estado del resumen
                      </Typography>
                      <Typography
                        sx={{ color: 'text.disabled', fontSize: 12, fontFamily: 'monospace' }}
                      >
                        abierto por hopsiedev · hace 3 h
                      </Typography>
                    </Box>
                    <Label color="error">{t('pullRequests.ciRed')}</Label>
                  </Box>

                  {[
                    ['✕', 'error.main', 'CI / typecheck · TS2339 en components/ecf/estado.tsx:38'],
                    ['✕', 'error.main', "CI / lint · 'useMemo' is defined but never used"],
                    ['✓', 'success.main', 'CI / tests · 412 pruebas'],
                  ].map(([sym, col, txt]) => (
                    <Box
                      key={txt}
                      sx={(theme) => ({
                        py: 1.25,
                        px: 1.5,
                        gap: 1.25,
                        borderRadius: 1,
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: 12.5,
                        fontFamily: 'monospace',
                        color: 'text.primary',
                        bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
                      })}
                    >
                      <Box component="span" sx={{ color: col, fontWeight: 700 }}>
                        {sym}
                      </Box>
                      <Box component="span" sx={{ flexGrow: 1 }}>
                        {txt}
                      </Box>
                      <Box
                        component="span"
                        sx={{ color: 'text.disabled', fontFamily: 'inherit', fontSize: 12 }}
                      >
                        hace 18 min
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Card>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
              <Card>
                <Box sx={{ pt: 3, px: 3 }}>
                  <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                    {t('cards.metaTitle')}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    p: 3,
                    gap: '14px 16px',
                    display: 'grid',
                    fontSize: 14,
                    gridTemplateColumns: '120px 1fr',
                  }}
                >
                  <Box sx={{ color: 'text.secondary' }}>{t('cards.project')}</Box>
                  <Box>{selectedCard.project}</Box>

                  <Box sx={{ color: 'text.secondary' }}>{t('cards.metaBranch')}</Box>
                  <Box sx={{ fontFamily: 'monospace' }}>{selectedCard.branch}</Box>

                  <Box sx={{ color: 'text.secondary' }}>{t('cards.metaOrigin')}</Box>
                  <Box sx={{ gap: 0.75, display: 'flex', flexWrap: 'wrap' }}>
                    <Label color="default">tsc</Label>
                    <Label color="default">Sesión IA</Label>
                    <Label color="default">PR #20 · CI</Label>
                  </Box>

                  <Box sx={{ color: 'text.secondary' }}>{t('cards.metaCommit')}</Box>
                  <Box sx={{ fontFamily: 'monospace' }}>6d22581</Box>

                  <Box sx={{ color: 'text.secondary' }}>{t('cards.metaClosure')}</Box>
                  <Box>{t('cards.metaClosureAuto')}</Box>

                  <Box sx={{ color: 'text.secondary' }}>{t('cards.metaFingerprint')}</Box>
                  <Box
                    sx={{
                      fontSize: 12,
                      wordBreak: 'break-all',
                      color: 'text.disabled',
                      fontFamily: 'monospace',
                    }}
                  >
                    {selectedCard.fingerprint}
                  </Box>
                </Box>
              </Card>

              <Card>
                <Box sx={{ pt: 3, px: 3 }}>
                  <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                    {t('cards.occurrencesTitle')}
                  </Typography>
                  <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 14 }}>
                    {t('cards.occurrencesSubtitle')}
                  </Typography>
                </Box>
                <Box sx={{ p: 3 }}>
                  <Box sx={{ height: 64, gap: '6px', display: 'flex', alignItems: 'flex-end' }}>
                    {[8, 8, 8, 8, 40, 100, 8, 40, 70, 40].map((h, i) => (
                      <Box
                        key={i}
                        sx={(theme) => ({
                          flex: 1,
                          height: `${h}%`,
                          borderRadius: '3px 3px 0 0',
                          bgcolor:
                            h <= 8
                              ? varAlpha(theme.vars.palette.grey['500Channel'], 0.24)
                              : 'error.main',
                          opacity: h <= 8 ? 1 : 0.8,
                        })}
                      />
                    ))}
                  </Box>
                  <Box
                    sx={{
                      pt: 0.75,
                      display: 'flex',
                      fontSize: 12,
                      color: 'text.disabled',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>12:00</span>
                    <span>13:00</span>
                    <span>14:00</span>
                    <span>15:00</span>
                  </Box>
                </Box>
              </Card>

              <Box
                sx={(theme) => ({
                  p: 2,
                  gap: 1.5,
                  borderRadius: 1.25,
                  display: 'flex',
                  fontSize: 13.5,
                  color: 'text.primary',
                  bgcolor: varAlpha(theme.vars.palette.info.mainChannel, 0.14),
                  border: `1px solid ${varAlpha(theme.vars.palette.info.mainChannel, 0.28)}`,
                })}
              >
                <Box sx={{ color: 'info.main', display: 'flex', flexShrink: 0, mt: 0.25 }}>
                  <AppIcon name="sparkle" size={20} />
                </Box>
                <Box>
                  <b>{t('cards.ollamaBold')}</b> {t('cards.ollamaNotice')}
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </DashboardContent>
    );
  }

  const errTotal = cards.filter((c) => c.kind === 'error').length;
  const taskTotal = cards.filter((c) => c.kind === 'task').length;
  const ideaTotal = cards.filter((c) => c.kind === 'idea').length;

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

      {viewMode === 'table' && (
        <Card>
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
                ['all', t('common.all'), cards.length, 'default'],
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
            <Box
              onClick={() => setProjectFilter((prev) => (prev === 'all' ? 'Contastack' : 'all'))}
              sx={(theme) => ({
                width: 200,
                height: 54,
                px: 1.75,
                display: 'flex',
                cursor: 'pointer',
                position: 'relative',
                alignItems: 'center',
                borderRadius: 1,
                color: 'text.secondary',
                border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.32)}`,
              })}
            >
              <FieldLegend label={t('cards.project')} />
              <span>{projectFilter === 'all' ? 'Contastack' : projectFilter}</span>
              <Box component="span" sx={{ ml: 'auto' }}>
                ▾
              </Box>
            </Box>

            <Box
              sx={(theme) => ({
                width: 220,
                height: 54,
                px: 1.75,
                display: 'flex',
                position: 'relative',
                alignItems: 'center',
                borderRadius: 1,
                color: 'text.secondary',
                border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.32)}`,
              })}
            >
              <FieldLegend label={t('cards.source')} />
              <span>{t('cards.sourceAll')}</span>
              <Box component="span" sx={{ ml: 'auto' }}>
                ▾
              </Box>
            </Box>

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
            <FilterChip text={t('cards.chipStatus')} />
            <FilterChip text={`${t('cards.chipProject')}: Contastack`} />
            <Button
              size="small"
              onClick={() => {
                setTypeFilter('all');
                setProjectFilter('all');
                setSearch('');
              }}
              sx={{ color: 'error.main', fontWeight: 700, fontSize: 13 }}
            >
              {t('common.clear')}
            </Button>
          </Box>

          {/* Tabla limpia sin barra horizontal */}
          <Table sx={{ width: 1, borderCollapse: 'collapse' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 48 }}>
                  <CheckSquare />
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
              {filtered.slice(0, 25).map((card, idx) => (
                <TableRow
                  hover
                  key={card.fingerprint}
                  onClick={() => setSelectedCard(card)}
                  sx={{
                    cursor: 'pointer',
                    ...(idx === 0 &&
                      typeFilter === 'all' && {
                        bgcolor: 'rgba(0, 167, 111, 0.08)',
                      }),
                  }}
                >
                  <TableCell>
                    <CheckSquare />
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
            </TableBody>
          </Table>

          <Box
            sx={{
              py: 1.5,
              px: 2.5,
              gap: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              fontSize: 14,
              color: 'text.secondary',
            }}
          >
            <span>{t('cards.rowsPerPage')} ▾</span>
            <span>1–10 / {filtered.length}</span>
            <span>‹ &nbsp; ›</span>
          </Box>
        </Card>
      )}

      {viewMode === 'kanban' && (
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

                  {colCards.slice(0, 15).map((card) => (
                    <Card
                      key={card.fingerprint}
                      onClick={() => setSelectedCard(card)}
                      sx={{
                        p: 2,
                        gap: 1.25,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <Box>
                        <KindBadge kind={card.kind} />
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

function SourcePill({ card }: { card: UiCard }) {
  let ico: AppIconName = 'chat';
  if (card.source_kind === 'comment' || card.source_kind === 'command') ico = 'code';
  else if (card.source_kind === 'document') ico = 'doc';
  else if (card.source_kind === 'pull_request') ico = 'pr';
  else if (card.source_kind === 'issue') ico = 'issue';

  return (
    <Box
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
      <AppIcon name={ico} size={16} />
      {card.source_label}
    </Box>
  );
}

function CheckSquare() {
  return (
    <Box
      component="span"
      sx={{
        width: 20,
        height: 20,
        borderRadius: '6px',
        display: 'inline-block',
        verticalAlign: 'middle',
        border: '2px solid',
        borderColor: 'text.disabled',
      }}
    />
  );
}

function FieldLegend({ label }: { label: string }) {
  return (
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
      {label}
    </Box>
  );
}

function FilterChip({ text }: { text: string }) {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        pl: 1.25,
        pr: 0.75,
        height: 28,
        gap: 0.75,
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 1,
        fontSize: 13,
        color: 'text.primary',
        bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
      })}
    >
      {text}
      <Box
        component="i"
        sx={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          fontStyle: 'normal',
          fontSize: 11,
          fontWeight: 800,
          color: 'background.paper',
          bgcolor: 'text.disabled',
        }}
      >
        ×
      </Box>
    </Box>
  );
}

function CodeLine({
  num,
  highlight,
  children,
}: {
  num: number;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        px: 2,
        display: 'flex',
        whiteSpace: 'pre',
        ...(highlight && {
          bgcolor: 'rgba(255, 86, 48, 0.12)',
          boxShadow: 'inset 3px 0 #FF5630',
        }),
      }}
    >
      <Box
        component="span"
        sx={{ width: 40, flexShrink: 0, userSelect: 'none', color: 'text.disabled' }}
      >
        {num}
      </Box>
      <Box component="span">{children}</Box>
    </Box>
  );
}
