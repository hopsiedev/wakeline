import type { ReactNode, CSSProperties, KeyboardEvent } from 'react';
import type { RemotePr, GithubWorkspace } from 'src/services/github-workspace';

import { useTranslation } from 'react-i18next';
import { useId, useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Star,
  Lock,
  Globe,
  Clock3,
  Search,
  GitMerge,
  RefreshCw,
  TrendingUp,
  ArrowRight,
  TrendingDown,
  MessageSquare,
  GitPullRequest,
  GitCommitHorizontal,
  GitPullRequestDraft,
  GitPullRequestClosed,
} from 'lucide-react';

import { analytics, periodDelta } from 'src/services/github-analytics';

import { ErrorNotice } from './views';
import { useWorkspace } from './workspace-context';
import { NumberAnimation } from './number-animation';

const enter = (index: number) => ({ '--i': index }) as CSSProperties;
const zeroed = (text: string) => text.replace(/\d+/g, '0');
const PEOPLE_COLORS = ['#f08a3c', '#9d8df5', '#2fd06f', '#4c9bff', '#e7b363', '#e8618c'];
const PAGE = 60;

/** Route of the full-page detail of a pull request. */
export function prPath(pr: Pick<RemotePr, 'repository' | 'number'>) {
  return `/pull-requests/${pr.repository}/${pr.number}`;
}

/** Slot-machine number: rolls up from zero once its card has faded in. */
function Digits({
  value,
  delay = 0,
  className,
  format,
}: {
  value: string | number;
  delay?: number;
  className?: string;
  format?: (value: number) => string;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const wait = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : delay;
    const timer = window.setTimeout(() => setReady(true), wait);
    return () => window.clearTimeout(timer);
  }, [delay]);
  const shown = ready ? value : typeof value === 'number' ? 0 : zeroed(value);
  return (
    <NumberAnimation
      value={shown}
      format={format}
      align="end"
      className={`slot-num ${className ?? ''}`}
    />
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly { id: T; label: ReactNode }[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.id === value)
  );
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].id);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=radio]')[next]?.focus();
  };
  return (
    <div
      className={`seg ${className ?? ''}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ '--n': options.length, '--idx': index } as CSSProperties}
    >
      <span className="seg-thumb" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          tabIndex={option.id === value ? 0 : -1}
          className="seg-btn"
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Sparkline({ data, tone }: { data: number[]; tone: 'good' | 'bad' }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  if (data.length < 2) return null;
  const [width, height] = [132, 34];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * width,
    height - 3 - ((v - min) / (max - min || 1)) * (height - 8),
  ]);
  let line = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    line += ` Q ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  line += ` T ${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
  return (
    <svg
      className="spark"
      data-tone={tone}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        className="spark-area"
        d={`${line} L ${width} ${height} L 0 ${height} Z`}
        fill={`url(#g${id})`}
      />
      <path
        className="spark-line"
        d={line}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        vectorEffect="non-scaling-stroke"
      />
      <circle className="spark-dot" cx={last[0]} cy={last[1]} r={2.6} fill="currentColor" />
    </svg>
  );
}

const STATUS_ICON = {
  merged: GitMerge,
  review: GitPullRequestDraft,
  open: GitPullRequest,
  closed: GitPullRequestClosed,
} as const;

export function StatusPill({ state }: { state: RemotePr['state'] }) {
  const { t } = useTranslation();
  const Icon = STATUS_ICON[state];
  return (
    <span className="pill" data-kind={state}>
      <Icon size={13} strokeWidth={2} />
      {t(`githubDashboard.states.${state}`)}
    </span>
  );
}

function StatusIcon({ state }: { state: RemotePr['state'] }) {
  const Icon = STATUS_ICON[state];
  return (
    <span className="status-dot" data-kind={state}>
      <Icon size={15} strokeWidth={1.9} />
    </span>
  );
}

export function Avatar({ src, size }: { src?: string | null; size: 22 | 32 | 40 }) {
  if (!src) return <span className={`avatar avatar-empty avatar-${size}`} aria-hidden="true" />;
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={`avatar avatar-${size}`}
    />
  );
}

export function formatCount(n: number) {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
}

