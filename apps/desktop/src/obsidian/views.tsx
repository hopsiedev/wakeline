import type { ReactNode, CSSProperties } from 'react';

import { useTranslation } from 'react-i18next';
import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  X,
  Bug,
  Plus,
  Copy,
  Check,
  Search,
  Folder,
  Lightbulb,
  RefreshCw,
  ArrowRight,
  CheckSquare,
  GitPullRequest,
} from 'lucide-react';

import { localDay } from 'src/services/daily-summary-state';
import { invoke as desktopInvoke } from 'src/services/wakeline';
import {
  isSnoozed,
  snoozeCard,
  boardStage,
  getWorkflow,
  cardHistory,
  observeCards,
  priorityCards,
  setReviewStage,
  type BoardStage,
} from 'src/services/card-workflow';
import {
  type UiCard,
  originLabel,
  openExternal,
  refreshGithub,
  openProjectFile,
  updateCardStatus,
  createManualCard,
  listProjectFiles,
  type UiFileEntry,
  updateCardsStatus,
  chooseWatchFolder,
  exportProjectTodo,
  type UiPullRequest,
  resumeClaudeSession,
  getPullRequestDetails,
  type PullRequestDetails,
} from 'src/services/wakeline';

import { EvidenceMarkdown } from 'src/components/evidence-markdown';

import { toggleCardSelection, selectedStatusInputs } from 'src/sections/cards/card-selection';

import { EditorOpen } from './editor-open';
import { ProjectCommands } from './settings';
import { useWorkspace } from './workspace-context';
import { NumberAnimation } from './number-animation';

const KINDS = { error: Bug, task: CheckSquare, idea: Lightbulb };
const STAGES: BoardStage[] = ['new', 'accepted', 'review', 'done'];
const style = (index: number) => ({ '--i': index }) as CSSProperties;

