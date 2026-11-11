import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { PrChat } from './pr-chat';
import { useWorkspace } from './workspace-context';

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
              s.id !== general.id && typeof s.id === 'string' && typeof s.repository === 'string'
          ),
        ].slice(0, 60)
      : [general];
  } catch {
    return [general];
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
      const next = [...previous.filter((item) => item.id !== session.id), session].slice(-60);
      try {
        localStorage.setItem('wakeline-review-sessions', JSON.stringify(next));
      } catch {
        /* Optional cache. */
      }
      return next;
    });
    setCurrent(session.id);
    try {
      localStorage.setItem('wakeline-review-session', session.id);
    } catch {
      /* Optional cache. */
    }
  }, [location.pathname, location.search]);
  const active = sessions.find((session) => session.id === current) ?? general;
  if (!open) return null;
  return (
    <section className="wk-chat-dock" aria-label={t('reviewChat.sessions')}>
      <div className="wk-chat-sessions">
        <select
          aria-label={t('reviewChat.sessions')}
          value={active.id}
          onChange={(event) => {
            setCurrent(event.target.value);
            try {
              localStorage.setItem('wakeline-review-session', event.target.value);
            } catch {
              /* Optional cache. */
            }
          }}
        >
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.overview
                ? `${t('nav.pullRequests')} · ${session.repository || t('reviewChat.allRepositories')}`
                : `${session.repository} #${session.number} · ${github?.pull_requests.find((pr) => pr.repository === session.repository && pr.number === session.number)?.title ?? session.title ?? ''}`}
            </option>
          ))}
        </select>
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