/** «5 min», «3 h», «2 d» in the user's language. */
export function useAgo() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const format = new Intl.RelativeTimeFormat(i18n.language, {
      numeric: 'always',
      style: 'narrow',
    });
    return (iso: string | null) => {
      if (!iso) return '';
      const minutes = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
      if (minutes < 60) return format.format(-minutes, 'minute');
      const hours = Math.round(minutes / 60);
      if (hours < 24) return format.format(-hours, 'hour');
      const days = Math.round(hours / 24);
      if (days < 30) return format.format(-days, 'day');
      const months = Math.round(days / 30);
      return months < 12
        ? format.format(-months, 'month')
        : format.format(-Math.round(months / 12), 'year');
    };
  }, [i18n.language]);
}

/** Loading, rate-limit and partial-data notices shared by the three GitHub pages. */
export function GithubStatus() {
  const { t, i18n } = useTranslation();
  const { githubBusy, githubError, github, reloadGithub } = useWorkspace();
  const until = github?.rate_limited_until;
  const time = until
    ? new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' }).format(until * 1000)
    : '';
  const limited = !!until || !!githubError?.includes('GITHUB_RATE_LIMITED');
  return (
    <>
      {githubBusy && !github && (
        <p className="wk-help gh-loading" role="status">
          <RefreshCw size={13} className="wk-update-spin" />
          {t('githubDashboard.loading')}
        </p>
      )}
      {limited && (
        <p className="gh-notice" role="status">
          <Clock3 size={14} />
          {time
            ? t('githubDashboard.rateLimitedUntil', { time })
            : t('githubDashboard.rateLimited')}
        </p>
      )}
      {!limited && githubError && (
        <div className="gh-error">
          <ErrorNotice error={githubError} />
          <button type="button" className="btn press" onClick={() => reloadGithub()}>
            <RefreshCw size={14} />
            {t('githubDashboard.retry')}
          </button>
        </div>
      )}
      {!!github?.warnings.length && (
        <details className="gh-partial">
          <summary>{t('githubDashboard.partial', { count: github.warnings.length })}</summary>
          {[...new Set(github.warnings)].map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </details>
      )}
    </>
  );
}

function RefreshButton() {
  const { t } = useTranslation();
  const { githubBusy, reloadGithub } = useWorkspace();
  return (
    <button
      type="button"
      className="btn press btn-refresh"
      disabled={githubBusy}
      onClick={() => reloadGithub()}
    >
      <RefreshCw size={14} className={githubBusy ? 'wk-update-spin' : undefined} />
      {t('repositories.refresh')}
    </button>
  );
}

/* ───────────── Summary ───────────── */

type RangeId = 'today' | 'week' | 'month';
const RANGE_DAYS: Record<RangeId, number> = { today: 1, week: 7, month: 30 };

type Bucket = { label: string; series: Map<string | null, number> };

/** Commit columns: 3-hour slots for today, days for the week and the month. */
function buckets(github: GithubWorkspace, range: RangeId, language: string): Bucket[] {
  const now = new Date();
  if (range === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 8 }, (_, i) => {
      const from = start.getTime() + i * 3 * 3600000;
      const series = new Map<string | null, number>();
      github.commits
        .filter((c) => Date.parse(c.at) >= from && Date.parse(c.at) < from + 3 * 3600000)
        .forEach((c) => series.set(c.author, (series.get(c.author) ?? 0) + 1));
      return { label: `${String(i * 3).padStart(2, '0')}h`, series };
    });
  }
  const report = analytics(github, RANGE_DAYS[range], now);
  return report.labels.map((date, i) => {
    const series = new Map<string | null, number>();
    report.authors.forEach((author) => {
      if (author.series[i]) series.set(author.name, author.series[i]);
    });
    const label =
      range === 'week'
        ? new Intl.DateTimeFormat(language, { weekday: 'short' }).format(date)
        : i % 5 === 0 || i === report.labels.length - 1
          ? new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(date)
          : '';
    return { label, series };
  });
}

function niceCeil(n: number) {
  const step = n <= 10 ? 2 : n <= 40 ? 10 : n <= 120 ? 20 : 50;
  return Math.max(step, Math.ceil(n / step) * step);
}

type Person = {
  name: string | null;
  avatar: string | null;
  color: string;
  total: number;
  repositories: string[];
};

