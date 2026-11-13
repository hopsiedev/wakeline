import './release-patch.css';

import { useTranslation } from 'react-i18next';
import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  X,
  Bug,
  Star,
  Check,
  GitMerge,
  ArrowRight,
  CirclePlus,
  ChevronLeft,
  CircleArrowUp,
  GitPullRequest,
  GitPullRequestArrow,
} from 'lucide-react';

import { CONFIG } from 'src/config-global';
import {
  RELEASES,
  RELEASE_SHOWN,
  shouldShowRelease,
  RELEASE_PRESENTATION,
} from 'src/services/release-notes';

import { Github } from './brand-icons';
import { usePatchSlides } from './release-patch';
import { useRelease019Slides } from './release-019';
import { useRelease0110Slides } from './release-0110';

function Kind({ kind }: { kind: string }) {
  const { t } = useTranslation();
  const Icon = kind === 'feature' ? CirclePlus : kind === 'fix' ? Bug : CircleArrowUp;
  const label =
    kind === 'feature'
      ? t('releasePresentation.ui.new_feature')
      : kind === 'fix'
        ? t('releasePresentation.ui.fix')
        : t('releasePresentation.ui.update');
  return (
    <span className="wk-change-kind" title={label} aria-label={label} role="img" tabIndex={0}>
      <Icon size={16} />
    </span>
  );
}
function UpdateArt({ id }: { id: (typeof RELEASE_PRESENTATION)[number]['id'] }) {
  const index = {
    todo: 0,
    priorities: 1,
    snooze: 2,
    history: 3,
    repositories: 4,
    reviews: 5,
    connectors: 6,
  }[id];
  const { t } = useTranslation();
  return (
    <div className={'wk-update-art wk-art-' + index} aria-hidden="true">
      {id === 'repositories' && (
        <div className="wk-art-repos">
          {['owner/repository', 'owner/workspace', 'owner/project'].map((name, i) => (
            <div className="wk-art-repo" key={name} style={{ '--layer': i } as React.CSSProperties}>
              <div>
                <img src="/logo/wakeline-mark.svg" width="21" height="17" />
                <span>{name}</span>
                <Star size={12} />
              </div>
              <div className="wk-art-line" />
              <div className="wk-art-spark">
                {[20, 35, 26, 48, 37, 58, 45, 66].map((h, j) => (
                  <i key={j} style={{ height: h + '%', animationDelay: j * 0.1 + 's' }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {id === 'reviews' && (
        <div className="wk-art-review">
          {[
            { Icon: GitPullRequest, label: t('releasePresentation.ui.open') },
            { Icon: GitPullRequestArrow, label: t('releasePresentation.ui.in_review') },
            { Icon: GitMerge, label: t('releasePresentation.ui.merged') },
          ].map((item, i) => (
            <div key={item.label} style={{ animationDelay: i * 0.45 + 's' }}>
              <span>
                <item.Icon size={18} />
              </span>
              <strong>{item.label}</strong>
              <Check size={14} />
            </div>
          ))}
        </div>
      )}
      {id === 'connectors' && (
        <div className="wk-art-connectors">
          <div className="wk-art-hub">
            <img src="/logo/wakeline-mark.svg" alt="" width="46" height="30" />
          </div>
          <div className="wk-art-wires">
            <i />
            <i />
            <i />
          </div>
          <div className="wk-art-tools">
            <span>
              <Github size={22} />
            </span>
            <span>
              <img src="/assets/icons/agents/claude.svg" width="22" height="22" />
            </span>
            <span>
              <img src="/assets/icons/agents/codex.svg" width="22" height="22" />
            </span>
          </div>
          <code>Wakeline MCP</code>
        </div>
      )}
      {['todo', 'priorities', 'snooze', 'history'].includes(id) && (
        <div className="wk-art-review">
          {(id === 'todo'
            ? [
                t('releasePresentation.ui.to_do'),
                t('releasePresentation.ui.in_progress'),
                t('releasePresentation.ui.in_review'),
                t('releasePresentation.ui.resolved'),
              ]
            : id === 'priorities'
              ? [
                  t('releasePresentation.ui.recurring_error'),
                  t('releasePresentation.ui.next_step'),
                  t('releasePresentation.ui.with_context'),
                ]
              : id === 'snooze'
                ? [
                    t('releasePresentation.ui.until_tomorrow'),
                    t('releasePresentation.ui.new_occurrence'),
                    t('releasePresentation.ui.resume'),
                  ]
                : [
                    t('releasePresentation.ui.origin'),
                    t('releasePresentation.ui.evidence'),
                    t('releasePresentation.ui.resolution'),
                  ]
          ).map((label, i) => (
            <div key={label} style={{ animationDelay: i * 0.4 + 's' }}>
              <Check size={15} />
              <strong>{label}</strong>
            </div>
          ))}
        </div>
      )}
      <span className="wk-art-caption">{t(`releasePresentation.features.${id}.label`)}</span>
    </div>
  );
}
export function WakelineReleaseDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const release = RELEASES.find((item) => item.version === CONFIG.appVersion);
  // Each version has its own presentation; the installed version picks it.
  const slides018 = usePatchSlides();
  const slides019 = useRelease019Slides();
  const slides0110 = useRelease0110Slides();
  const patchSlides =
    release?.version === '0.1.10'
      ? slides0110
      : release?.version === '0.1.9'
        ? slides019
        : slides018;
  const patchPresentation = release?.presentation === 'patch';
  const changes = patchPresentation
    ? patchSlides.map((slide) => ({ id: slide.id, kind: slide.kind, slide }))
    : RELEASE_PRESENTATION.map((change) => ({ ...change, slide: null }));
  const copy = (change: (typeof changes)[number], field: 'title' | 'text' | 'label') =>
    change.slide
      ? change.slide[field === 'label' ? 'caption' : field]
      : t(`releasePresentation.features.${change.id}.${field}`);
  const patchOnly = release?.features.length === 0 && !patchPresentation;
  const fixes = release?.fixes[i18n.language.startsWith('es') ? 'es' : 'en'] ?? [];
  const ref = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<'all' | 'story'>(patchOnly ? 'all' : 'story');
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [busy, setBusy] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const next = (index: number) => {
    if (busy || index === step) return;
    setDirection(index > step ? 1 : -1);
    setBusy(true);
    setStep(index);
  };
  const variants = {
    enter: (dir: number) => ({ opacity: 0, x: reduced ? 0 : dir * 16 }),
    center: { opacity: 1, x: 0 },
    leave: (dir: number) => ({ opacity: 0, x: reduced ? 0 : -dir * 16 }),
  };
  return (
    <dialog
      ref={ref}
      className={'wk-release' + (patchPresentation ? ' wk-release-patch' : '')}
      data-view={view}
      aria-labelledby="wk-release-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="wk-release-surface">
        <header className="wk-release-head">
          <div>
            <img src="/logo/wakeline-mark.svg" alt="" width="27" height="19" />
            <span>
              Wakeline <small>/ v{CONFIG.appVersion}</small>
            </span>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('releasePresentation.ui.close_release_notes')}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {view === 'all' ? (
          <>
            <div className="wk-release-intro">
              <h2 id="wk-release-title">{t('releasePresentation.ui.all_changes')}</h2>
              <p>{t('releasePresentation.ui.changes_in_this_wakeline_release')}</p>
            </div>
            <div className="wk-release-scroll">
              {!patchOnly &&
                changes
                  .filter((change) => !change.slide?.closing)
                  .map((change, i) => (
                    <section className="wk-unified-change" data-change={i} key={change.id}>
                      {change.slide ? (
                        change.slide.art
                      ) : (
                        <UpdateArt id={change.id as (typeof RELEASE_PRESENTATION)[number]['id']} />
                      )}
                      <div>
                        <div className="wk-change-label">
                          <Kind kind={change.kind} />
                          <span>{copy(change, 'label')}</span>
                        </div>
                        <h3>{copy(change, 'title')}</h3>
                        <p>{copy(change, 'text')}</p>
                      </div>
                    </section>
                  ))}
              <section className="wk-release-fixes" data-patch={patchOnly}>
                <h3>
                  <Kind kind="fix" />
                  {t('releasePresentation.ui.what_we_fixed')}
                  <span className="wk-fix-count">{fixes.length}</span>
                </h3>
                {/* Fixes enter one after another, like the update presentation. */}
                <ul>
                  {fixes.map((text, index) => (
                    <motion.li
                      key={text}
                      initial={reduced ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12 + index * 0.08, duration: 0.32, ease: 'easeOut' }}
                    >
                      <motion.span
                        className="wk-fix-check"
                        aria-hidden="true"
                        initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          delay: 0.24 + index * 0.08,
                          type: 'spring',
                          stiffness: 420,
                          damping: 18,
                        }}
                      >
                        <Check size={13} strokeWidth={3} />
                      </motion.span>
                      <span>{text}</span>
                    </motion.li>
                  ))}
                </ul>
              </section>
            </div>
            <footer className="wk-release-footer">
              {!patchOnly && (
                <button type="button" className="btn" onClick={() => setView('story')}>
                  {t('releasePresentation.ui.view_presentation')}
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={onClose}>
                {t('releasePresentation.ui.got_it')}
                <Check size={15} />
              </button>
            </footer>
          </>
        ) : (
          <>
            <div className="wk-story-viewport">
              <AnimatePresence mode="wait" custom={direction} initial={false}>
                <motion.div
                  key={step}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="leave"
                  transition={{ duration: reduced ? 0.12 : 0.24, ease: [0.2, 0.8, 0.2, 1] }}
                  onAnimationComplete={(definition) => {
                    if (definition === 'center') setBusy(false);
                  }}
                >
                  {changes[step].slide ? (
                    changes[step].slide.art
                  ) : (
                    <UpdateArt
                      id={changes[step].id as (typeof RELEASE_PRESENTATION)[number]['id']}
                    />
                  )}
                  <div className="wk-story-copy">
                    <div className="wk-change-label">
                      <Kind kind={changes[step].kind} />
                      <span>
                        {t(
                          !patchPresentation || changes[step].kind === 'feature'
                            ? 'releasePresentation.ui.what_s_new'
                            : changes[step].kind === 'fix'
                              ? 'releasePresentation.ui.what_we_fixed'
                              : 'releasePresentation.ui.update'
                        )}
                      </span>
                    </div>
                    <h2 id="wk-release-title">{copy(changes[step], 'title')}</h2>
                    <p>{copy(changes[step], 'text')}</p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="wk-story-dots">
              {changes.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy}
                  aria-label={copy(item, 'label')}
                  data-active={step === i}
                  onClick={() => next(i)}
                >
                  <i />
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary wk-story-next"
              type="button"
              disabled={busy}
              onClick={() => (step === changes.length - 1 ? onClose() : next(step + 1))}
            >
              {step === changes.length - 1
                ? t('releasePresentation.ui.get_started')
                : t('releasePresentation.ui.next')}
              <ArrowRight size={17} />
            </button>
            <footer className="wk-release-footer">
              <button
                className="wk-text-button"
                type="button"
                disabled={busy}
                onClick={() => (step > 0 ? next(step - 1) : setView('all'))}
              >
                {step > 0 ? (
                  <>
                    <ChevronLeft size={13} />
                    {t('releasePresentation.ui.previous')}
                  </>
                ) : (
                  t('releasePresentation.ui.all_changes')
                )}
              </button>
              <span>
                {step + 1} / {changes.length}
              </span>
              <button className="wk-text-button" type="button" onClick={onClose}>
                {t('releasePresentation.ui.skip')}
              </button>
            </footer>
          </>
        )}
      </div>
    </dialog>
  );
}

export function ReleaseNotes() {
  const [open, setOpen] = useState(false);
  const acknowledge = useRef(false);
  useEffect(() => {
    if (
      '__TAURI_INTERNALS__' in window &&
      shouldShowRelease(CONFIG.appVersion, localStorage.getItem(RELEASE_SHOWN))
    ) {
      acknowledge.current = true;
      setOpen(true);
    }
    const show = () => setOpen(true);
    window.addEventListener('wakeline:release-history', show);
    return () => window.removeEventListener('wakeline:release-history', show);
  }, []);
  return open ? (
    <WakelineReleaseDialog
      onClose={() => {
        setOpen(false);
        if (acknowledge.current) {
          localStorage.setItem(RELEASE_SHOWN, CONFIG.appVersion);
          acknowledge.current = false;
        }
        window.dispatchEvent(new CustomEvent('wakeline:release-dismissed'));
      }}
    />
  ) : null;
}