export function Modal({
  title,
  children,
  onClose,
  className = '',
  brand = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  brand?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`wk-todo-side wk-todo-modal real-modal ${className}`}
      aria-label={title}
      data-docked={
        className.includes('real-pr-detail') &&
        localStorage.getItem('wakeline-pr-panel-docked') === 'true'
      }
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <header>
        <span>
          {brand ? (
            <>
              <img src="/logo/wakeline-mark.svg" alt="" width="25" height="18" />
              Wakeline
            </>
          ) : (
            title
          )}
        </span>
        <button className="icon-btn" onClick={onClose} aria-label={t('account.close')}>
          <X size={17} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function ErrorNotice({ error }: { error: string | null }) {
  return error ? (
    <p className="real-error" role="alert">
      {error}
    </p>
  ) : null;
}
export function useFlow() {
  const [, setRevision] = useState(0);
  useEffect(() => {
    const update = () => setRevision((v) => v + 1);
    window.addEventListener('wakeline:workflow', update);
    const timer = setInterval(update, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('wakeline:workflow', update);
    };
  }, []);
  return { ...getWorkflow() };
}
export function CopyControl({ text, label }: { text: string; label?: string }) {
  const { t } = useTranslation();
  const { notice } = useWorkspace();
  const reduced = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const lifecycle = useRef({ active: false, attempt: 0 }).current;
  useEffect(() => {
    lifecycle.active = true;
    return () => {
      lifecycle.active = false;
      lifecycle.attempt++;
    };
  }, [lifecycle]);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <>
      <button
        className="btn wk-copy-button"
        onClick={async () => {
          const attempt = ++lifecycle.attempt;
          setCopied(false);
          setError(false);
          try {
            await navigator.clipboard.writeText(text);
            if (!lifecycle.active || attempt !== lifecycle.attempt) return;
            setCopied(true);
            notice(t('common.copied'));
          } catch {
            if (lifecycle.active && attempt === lifecycle.attempt) setError(true);
          }
        }}
        aria-label={copied ? t('common.copied') : (label ?? t('settings.copyConfig'))}
      >
        <span className="wk-copy-icon">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={copied ? 'check' : 'copy'}
              initial={{ opacity: 0, scale: reduced ? 1 : 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reduced ? 1 : 0.5 }}
              transition={{ duration: reduced ? 0 : 0.15 }}
              className="wk-copy-layer"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </motion.span>
          </AnimatePresence>
        </span>
        {copied ? t('common.copied') : label}
      </button>
      {error && (
        <p className="real-error" role="alert">
          {t('errors.clipboard')}
        </p>
      )}
    </>
  );
}
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const points = values
    .map((v, i) => `${(i * 300) / Math.max(1, values.length - 1)},${42 - (v / max) * 35}`)
    .join(' ');
  return (
    <svg
      className="spark real-spark"
      viewBox="0 0 300 48"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={`0,48 ${points} 300,48`} fill="currentColor" opacity=".09" />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
export function Priorities({ cards }: { cards: UiCard[] }) {
  const { t } = useTranslation();
  const workflow = useFlow();
  const rows = priorityCards(cards, workflow, localDay());
  if (!rows.length) return null;
  return (
    <section className="block enter real-priorities" style={style(2)}>
      <div className="block-head">
        <h2 className="block-title">{t('workflow.priority')}</h2>
      </div>
      <div className="real-priority-grid">
        {rows.map(({ card, reason, age }) => (
          <Link
            className="card real-priority"
            key={card.fingerprint}
            to={`/cards/${encodeURIComponent(card.fingerprint)}`}
          >
            <span className="wk-kanban-type" data-kind={card.kind}>
              {t(`common.${card.kind}`)}
            </span>
            <strong>{card.title}</strong>
            <small>
              {t(`workflow.reason.${reason}`, {
                count: reason === 'aging' ? age : card.occurrences,
              })}
            </small>
            <ArrowRight size={16} />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function SummaryPage() {
  const { t, i18n } = useTranslation();
  const { data, busy } = useWorkspace();
  const cards = data?.cards ?? [];
  const [range, setRange] = useState(7);
  const [selected, setSelected] = useState<UiPullRequest | null>(null);
  const days = Array.from({ length: range }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - range + 1 + i);
    return {
      key: localDay(date),
      label: new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(date),
    };
  });
  const kinds = ['error', 'task', 'idea'] as const;
  const series = kinds.map((kind) =>
    days.map((day) => cards.filter((c) => c.kind === kind && c.first_seen === day.key).length)
  );
  const total = days.map((_, i) => series.reduce((sum, row) => sum + row[i], 0));
  const ceiling = Math.max(1, ...total);
  const metrics = [
    ...kinds.map((kind, index) => ({
      id: kind,
      label: t(`common.${kind === 'error' ? 'errors' : kind === 'task' ? 'tasks' : 'ideas'}`),
      value: cards.filter((c) => c.kind === kind && (c.status === 'new' || c.status === 'accepted'))
        .length,
      values: series[index],
      Icon: KINDS[kind],
    })),
    {
      id: 'prs',
      label: t('shell.openPrs'),
      value: data?.pull_requests.length ?? 0,
      values: days.map(() => 0),
      Icon: GitPullRequest,
    },
  ];
  return (
    <div className="page-content">
      <header className="page-head enter" style={style(1)}>
        <div className="page-head-text">
          <h1 className="page-title">{t('nav.summary')}</h1>
          <p className="page-sub">
            {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(new Date())}
          </p>
        </div>
        <div
          className="seg"
          role="group"
          aria-label={t('shell.period')}
          style={{ '--n': 3, '--idx': [1, 7, 30].indexOf(range) } as CSSProperties}
        >
          <span className="seg-thumb" />
          {[1, 7, 30].map((n, i) => (
            <button
              key={n}
              className="seg-btn"
              aria-pressed={range === n}
              onClick={() => setRange(n)}
            >
              {t(['shell.today', 'shell.week', 'shell.month'][i])}
            </button>
          ))}
        </div>
      </header>
      <ul className="stats" aria-label={t('shell.metrics')}>
        {metrics.map((metric, i) => (
          <li key={metric.id} className="stat enter" style={style(2 + i * 0.35)}>
            <span className="stat-label">
              <metric.Icon size={16} />
              {metric.label}
            </span>
            <div className="stat-row">
              <NumberAnimation value={metric.value} className="stat-value" />
            </div>
            {metric.id !== 'prs' && <Sparkline values={metric.values} />}
          </li>
        ))}
      </ul>
      <div className="overview-grid">
        <section className="card enter" style={style(3)}>
          <header className="card-head">
            <h2 className="card-title">{t('shell.findingActivity')}</h2>
            <ul className="legend">
              {kinds.map((kind, i) => (
                <li key={kind}>
                  <i style={{ '--c': ['#d99286', '#72b7b0', '#c5ad73'][i] } as CSSProperties} />
                  {t(`common.${kind}`)}
                </li>
              ))}
            </ul>
          </header>
          <figure className="chart" aria-label={t('shell.findingActivity')}>
            <div className="real-chart">
              {days.map((day, i) => (
                <div className="real-chart-column" key={day.key}>
                  <div
                    className="real-chart-stack"
                    style={{ height: `${(total[i] / ceiling) * 150}px` }}
                  >
                    {kinds.map(
                      (kind, k) =>
                        series[k][i] > 0 && (
                          <span
                            key={kind}
                            style={{
                              flexGrow: series[k][i],
                              background: ['#d99286', '#72b7b0', '#c5ad73'][k],
                            }}
                            title={`${t(`common.${kind}`)}: ${series[k][i]}`}
                          />
                        )
                    )}
                  </div>
                  <span>{day.label}</span>
                </div>
              ))}
            </div>
          </figure>
        </section>
        <section className="card enter" style={style(3.5)}>
          <header className="card-head">
            <h2 className="card-title">{t('shell.projectActivity')}</h2>
          </header>
          <ol className="leaders">
            {(data?.projects ?? [])
              .slice()
              .sort((a, b) => b.errors + b.tasks + b.ideas - a.errors - a.tasks - a.ideas)
              .slice(0, 5)
              .map((project, index) => {
                const count = project.errors + project.tasks + project.ideas;
                const maximum = Math.max(
                  1,
                  ...(data?.projects ?? []).map((p) => p.errors + p.tasks + p.ideas)
                );
                return (
                  <li
                    className="leader"
                    key={project.path}
                    style={{ '--row': index, '--c': 'var(--accent)' } as CSSProperties}
                  >
                    <span className="avatar avatar-empty">
                      <Folder size={18} />
                    </span>
                    <div className="leader-main">
                      <div className="leader-line">
                        <Link
                          className="leader-name"
                          to={`/projects/${encodeURIComponent(project.name)}`}
                        >
                          {project.name}
                        </Link>
                        <span className="leader-count">
                          <NumberAnimation value={count} />
                        </span>
                      </div>
                      <div className="share">
                        <span
                          className="share-fill"
                          style={{ '--share': count / maximum } as CSSProperties}
                        />
                      </div>
                      <div className="leader-meta">
                        <span>{project.branch}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            {!data?.projects.length && (
              <p className="wk-help">{t(busy ? 'common.loading' : 'repositories.empty')}</p>
            )}
          </ol>
        </section>
      </div>
      <Priorities cards={cards} />
      <section className="block enter" style={style(4.5)}>
        <div className="block-head">
          <h2 className="block-title">{t('shell.openPrs')}</h2>
          <Link className="link-more" to="/pull-requests">
            {t('shell.viewAll')}
            <ArrowRight size={14} />
          </Link>
        </div>
        <PrList prs={data?.pull_requests ?? []} onOpen={setSelected} />
      </section>
      {selected && <PrDetail pr={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

export function TodoPage() {
  const { t } = useTranslation();
  const { data, reload, busy } = useWorkspace();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const detailId = id ?? searchParams.get('detail');
  const navigate = useNavigate();
  const workflow = useFlow();
  const [filter, setFilter] = useState('all');
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [selecting, setSelecting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [paused, setPaused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'error' | 'task' | 'idea'>('task');
  const [project, setProject] = useState('');
  const moving = useRef(false);
  const dragged = useRef(false);
  const cards = data?.cards ?? [];
  const selected = cards.find(
    (card) =>
      card.fingerprint === detailId ||
      card.fingerprints.includes(detailId ?? '') ||
      card.short_id === detailId
  );
  const close = () => navigate('/cards');
  const visible = cards.filter(
    (c) =>
      (filter === 'all' || c.kind === filter) &&
      (dismissed ? c.status === 'dismissed' : c.status !== 'dismissed') &&
      isSnoozed(c, workflow) === paused &&
      [c.title, c.project, c.location, c.evidence]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase())
  );
  const change = async (card: UiCard, stage: BoardStage | 'dismissed') => {
    if (moving.current) return;
    moving.current = true;
    setError(null);
    try {
      const status = stage === 'review' ? 'accepted' : stage;
      await updateCardStatus(card.fingerprint, status, card.fingerprints);
      observeCards([{ ...card, status }]);
      setReviewStage({ ...card, status }, stage === 'review');
      await reload();
    } catch (cause) {
      setError(String(cause));
    } finally {
      moving.current = false;
      setTarget(null);
    }
  };
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(String(cause));
    }
  };
  const tomorrow = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  const columns = dismissed ? ['dismissed' as const] : STAGES;
  return (
    <div className="wk-todo-workspace">
      <div className="page-content wk-todo-page">
        <header className="page-head enter" style={style(1)}>
          <div className="page-head-text">
            <h1 className="page-title">To do</h1>
            <p className="page-sub">
              {t('shell.findingCount', {
                count: cards.filter((c) => c.status === 'new' || c.status === 'accepted').length,
              })}
            </p>
          </div>
          <button className="btn" disabled={!data?.projects.length} onClick={() => setCreate(true)}>
            <Plus size={14} />
            {t('cards.newCard')}
          </button>
        </header>
        <ErrorNotice error={error} />
        <Priorities cards={cards} />
        <div className="wk-todo-subtoolbar enter" style={style(2)}>
          <label className="wk-todo-search">
            <Search size={15} />
            <input
              aria-label={t('cards.search')}
              placeholder={t('cards.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="wk-todo-filters" role="group" aria-label={t('cards.colType')}>
            {['all', 'error', 'task', 'idea'].map((key) => (
              <button
                key={key}
                data-kind={key}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {t(
                  key === 'all'
                    ? 'common.all'
                    : `common.${key === 'error' ? 'errors' : key === 'task' ? 'tasks' : 'ideas'}`
                )}
                <span>{cards.filter((c) => key === 'all' || c.kind === key).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="real-todo-secondary">
          <button
            className="link-more"
            aria-pressed={selecting}
            onClick={() => {
              setSelecting(!selecting);
              setSelection(new Set());
            }}
          >
            {t('shell.selectCards')}
          </button>
          {selecting && (
            <>
              <button
                className="link-more"
                onClick={() => setSelection(new Set(visible.map((card) => card.fingerprint)))}
              >
                {t('cards.selectResults', { count: visible.length })}
              </button>
              <span aria-live="polite">
                {t('cards.selectedCount', {
                  count: visible.filter((card) => selection.has(card.fingerprint)).length,
                })}
              </span>
              {(['accepted', 'done', 'dismissed'] as const).map((status) => (
                <button
                  className="btn"
                  key={status}
                  disabled={bulkBusy || !visible.some((card) => selection.has(card.fingerprint))}
                  onClick={async () => {
                    setBulkBusy(true);
                    setError(null);
                    try {
                      await updateCardsStatus(selectedStatusInputs(visible, selection, status));
                      setSelection(new Set());
                      await reload();
                    } catch (cause) {
                      setError(String(cause));
                    } finally {
                      setBulkBusy(false);
                    }
                  }}
                >
                  {t(
                    status === 'accepted'
                      ? 'common.accept'
                      : status === 'done'
                        ? 'common.markDone'
                        : 'common.dismiss'
                  )}
                </button>
              ))}
            </>
          )}
          <button className="link-more" aria-pressed={paused} onClick={() => setPaused(!paused)}>
            {t('workflow.snoozed')} ({cards.filter((c) => isSnoozed(c, workflow)).length})
          </button>
          <button
            className="link-more"
            aria-pressed={dismissed}
            onClick={() => setDismissed(!dismissed)}
          >
            {t('common.dismissedPlural')}
          </button>
        </div>
        {!data?.projects.length && (
          <div className="empty enter">
            <p className="empty-title">
              {t(busy ? 'common.loading' : 'pullRequests.noWatchedFolders')}
            </p>
            <button className="btn btn-primary" onClick={() => run(chooseWatchFolder)}>
              {t('nav.watchFolder')}
            </button>
          </div>
        )}
        <div className="wk-kanban enter" style={style(3)} aria-label="To do">
          {columns.map((stage) => (
            <section
              className="wk-kanban-column"
              key={stage}
              data-drop={target === stage}
              onDragOver={(e) => {
                if (dragged.current) {
                  e.preventDefault();
                  setTarget(stage);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const card = cards.find(
                  (c) => c.fingerprint === e.dataTransfer.getData('text/plain')
                );
                if (card) void change(card, stage);
              }}
            >
              <header>
                <span
                  className="wk-todo-state"
                  data-state={
                    stage === 'new' ? 'pending' : stage === 'accepted' ? 'progress' : stage
                  }
                >
                  <i />
                  {t(stage === 'dismissed' ? 'common.dismissed' : `board.${stage}`)}
                </span>
                <span>{visible.filter((c) => boardStage(c, workflow) === stage).length}</span>
              </header>
              <div className="wk-kanban-items">
                {visible
                  .filter((c) => boardStage(c, workflow) === stage)
                  .map((card) => {
                    const Icon = KINDS[card.kind];
                    return (
                      <button
                        className="wk-kanban-card"
                        key={card.fingerprint}
                        draggable={!moving.current}
                        onDragStart={(e) => {
                          dragged.current = true;
                          e.dataTransfer.setData('text/plain', card.fingerprint);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setTarget(null);
                          requestAnimationFrame(() => {
                            dragged.current = false;
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                            e.preventDefault();
                            const next =
                              STAGES[
                                STAGES.indexOf(stage as BoardStage) +
                                  (e.key === 'ArrowRight' ? 1 : -1)
                              ];
                            if (next) void change(card, next);
                          }
                        }}
                        title={t('board.cardLabel', { title: card.title })}
                        aria-pressed={selecting ? selection.has(card.fingerprint) : undefined}
                        data-selected={selection.has(card.fingerprint)}
                        onClick={() => {
                          if (selecting) {
                            setSelection((previous) =>
                              toggleCardSelection(previous, card.fingerprint)
                            );
                            return;
                          }
                          if (!dragged.current)
                            navigate(`/cards/${encodeURIComponent(card.fingerprint)}`);
                        }}
                      >
                        <span className="wk-kanban-type" data-kind={card.kind}>
                          <Icon size={14} />
                          {t(`common.${card.kind}`)}
                          <span>{card.short_id}</span>
                        </span>
                        <h3>{card.title}</h3>
                        <span className="wk-kanban-project">{card.project}</span>
                        <footer>
                          <span className="wk-todo-agent">
                            {card.source_kind === 'session' && (
                              <img
                                src="/assets/icons/agents/claude.svg"
                                width="15"
                                height="15"
                                alt=""
                              />
                            )}
                            {originLabel(t, card.source_kind, card.source_label)}
                          </span>
                          <span>{card.last_seen}</span>
                        </footer>
                      </button>
                    );
                  })}
                {!visible.some((c) => boardStage(c, workflow) === stage) && (
                  <p className="wk-kanban-empty">{t('shell.noFindings')}</p>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
      {selected && (
        <Modal
          title={`${selected.short_id} / ${t('shell.details')}`}
          onClose={close}
          className="real-card-detail"
        >
          <div className="wk-todo-side-body">
            <ErrorNotice error={error} />
            <span className="wk-todo-state">
              <i />
              {t(
                selected.status === 'dismissed'
                  ? 'common.dismissed'
                  : `board.${boardStage(selected, workflow)}`
              )}
            </span>
            <h2>{selected.title}</h2>
            <dl>
              <div>
                <dt>{t('cards.project')}</dt>
                <dd>{selected.project}</dd>
              </div>
              <div>
                <dt>{t('cards.metaOrigin')}</dt>
                <dd>{originLabel(t, selected.source_kind, selected.source_label)}</dd>
              </div>
              <div>
                <dt>{t('cards.whereTitle')}</dt>
                <dd>{selected.location}</dd>
              </div>
            </dl>
            {selected.code_excerpt && (
              <section>
                <pre>{selected.code_excerpt}</pre>
              </section>
            )}
            {selected.evidence && (
              <section>
                <h3>{t('cards.sourceEvidence')}</h3>
                <EvidenceMarkdown text={selected.evidence} />
              </section>
            )}
            <div className="real-actions">
              <CopyControl
                text={[
                  selected.title,
                  selected.project,
                  selected.location,
                  selected.evidence,
                  selected.code_excerpt,
                ]
                  .filter(Boolean)
                  .join('\n\n')}
                label={t('cards.copyPrompt')}
              />
              <EditorOpen card={selected} />
              {selected.session_id && (
                <button className="btn" onClick={() => run(() => resumeClaudeSession(selected))}>
                  {t('cards.resumeSession')}
                </button>
              )}
              {selected.url && (
                <button className="btn" onClick={() => openExternal(selected.url!)}>
                  {t('cards.openOnGithub')}
                </button>
              )}
              {selected.status !== 'done' && (
                <button className="btn btn-primary" onClick={() => change(selected, 'done')}>
                  {t('common.markDone')}
                </button>
              )}
              <button
                className="btn"
                onClick={() =>
                  change(
                    selected,
                    selected.status === 'done' || selected.status === 'dismissed'
                      ? 'new'
                      : 'dismissed'
                  )
                }
              >
                {t(
                  selected.status === 'done' || selected.status === 'dismissed'
                    ? 'board.reopen'
                    : 'common.dismiss'
                )}
              </button>
            </div>
            <section>
              <h3>{t('workflow.snooze')}</h3>
              <div className="real-actions">
                {isSnoozed(selected, workflow) ? (
                  <button className="btn" onClick={() => snoozeCard(selected, null)}>
                    {t('workflow.resume')}
                  </button>
                ) : (
                  <>
                    <button
                      className="btn"
                      onClick={() => snoozeCard(selected, { until: tomorrow() })}
                    >
                      {t('workflow.tomorrow')}
                    </button>
                    <button
                      className="btn"
                      onClick={() => snoozeCard(selected, { occurrences: selected.occurrences })}
                    >
                      {t('workflow.recurrence')}
                    </button>
                  </>
                )}
              </div>
            </section>
            <section>
              <h3>{t('workflow.history')}</h3>
              <p className="wk-help">{t('workflow.historyHint')}</p>
              <ol className="real-history">
                {cardHistory(selected).map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    <strong>{t(`workflow.event.${event.event}`)}</strong>
                    <span>
                      {new Date(event.at).toLocaleString()} / {t(`common.${event.status}`)} / ×
                      {event.occurrences}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            {data?.projects
              .filter((p) => p.name === selected.project)
              .map((p) => (
                <ProjectCommands key={p.path} project={p} />
              ))}
          </div>
        </Modal>
      )}
      {create && (
        <Modal title={t('cards.newCard')} onClose={() => setCreate(false)}>
          <form
            className="wk-todo-side-body wk-fields"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await createManualCard(title, kind, project || data?.projects[0]?.name || '');
                setCreate(false);
                setTitle('');
                await reload();
              });
            }}
          >
            <ErrorNotice error={error} />
            <label>
              {t('cards.newCardTitle')}
              <input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <select
              aria-label={t('cards.colType')}
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              {(['error', 'task', 'idea'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`common.${k}`)}
                </option>
              ))}
            </select>
            <select
              aria-label={t('cards.project')}
              value={project || data?.projects[0]?.name}
              onChange={(e) => setProject(e.target.value)}
            >
              {data?.projects.map((p) => (
                <option key={p.path} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" type="submit">
              {t('common.create')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function PrList({
  prs,
  onOpen,
}: {
  prs: UiPullRequest[];
  onOpen: (pr: UiPullRequest) => void;
}) {
  const { t } = useTranslation();
  return (
    <ul className="pr-list">
      {prs.map((pr) => (
        <li key={pr.url} className="real-pr-row">
          <button className="real-pr-main" onClick={() => onOpen(pr)}>
            <GitPullRequest size={19} />
            <span>
              <strong>{pr.title}</strong>
              <small>
                {pr.project} / #{pr.number} / {pr.branch}
              </small>
            </span>
          </button>
          <span className="status" data-kind={pr.review === 'none' ? 'open' : 'review'}>
            {t(pr.review === 'none' ? 'shell.open' : 'board.review')}
          </span>
          <button className="btn" onClick={() => onOpen(pr)}>
            {t('shell.details')}
          </button>
        </li>
      ))}
      {!prs.length && <p className="wk-help">{t('pullRequests.noOpenPrs')}</p>}
    </ul>
  );
}
export function PrDetail({ pr, onClose }: { pr: UiPullRequest; onClose: () => void }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<PullRequestDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (pr.repository
      ? desktopInvoke<PullRequestDetails>('get_remote_pr_details', {
          repository: pr.repository,
          number: pr.number,
        })
      : getPullRequestDetails(pr.project, pr.number)
    ).then(
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
  }, [pr]);
  return (
    <Modal title={`#${pr.number} ${pr.title}`} onClose={onClose} className="real-pr-detail">
      <div className="wk-todo-side-body">
        <ErrorNotice error={error} />
        {!detail && !error && <p>{t('common.loading')}</p>}
        {detail && (
          <>
            <EvidenceMarkdown text={detail.body || t('pullRequests.noDescription')} />
            {detail.files.map((file) => (
              <section key={file.filename}>
                <h3>
                  {file.filename} <span className="badge badge-add">+{file.additions}</span>
                  <span className="badge badge-del">−{file.deletions}</span>
                </h3>
                <pre>{file.patch ?? t('pullRequests.noPatch')}</pre>
              </section>
            ))}
          </>
        )}
        <button className="btn" onClick={() => openExternal(pr.url)}>
          {t('cards.openOnGithub')}
        </button>
      </div>
    </Modal>
  );
}
export function ReviewsPage() {
  const { t } = useTranslation();
  const { data, reload, busy } = useWorkspace();
  const [selected, setSelected] = useState<UiPullRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="page-content">
      <header className="page-head enter" style={style(1)}>
        <div>
          <h1 className="page-title">{t('nav.pullRequests')}</h1>
          <p className="page-sub">{t('pullRequests.selectedFoldersOnly')}</p>
        </div>
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            try {
              await refreshGithub();
              await reload();
            } catch (cause) {
              setError(String(cause));
            }
          }}
        >
          <RefreshCw size={14} />
          {t('pullRequests.refresh')}
        </button>
      </header>
      <ErrorNotice error={error} />
      <section className="block enter" style={style(2)}>
        <PrList prs={data?.pull_requests ?? []} onOpen={setSelected} />
      </section>
      {selected && <PrDetail pr={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
export function RepositoriesPage() {
  const { t } = useTranslation();
  const { data, reload, busy } = useWorkspace();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [error, setError] = useState<string | null>(null);
  const recent = (name: string) =>
    (data?.cards ?? [])
      .filter((c) => c.project === name)
      .map((c) => c.last_seen)
      .sort()
      .at(-1) ?? '';
  const projects = [...(data?.projects ?? [])]
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : recent(b.name).localeCompare(recent(a.name))
    );
  return (
    <div className="page-content">
      <header className="page-head enter" style={style(1)}>
        <div>
          <h1 className="page-title">{t('nav.repositories')}</h1>
          <p className="page-sub">{t('pullRequests.selectedFoldersOnly')}</p>
        </div>
        <button
          className="btn"
          onClick={() => chooseWatchFolder().catch((cause) => setError(String(cause)))}
        >
          <Plus size={14} />
          {t('nav.watchFolder')}
        </button>
      </header>
      <ErrorNotice error={error} />
      <div className="toolbar enter" style={style(2)}>
        <label className="search">
          <Search size={15} />
          <input
            placeholder={t('shell.searchRepositories')}
            aria-label={t('shell.searchRepositories')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="wk-choices">
          {['recent', 'name'].map((key) => (
            <button key={key} data-active={sort === key} onClick={() => setSort(key)}>
              {t(`repositories.${key}`)}
            </button>
          ))}
        </div>
        <button
          className="icon-btn"
          disabled={busy}
          aria-label={t('repositories.refresh')}
          onClick={() => reload()}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <div className="repo-grid enter" style={style(3)}>
        {projects.map((p) => (
          <section key={p.path} className="card real-repo">
            <header>
              <Folder size={19} />
              <Link to={`/projects/${encodeURIComponent(p.name)}`}>{p.name}</Link>
            </header>
            <p>{p.path}</p>
            <footer>
              <span>{p.branch}</span>
              <span>
                {t('common.errors')}: {p.errors}
              </span>
              <Link className="btn" to={`/projects/${encodeURIComponent(p.name)}`}>
                {t('projects.open')}
              </Link>
            </footer>
          </section>
        ))}
      </div>
      {!projects.length && (
        <div className="empty">
          <p className="empty-sub">{t('repositories.empty')}</p>
        </div>
      )}
    </div>
  );
}
export function ProjectPage() {
  const { name } = useParams();
  const { data } = useWorkspace();
  const { t } = useTranslation();
  const [files, setFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notice } = useWorkspace();
  const project = data?.projects.find((p) => p.name === name);
  return (
    <div className="page-content">
      <header className="page-head">
        <div>
          <h1 className="page-title">{name}</h1>
          <p className="page-sub">{project?.path ?? t('projects.notFound')}</p>
        </div>
      </header>
      {project && (
        <>
          <ErrorNotice error={error} />
          <div className="real-actions">
            <button className="btn" onClick={() => setFiles(!files)}>
              {t(files ? 'nav.hideFiles' : 'nav.showFiles')}
            </button>
            <button
              className="btn"
              onClick={async () => {
                try {
                  notice(await exportProjectTodo(project.name));
                } catch (cause) {
                  setError(String(cause));
                }
              }}
            >
              {t('shell.exportTodo')}
            </button>
          </div>
          {files && <FileTree project={project.name} />}
          <Priorities cards={(data?.cards ?? []).filter((c) => c.project === project.name)} />
          <ProjectCommands project={project} />
        </>
      )}
    </div>
  );
}

function FileTree({ project, path = '' }: { project: string; path?: string }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<UiFileEntry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    listProjectFiles(project, path).then(
      (value) => {
        if (active) setEntries(value);
      },
      (cause) => {
        if (active) setError(String(cause));
      }
    );
    return () => {
      active = false;
    };
  }, [project, path]);
  return (
    <div className="real-file-tree">
      {!path && <EditorOpen card={{ project, location: '', title: '' }} />}
      <ErrorNotice error={error} />
      {!entries && !error && <p className="wk-help">{t('common.loading')}</p>}
      {entries?.map((entry) => (
        <div key={entry.relative_path}>
          <button
            className="link-more"
            onClick={() => {
              if (entry.is_dir) setOpen(open === entry.relative_path ? null : entry.relative_path);
              else
                void openProjectFile(project, entry.relative_path).catch((cause) =>
                  setError(String(cause))
                );
            }}
          >
            {entry.is_dir && <Folder size={14} />} {entry.name}
          </button>
          {entry.is_dir && open === entry.relative_path && (
            <FileTree project={project} path={entry.relative_path} />
          )}
        </div>
      ))}
    </div>
  );
}