function ActivityChart({ columns, people }: { columns: Bucket[]; people: Person[] }) {
  const { t } = useTranslation();
  const totals = columns.map((column) =>
    [...column.series.values()].reduce((sum, value) => sum + value, 0)
  );
  const ceil = niceCeil(Math.max(0, ...totals));
  return (
    <figure className="chart" role="img" aria-label={t('githubDashboard.activity')}>
      <div className="chart-grid" aria-hidden="true">
        {[1, 0.5, 0].map((f) => (
          <span key={f} data-value={Math.round(ceil * f)} />
        ))}
      </div>
      <ol
        className="chart-cols"
        aria-hidden="true"
        style={{ '--cols': Math.max(1, columns.length) } as CSSProperties}
      >
        {columns.map((column, i) => (
          <li key={i} className="chart-col" style={{ '--col': i } as CSSProperties}>
            <div
              className="bar-wrap has-tip tip-top"
              data-tip={`${column.label || i + 1} · ${totals[i]} ${t('githubDashboard.commits')}`}
              style={{ height: `${(totals[i] / ceil) * 100}%` }}
            >
              <div className="bar">
                {people.map((p) => {
                  const value = column.series.get(p.name) ?? 0;
                  return value ? (
                    <span
                      key={p.name ?? '?'}
                      className="bar-seg"
                      style={{ flexGrow: value, '--c': p.color } as CSSProperties}
                    />
                  ) : null;
                })}
              </div>
            </div>
            <span className="chart-label">{column.label}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function PrRow({ pr, onOpen, index }: { pr: RemotePr; onOpen: () => void; index: number }) {
  const { t } = useTranslation();
  return (
    <li
      className="pr-row pr-row-click"
      style={{ '--row': index } as CSSProperties}
      onClick={onOpen}
    >
      <Avatar src={pr.avatar_url} size={40} />
      <div className="pr-text">
        <p className="pr-title">{pr.title}</p>
        <p className="pr-sub">
          {t('githubDashboard.openedBy', { author: pr.author ?? t('githubDashboard.unknown') })}
          {' · '}
          <span className="review-repo">{pr.repository}</span>
        </p>
      </div>
      <StatusPill state={pr.state} />
      <button
        type="button"
        className="btn-details press"
        aria-label={`${t('shell.details')} #${pr.number}`}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        {t('shell.details')}
      </button>
    </li>
  );
}

export function SummaryPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { github } = useWorkspace();
  const [range, setRange] = useState<RangeId>('week');
  const days = RANGE_DAYS[range];
  const report = github ? analytics(github, days) : null;
  const metrics = [
    { id: 'commits' as const, Icon: GitCommitHorizontal },
    { id: 'pulls' as const, Icon: GitPullRequest },
    { id: 'merged' as const, Icon: GitMerge },
    { id: 'review_hours' as const, Icon: Clock3 },
  ];
  const people: Person[] =
    report?.authors
      .map((person) => ({
        name: person.name,
        repositories: person.repositories,
        avatar: person.avatar,
        color: '',
        total: person.series.reduce((sum, count) => sum + count, 0),
      }))
      .sort((a, b) => b.total - a.total)
      .map((person, index) => ({
        ...person,
        color: PEOPLE_COLORS[index % PEOPLE_COLORS.length],
      })) ?? [];
  const columns = github ? buckets(github, range, i18n.language) : [];
  const total = people.reduce((sum, p) => sum + p.total, 0) || 1;
  const top = people[0]?.total || 1;
  const period = report
    ? range === 'today'
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(report.end)
      : `${new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' }).format(report.start)} – ${new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(report.end)}`
    : '';
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sorted = (github?.pull_requests ?? [])
    .slice()
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const today = sorted.filter((pr) => Date.parse(pr.updated_at) >= startOfDay.getTime());
  const recent = (today.length ? today : sorted).slice(0, 6);
  const ranges: { id: RangeId; label: string }[] = [
    { id: 'today', label: t('shell.today') },
    { id: 'week', label: t('shell.week') },
    { id: 'month', label: t('shell.month') },
  ];

  return (
    <div className="page-content">
      <header className="page-head enter" style={enter(1)}>
        <div className="page-head-text">
          <h1 className="page-title">{t('nav.summary')}</h1>
          <p className="page-sub">
            <span key={range} className="swap-in">
              {period}
            </span>
          </p>
        </div>
        <div className="page-actions">
          <RefreshButton />
          <Segmented label={t('shell.period')} options={ranges} value={range} onChange={setRange} />
        </div>
      </header>
      <GithubStatus />

      <ul className="stats" aria-label={t('shell.metrics')}>
        {metrics.map(({ id, Icon }, index) => {
          const value = report?.current[id] ?? null;
          const delta = report ? periodDelta(value, report.previous[id], range) : null;
          const good = delta === null || (id === 'review_hours' ? delta <= 0 : delta >= 0);
          const spark = (report?.daily ?? []).map((day) => day[id] ?? 0);
          return (
            <li className="stat enter" style={enter(2 + index * 0.4)} key={id}>
              <span className="stat-label">
                <Icon size={16} strokeWidth={1.7} className="stat-icon" />
                {t(`githubDashboard.metrics.${id}`)}
              </span>
              <div className="stat-row">
                <Digits
                  value={
                    value === null ? '—' : id === 'review_hours' ? `${value.toFixed(1)}h` : value
                  }
                  delay={420 + index * 70}
                  className="stat-value"
                />
                {delta !== null && (
                  <span className="delta" data-good={good}>
                    {delta < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                    {delta > 0 ? '+' : ''}
                    {delta}%
                  </span>
                )}
              </div>
              <Sparkline key={range} data={spark} tone={good ? 'good' : 'bad'} />
            </li>
          );
        })}
      </ul>

      <div className="overview-grid">
        <section className="card enter" style={enter(3)}>
          <header className="card-head">
            <h2 className="card-title">{t('githubDashboard.activity')}</h2>
            <ul className="legend" aria-label={t('githubDashboard.contributors')}>
              {people.slice(0, 4).map((p) => (
                <li key={p.name ?? '?'}>
                  <i style={{ '--c': p.color } as CSSProperties} aria-hidden="true" />
                  {p.name ?? t('githubDashboard.unknown')}
                </li>
              ))}
            </ul>
          </header>
          <ActivityChart key={range} columns={columns} people={people} />
        </section>

        <section className="card enter" style={enter(3.5)}>
          <header className="card-head">
            <h2 className="card-title">{t('githubDashboard.contributors')}</h2>
          </header>
          <ol className="leaders">
            {people.slice(0, 5).map((p, i) => (
              <li
                key={p.name ?? '?'}
                className="leader"
                style={{ '--row': i, '--c': p.color } as CSSProperties}
              >
                <Avatar src={p.avatar} size={32} />
                <div className="leader-main">
                  <div className="leader-line">
                    <span className="leader-name">{p.name ?? t('githubDashboard.unknown')}</span>
                    <span className="leader-count">
                      <Digits value={p.total} delay={560 + i * 80} /> {t('githubDashboard.commits')}
                    </span>
                  </div>
                  <div className="share" aria-hidden="true">
                    <span
                      className="share-fill"
                      style={{ '--share': p.total / top } as CSSProperties}
                    />
                  </div>
                  <div className="leader-meta">
                    <details className="leader-repository-list">
                      <summary className="leader-repositories" title={p.repositories.join(' / ')}>
                        {p.repositories.join(' / ')}
                      </summary>
                      <ul>
                        {p.repositories.map((repository) => (
                          <li key={repository}>{repository}</li>
                        ))}
                      </ul>
                    </details>
                    <span className="leader-pct">
                      <Digits value={Math.round((p.total / total) * 100)} delay={700 + i * 80} />%{' '}
                      {t('githubDashboard.ofCommits')}
                    </span>
                  </div>
                </div>
              </li>
            ))}
            {!people.length && <p className="wk-help">{t('githubDashboard.emptyActivity')}</p>}
          </ol>
        </section>
      </div>

      <section className="block enter" style={enter(4.5)}>
        <div className="block-head">
          <h2 className="block-title">
            {today.length ? t('githubDashboard.todayPrs') : t('githubDashboard.recentPrs')}
          </h2>
          <button type="button" className="link-more" onClick={() => navigate('/pull-requests')}>
            {t('shell.viewAll')}
            <ArrowRight size={14} />
          </button>
        </div>
        <ul className="pr-list">
          {recent.map((pr, index) => (
            <PrRow key={pr.id} pr={pr} index={index} onOpen={() => navigate(prPath(pr))} />
          ))}
          {github && !recent.length && <p className="wk-help">{t('githubDashboard.emptyPrs')}</p>}
        </ul>
      </section>
    </div>
  );
}

/* ───────────── Repositories ───────────── */

type SortId = 'recent' | 'name' | 'stars';
const FAVORITES = 'wakeline-favorite-repos';
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Rust: '#dea584',
  Go: '#00ADD8',
  Python: '#3572A5',
  MDX: '#fcb32c',
  Java: '#b07219',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  'C#': '#178600',
  'C++': '#f34b7d',
  C: '#555555',
  Ruby: '#701516',
  PHP: '#4F5D95',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Dart: '#00B4AB',
  Vue: '#41b883',
  Svelte: '#ff3e00',
};

function readFavorites() {
  try {
    const list = JSON.parse(localStorage.getItem(FAVORITES) ?? '[]');
    return new Set<string>(Array.isArray(list) ? list : []);
  } catch {
    return new Set<string>();
  }
}

export function RepositoriesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { github } = useWorkspace();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortId>('recent');
  const [favorites, setFavorites] = useState(readFavorites);
  const repositories = github?.repositories ?? [];
  const prs = github?.pull_requests ?? [];
  const weekAgo = Date.now() - 7 * 86400000;
  const openPrs = prs.filter((pr) => pr.state === 'open' || pr.state === 'review').length;
  const thisWeek = prs.filter((pr) => Date.parse(pr.created_at) >= weekAgo).length;
  const q = query.trim().toLowerCase();
  const list = repositories
    .filter((repo) => !q || `${repo.name} ${repo.description ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => {
      const pinned = Number(favorites.has(b.name)) - Number(favorites.has(a.name));
      if (pinned) return pinned;
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'stars') return b.stars - a.stars;
      return (b.pushed_at ?? '').localeCompare(a.pushed_at ?? '');
    });
  const [shown, setShown] = useState(PAGE);
  const toggle = (name: string) =>
    setFavorites((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      localStorage.setItem(FAVORITES, JSON.stringify([...next]));
      return next;
    });
  const sorts: { id: SortId; label: string }[] = [
    { id: 'recent', label: t('repositories.recent') },
    { id: 'name', label: t('repositories.name') },
    { id: 'stars', label: t('repositories.stars') },
  ];

  return (
    <div className="page-content">
      <header className="page-head enter" style={enter(1)}>
        <div className="page-head-text">
          <h1 className="page-title">{t('nav.repositories')}</h1>
          <p className="page-sub">
            {t('githubDashboard.repositorySummary', {
              count: repositories.length,
              open: openPrs,
              week: thisWeek,
            })}
          </p>
        </div>
        <div className="page-actions">
          <RefreshButton />
        </div>
      </header>
      <GithubStatus />

      <div className="toolbar enter" style={enter(2)}>
        <label className="search">
          <Search size={15} className="search-icon" />
          <span className="sr-only">{t('shell.searchRepositories')}</span>
          <input
            type="search"
            value={query}
            placeholder={t('shell.searchRepositories')}
            onChange={(event) => setQuery(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <Segmented label={t('repositories.sort')} options={sorts} value={sort} onChange={setSort} />
      </div>

      {github && !list.length ? (
        <div className="empty enter" style={enter(3)}>
          <p className="empty-title">{t('githubDashboard.emptyRepositories')}</p>
          {q && (
            <button type="button" className="btn press" onClick={() => setQuery('')}>
              {t('githubDashboard.clearSearch')}
            </button>
          )}
        </div>
      ) : (
        <ul className="repo-grid" aria-label={t('nav.repositories')}>
          {list.slice(0, shown).map((repo, index) => (
            <RepoCard
              key={repo.name}
              repo={repo}
              index={index}
              github={github!}
              starred={favorites.has(repo.name)}
              onStar={() => toggle(repo.name)}
              onOpen={() => navigate(`/pull-requests?repository=${encodeURIComponent(repo.name)}`)}
            />
          ))}
        </ul>
      )}
      {list.length > shown && (
        <button type="button" className="btn press gh-more" onClick={() => setShown(shown + PAGE)}>
          {t('githubDashboard.showMore', { count: list.length - shown })}
        </button>
      )}
    </div>
  );
}

function RepoCard({
  repo,
  index,
  github,
  starred,
  onStar,
  onOpen,
}: {
  repo: GithubWorkspace['repositories'][number];
  index: number;
  github: GithubWorkspace;
  starred: boolean;
  onStar: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const ago = useAgo();
  const slash = repo.name.indexOf('/');
  const org = repo.name.slice(0, slash + 1);
  const name = repo.name.slice(slash + 1);
  const VisIcon = repo.private ? Lock : Globe;
  const open = github.pull_requests.filter(
    (pr) => pr.repository === repo.name && (pr.state === 'open' || pr.state === 'review')
  ).length;
  // Commits per day over the last 14 days.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 13);
  const activity = Array.from({ length: 14 }, () => 0);
  github.commits.forEach((commit) => {
    if (commit.repository !== repo.name) return;
    const day = Math.floor((Date.parse(commit.at) - start.getTime()) / 86400000);
    if (day >= 0 && day < 14) activity[day] += 1;
  });
  const peak = Math.max(1, ...activity);
  const delay = Math.min(index, 12);

  return (
    <li className="card repo enter" style={enter(3 + delay * 0.35)}>
      <div className="repo-head">
        <VisIcon size={15} strokeWidth={1.8} className="repo-vis-icon" />
        <h2 className="repo-name">
          <button
            type="button"
            className="repo-link"
            onClick={onOpen}
            title={t('nav.pullRequests')}
          >
            {org && <span className="repo-org">{org}</span>}
            {name}
          </button>
        </h2>
        <span className="tag">
          {repo.private ? t('githubDashboard.private') : t('githubDashboard.public')}
        </span>
        <button
          type="button"
          className="star-btn press"
          aria-pressed={starred}
          aria-label={t('githubDashboard.favorite', { name: repo.name })}
          onClick={onStar}
        >
          <Star size={16} strokeWidth={1.8} />
        </button>
      </div>
      <p className="repo-desc">{repo.description ?? ''}</p>
      <div
        className="mini-bars"
        role="img"
        aria-label={t('githubDashboard.commitBars', { peak: Math.max(...activity) })}
      >
        {activity.map((value, i) => (
          <span key={i} style={{ '--h': value / peak, '--bar': i } as CSSProperties} />
        ))}
      </div>
      <div className="repo-foot">
        {repo.language && (
          <span className="repo-lang">
            <i
              style={{ background: LANGUAGE_COLORS[repo.language] ?? '#8b8b8b' }}
              aria-hidden="true"
            />
            {repo.language}
          </span>
        )}
        <span className="repo-stat">
          <Star size={13} strokeWidth={1.9} />
          <Digits value={repo.stars} format={formatCount} delay={420 + delay * 80} />
        </span>
        <span className="repo-stat">
          <GitPullRequest size={13} strokeWidth={1.9} />
          {t('githubDashboard.openCount', { count: open })}
        </span>
        {repo.pushed_at && (
          <span className="repo-updated">
            {t('githubDashboard.updated', { ago: ago(repo.pushed_at) })}
          </span>
        )}
      </div>
    </li>
  );
}

/* ───────────── Code review ───────────── */

type FilterId = 'all' | RemotePr['state'];
const ORDER: FilterId[] = ['all', 'open', 'review', 'merged', 'closed'];

export function ReviewsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { github } = useWorkspace();
  const [chatOpen, setChatOpen] = useState(
    () => sessionStorage.getItem('wakeline-review-chat-open') !== 'false'
  );
  useEffect(() => {
    const change = (event: Event) => setChatOpen((event as CustomEvent<boolean>).detail);
    window.addEventListener('wakeline:chat-state', change);
    return () => window.removeEventListener('wakeline:chat-state', change);
  }, []);
  const [filter, setFilter] = useState<FilterId>('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const repository = new URLSearchParams(location.search).get('repository');
  const q = query.trim().toLowerCase();
  const scoped = (github?.pull_requests ?? [])
    .filter(
      (pr) =>
        (!repository || pr.repository === repository) &&
        (!q || `${pr.title} ${pr.repository} ${pr.author ?? ''}`.toLowerCase().includes(q))
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const count = (id: FilterId) =>
    id === 'all' ? scoped.length : scoped.filter((pr) => pr.state === id).length;
  const options = ORDER.map((id) => ({
    id,
    label: (
      <>
        {t(id === 'all' ? 'common.all' : `githubDashboard.states.${id}`)}
        <span className="seg-count">{count(id)}</span>
      </>
    ),
  }));
  const list = filter === 'all' ? scoped : scoped.filter((pr) => pr.state === filter);
  const waiting = count('review');

  return (
    <div className="page-content wk-review-page">
      <div className="wk-review-heading">
        <header className="page-head enter" style={enter(1)}>
          <div className="page-head-text">
            <h1 className="page-title">{t('nav.pullRequests')}</h1>
            <p className="page-sub">
              {repository ? (
                <span className="gh-scope">
                  {repository}
                  <button
                    type="button"
                    className="link-more"
                    onClick={() => navigate('/pull-requests')}
                  >
                    {t('githubDashboard.allRepositories')}
                  </button>
                </span>
              ) : (
                t('githubDashboard.waiting', { count: waiting })
              )}
            </p>
          </div>
          <div className="page-actions">
            <button
              type="button"
              className="btn press"
              aria-expanded={chatOpen}
              onClick={() => {
                window.dispatchEvent(new Event('wakeline:chat-toggle'));
              }}
            >
              <MessageSquare size={16} />
              {t('reviewChat.open')}
            </button>
            <RefreshButton />
          </div>
        </header>
      </div>
      <GithubStatus />
      <div className="wk-reviews-layout" data-chat="false">
        <div>
          <div className="toolbar enter" style={enter(2)}>
            <Segmented
              label={t('githubDashboard.filter')}
              options={options}
              value={filter}
              onChange={(next) => {
                setFilter(next);
                setShown(PAGE);
              }}
              className="seg-wide"
            />
            <label className="search">
              <Search size={15} className="search-icon" />
              <span className="sr-only">{t('githubDashboard.searchPrs')}</span>
              <input
                type="search"
                value={query}
                placeholder={t('githubDashboard.searchPrs')}
                onChange={(event) => setQuery(event.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          </div>

          <ul key={filter} className="review-list" aria-label={t('nav.pullRequests')}>
            {list.slice(0, shown).map((pr, index) => (
              <ReviewRow
                key={pr.id}
                pr={pr}
                index={Math.min(index, 12)}
                onOpen={() => navigate(prPath(pr))}
              />
            ))}
            {github && !list.length && <p className="wk-help">{t('githubDashboard.emptyPrs')}</p>}
          </ul>
          {list.length > shown && (
            <button
              type="button"
              className="btn press gh-more"
              onClick={() => setShown(shown + PAGE)}
            >
              {t('githubDashboard.showMore', { count: list.length - shown })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ pr, index, onOpen }: { pr: RemotePr; index: number; onOpen: () => void }) {
  const { t } = useTranslation();
  const ago = useAgo();
  const hasDiff = typeof pr.additions === 'number' && typeof pr.deletions === 'number';
  const total = (pr.additions ?? 0) + (pr.deletions ?? 0) || 1;
  const green = Math.round(((pr.additions ?? 0) / total) * 5);
  return (
    <li className="review-row enter" style={enter(2.6 + index * 0.25)} onClick={onOpen}>
      <StatusIcon state={pr.state} />
      <div className="review-main">
        <p className="pr-title">
          #{pr.number} {pr.title}
        </p>
        <p className="review-meta">
          <span className="review-repo">{pr.repository}</span>
          {pr.author && (
            <>
              <span aria-hidden="true">·</span>
              <span className="review-author">
                <Avatar src={pr.avatar_url} size={22} />
                {pr.author}
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{ago(pr.updated_at)}</span>
          {typeof pr.comments === 'number' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="review-comments">
                <MessageSquare size={13} strokeWidth={1.9} />
                {pr.comments}
              </span>
            </>
          )}
        </p>
      </div>
      {hasDiff && (
        <div className="diffstat">
          <span className="diff-add">+{pr.additions}</span>
          <span className="diff-del">−{pr.deletions}</span>
          <span className="diff-blocks" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <i key={i} data-kind={i < green ? 'add' : 'del'} />
            ))}
          </span>
        </div>
      )}
      <StatusPill state={pr.state} />
      <button
        type="button"
        className="btn-details press"
        aria-label={`${t('shell.details')} #${pr.number}`}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        {t('shell.details')}
      </button>
    </li>
  );
}
