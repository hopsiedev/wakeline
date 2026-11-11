import type { UiCard, UiPullRequest } from 'src/services/wakeline';
import type { DailyCounts, SummarySnapshot } from 'src/services/daily-summary-state';

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Bug,
  Check,
  Lightbulb,
  ArrowRight,
  CheckSquare,
  CircleCheck,
  GitPullRequest,
} from 'lucide-react';

import { CONFIG } from 'src/config-global';
import { remoteDetail } from 'src/services/github-pr';
import { RELEASE_SHOWN, shouldShowRelease } from 'src/services/release-notes';
import { isSnoozed, getWorkflow, priorityCards } from 'src/services/card-workflow';
import {
  localDay,
  DAILY_SHOWN,
  snapshotCards,
  DAILY_SNAPSHOT,
  summarizeChanges,
  shouldShowSummary,
  dailySummaryEnabled,
} from 'src/services/daily-summary-state';

import { Modal } from './views';
import { useWorkspace } from './workspace-context';
import { NumberAnimation } from './number-animation';

export function DailySummary() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data, error, github } = useWorkspace();
  const [pendingCounts, setPendingCounts] = useState({ errors: 0, tasks: 0, ideas: 0 });
  const [counts, setCounts] = useState<DailyCounts | null>(null);
  const [cards, setCards] = useState<{ card: UiCard; reason: string; age: number }[]>([]);
  const [prs, setPrs] = useState<UiPullRequest[]>([]);
  const [failed, setFailed] = useState(false);
  const checking = useRef(false);
  const check = useCallback(
    (manual = false) => {
      if (
        checking.current ||
        document.visibilityState === 'hidden' ||
        (!manual && !dailySummaryEnabled())
      )
        return;
      if (!manual && shouldShowRelease(CONFIG.appVersion, localStorage.getItem(RELEASE_SHOWN)))
        return;
      if (!data || error) {
        if (manual) {
          setFailed(true);
          setCounts({ errors: 0, tasks: 0, ideas: 0, completed: 0 });
        }
        return;
      }
      checking.current = true;
      try {
        let previous: SummarySnapshot | null = null;
        try {
          previous = JSON.parse(localStorage.getItem(DAILY_SNAPSHOT) ?? 'null');
        } catch {
          /* Keep prior raw storage intact until a valid summary is displayed. */
        }
        const today = localDay();
        const changes = summarizeChanges(data.cards, previous, today);
        const priorities = priorityCards(data.cards, getWorkflow(), today);
        const pending = (
          github
            ? github.pull_requests
                .filter((pr) => pr.state === 'open' || pr.state === 'review')
                .map(remoteDetail)
            : data.pull_requests
        ).filter((pr) => !pr.draft && (pr.review !== 'approved' || pr.ci === 'failing'));
        if (
          manual ||
          shouldShowSummary(
            changes,
            today,
            localStorage.getItem(DAILY_SHOWN),
            priorities.length + pending.length
          )
        ) {
          setFailed(false);
          setCounts(changes);
          const active = data.cards.filter(
            (card) => ['new', 'accepted'].includes(card.status) && !isSnoozed(card, getWorkflow())
          );
          setPendingCounts({
            errors: active.filter((card) => card.kind === 'error').length,
            tasks: active.filter((card) => card.kind === 'task').length,
            ideas: active.filter((card) => card.kind === 'idea').length,
          });
          setCards(priorities.slice(0, 2));
          setPrs(pending);
          if (!manual) localStorage.setItem(DAILY_SHOWN, today);
          localStorage.setItem(DAILY_SNAPSHOT, JSON.stringify(snapshotCards(data.cards)));
        }
      } finally {
        checking.current = false;
      }
    },
    [data, error, github]
  );
  useEffect(() => {
    check();
    const auto = () => check();
    const manual = () => check(true);
    const preference = () => {
      if (!dailySummaryEnabled()) setCounts(null);
    };
    window.addEventListener('focus', auto);
    window.addEventListener('wakeline:release-dismissed', auto);
    window.addEventListener('wakeline:open-summary', manual);
    window.addEventListener('wakeline:daily-summary-preference', preference);
    document.addEventListener('visibilitychange', auto);
    return () => {
      window.removeEventListener('focus', auto);
      window.removeEventListener('wakeline:release-dismissed', auto);
      window.removeEventListener('wakeline:open-summary', manual);
      window.removeEventListener('wakeline:daily-summary-preference', preference);
      document.removeEventListener('visibilitychange', auto);
    };
  }, [check]);
  const total = pendingCounts.errors + pendingCounts.tasks + pendingCounts.ideas;
  const caughtUp = !failed && total === 0 && prs.length === 0;
  return (
    <>
      {counts && (
        <Modal
          title={t('dailySummary.title')}
          className="wk-daily"
          brand
          onClose={() => setCounts(null)}
        >
          <div className="wk-daily-body">
            <p className="wk-daily-date">
              {new Intl.DateTimeFormat(i18n.language, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }).format(new Date())}
            </p>
            {caughtUp && <CircleCheck className="wk-daily-caught-up" size={38} />}
            <h1>{t(caughtUp ? 'dailySummary.upToDate' : 'dailySummary.title')}</h1>
            <p className="wk-daily-intro">
              {failed
                ? t('dailySummary.failed')
                : caughtUp
                  ? t('dailySummary.upToDateBody')
                  : t('dailySummary.pendingIntro', {
                      count: pendingCounts.errors + pendingCounts.tasks + pendingCounts.ideas,
                    })}
            </p>
            {!failed && !caughtUp && (
              <>
                <div className="wk-daily-stats">
                  {(['errors', 'tasks', 'ideas'] as const).map((kind) => (
                    <div key={kind}>
                      <strong>
                        <NumberAnimation value={pendingCounts[kind]} />
                      </strong>
                      <span>{t(`dailySummary.pendingKinds.${kind}`)}</span>
                    </div>
                  ))}
                </div>
                <section className="wk-daily-attention">
                  {!!cards.length && <h2>{t('dailySummary.needsAttention')}</h2>}
                  {cards.map(({ card, reason, age }) => (
                    <button
                      key={card.fingerprint}
                      onClick={() => {
                        setCounts(null);
                        navigate(`/cards/${encodeURIComponent(card.fingerprint)}`);
                      }}
                    >
                      <span className="wk-daily-kind" data-kind={card.kind}>
                        {card.kind === 'error' ? (
                          <Bug size={16} />
                        ) : card.kind === 'task' ? (
                          <CheckSquare size={16} />
                        ) : (
                          <Lightbulb size={16} />
                        )}
                      </span>
                      <span>
                        <strong>{card.title}</strong>
                        <small>
                          {card.project} ·{' '}
                          {t(`connectors.${card.source_label}`, {
                            defaultValue: card.source_label,
                          })}{' '}
                          ·{' '}
                          {t(`workflow.reason.${reason}`, {
                            count: reason === 'aging' ? age : card.occurrences,
                          })}
                        </small>
                      </span>
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </section>
                {prs.length > 0 && (
                  <button
                    className="wk-daily-reviews"
                    onClick={() => {
                      setCounts(null);
                      navigate('/pull-requests');
                    }}
                  >
                    <GitPullRequest size={17} />
                    <span>{t('dailySummary.reviewCount', { count: prs.length })}</span>
                    <ArrowRight size={15} />
                  </button>
                )}
                {counts.completed > 0 && (
                  <p className="wk-daily-done">
                    <Check size={14} />
                    {t('dailySummary.resolvedCount', { count: counts.completed })}
                  </p>
                )}
                {!cards.length && !prs.length && !Object.values(counts).some(Boolean) && (
                  <p className="wk-help">{t('dailySummary.empty')}</p>
                )}
              </>
            )}
          </div>
          <footer>
            <span>{t('dailySummary.footer')}</span>
            <button
              className="btn btn-primary"
              onClick={() => {
                setCounts(null);
                if (!caughtUp) navigate('/cards');
              }}
            >
              {t(caughtUp ? 'account.close' : 'dailySummary.viewTasks')}
              <ArrowRight size={14} />
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
