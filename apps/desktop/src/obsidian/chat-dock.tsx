import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useRef, useState, useEffect } from 'react';
import { X, Check, ChevronDown } from 'lucide-react';

import { useWorkspace } from './workspace-context';
import { PrChat, threadHasMessages } from './pr-chat';

type Session = {
  id: string;
  repository: string;
  number?: number;
  title?: string;
  overview: boolean;
};
const general: Session = { id: 'overview:', repository: '', overview: true };
function savedSessions(): Session[] {
  try {
    const saved = JSON.parse(localStorage.getItem('wakeline-review-sessions') ?? '[]');
    return Array.isArray(saved)
      ? [
          general,
          ...saved.filter(
            (s: Session) =>
              s.id !== general.id &&
              typeof s.id === 'string' &&
              typeof s.repository === 'string' &&
              threadHasMessages(s.id)
          ),
        ].slice(0, 60)
      : [general];
  } catch {
    return [general];
  }
}
// Only conversations where someone wrote are kept between visits.
function persistSessions(sessions: Session[]) {
  try {
    localStorage.setItem(
      'wakeline-review-sessions',
      JSON.stringify(
        sessions.filter((item) => item.id !== general.id && threadHasMessages(item.id))
      )
    );
  } catch {
    /* Optional cache. */
  }
}

export function ChatDock() {
  const { t } = useTranslation();
  const { github } = useWorkspace();
  const location = useLocation();
  const [sessions, setSessions] = useState(savedSessions);
  const [current, setCurrent] = useState(
    () => localStorage.getItem('wakeline-review-session') ?? general.id
  );
  const [open, setOpen] = useState(
    () =>
      sessionStorage.getItem('wakeline-review-chat-open') === 'true' ||
      (location.pathname.startsWith('/pull-requests') &&
        sessionStorage.getItem('wakeline-review-chat-open') !== 'false')
  );
  useEffect(() => {
    sessionStorage.setItem('wakeline-review-chat-open', String(open));
    window.dispatchEvent(new CustomEvent('wakeline:chat-state', { detail: open }));
  }, [open]);
  useEffect(() => {
    const toggle = () =>
      setOpen((value) => {
        sessionStorage.setItem('wakeline-review-chat-open', String(!value));
        return !value;
      });
    window.addEventListener('wakeline:chat-toggle', toggle);
    return () => window.removeEventListener('wakeline:chat-toggle', toggle);
  }, []);
  useEffect(() => {
    const match = location.pathname.match(/^\/pull-requests\/([^/]+)\/([^/]+)\/(\d+)$/);
    if (!match && location.pathname !== '/pull-requests') return;
    const repository = match
      ? `${match[1]}/${match[2]}`
      : (new URLSearchParams(location.search).get('repository') ?? '');
    const number = match ? Number(match[3]) : undefined;
    const session: Session = {
      id: match ? `${repository}#${number}` : `overview:${repository}`,
      repository,
      number,
      overview: !match,
    };
    setSessions((previous) => {
      // Drop the empty sessions left behind; the one being opened stays visible.
      const next = [
        ...previous.filter(
          (item) => item.id !== session.id && (item.id === general.id || threadHasMessages(item.id))
        ),
        session,
      ].slice(-60);
      persistSessions(next);
      return next;
    });
    setCurrent(session.id);
    try {
      localStorage.setItem('wakeline-review-session', session.id);
    } catch {
      /* Optional cache. */
    }
  }, [location.pathname, location.search]);
  useEffect(() => {
    const written = () => setSessions((previous) => (persistSessions(previous), previous));
    window.addEventListener('wakeline:chat-thread', written);
    return () => window.removeEventListener('wakeline:chat-thread', written);
  }, []);
  const picker = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      const menu = picker.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        menu.querySelector<HTMLElement>('summary')?.focus();
      } else if (menu.contains(event.target as Node)) return;
      menu.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss, true);
    };
  }, []);
  const active = sessions.find((session) => session.id === current) ?? general;
  const label = (session: Session) =>
    session.overview
      ? `${t('nav.pullRequests')} · ${session.repository || t('reviewChat.allRepositories')}`
      : `${session.repository} #${session.number} · ${github?.pull_requests.find((pr) => pr.repository === session.repository && pr.number === session.number)?.title ?? session.title ?? ''}`;
  if (!open) return null;
  return (
    <section className="wk-chat-dock" aria-label={t('reviewChat.sessions')}>
      <div className="wk-chat-sessions">
        <details ref={picker} className="wk-session-picker">
          <summary aria-label={t('reviewChat.sessions')}>
            <span>{label(active)}</span>
            <ChevronDown size={14} />
          </summary>
          <div className="wk-chat-options" role="menu" aria-label={t('reviewChat.sessions')}>
            {[...sessions].reverse().map((session) => (
              <button
                key={session.id}
                type="button"
                role="menuitemradio"
                aria-checked={session.id === active.id}
                aria-pressed={session.id === active.id}
                onClick={() => {
                  setCurrent(session.id);
                  if (picker.current) picker.current.open = false;
                  try {
                    localStorage.setItem('wakeline-review-session', session.id);
                  } catch {
                    /* Optional cache. */
                  }
                }}
              >
                <span>{label(session)}</span>
                {session.id === active.id && <Check size={14} />}
              </button>
            ))}
          </div>
        </details>
        <button
          className="icon-btn"
          aria-label={t('account.close')}
          onClick={() => window.dispatchEvent(new Event('wakeline:chat-toggle'))}
        >
          <X size={16} />
        </button>
      </div>
      <PrChat
        key={active.id}
        {...active}
        title={
          github?.pull_requests.find(
            (pr) => pr.repository === active.repository && pr.number === active.number
          )?.title ?? active.title
        }
      />
    </section>
  );
}
