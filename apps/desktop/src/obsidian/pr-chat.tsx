import type { FormEvent, KeyboardEvent } from 'react';

import { useTranslation } from 'react-i18next';
import { X, ArrowUp, ImagePlus, ShieldCheck, ChevronDown } from 'lucide-react';
import { useId, useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';

import { invoke } from 'src/services/wakeline';
import {
  readImage,
  modelLabel,
  pastedImages,
  type ChatAttachment,
  validateImageSelection,
} from 'src/services/chat-input';

import { EvidenceMarkdown } from 'src/components/evidence-markdown';

type Message = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
  failed?: boolean;
  model?: string;
  effort?: string;
  images?: ChatAttachment[];
};

type Agent = {
  id: string;
  name: string;
  models: string[];
  installed: boolean;
  available: boolean;
  efforts?: Record<string, string[]>;
  images?: boolean;
};

// Conversations survive navigating away and back while the app is open.
const threads = new Map<string, Message[]>();
const threadListeners = new Map<string, Set<() => void>>();
let nextId = Date.now();
function readThread(key: string): Message[] {
  if (threads.has(key)) return threads.get(key)!;
  try {
    const saved = JSON.parse(localStorage.getItem(`wakeline-chat:${key}`) ?? '[]');
    const messages = Array.isArray(saved)
      ? saved
          .filter(
            (message: Message) =>
              typeof message.id === 'number' &&
              typeof message.text === 'string' &&
              (message.role === 'user' || message.role === 'assistant') &&
              !message.pending
          )
          .slice(-80)
      : [];
    threads.set(key, messages);
    return messages;
  } catch {
    return [];
  }
}

/** A session only belongs in the history once someone wrote in it. */
export function threadHasMessages(key: string): boolean {
  return readThread(key).length > 0;
}

function AgentLogo({ id }: { id: string }) {
  return (
    <img
      className="wk-chat-logo"
      src={`/assets/icons/agents/${id}.svg`}
      alt=""
      width="16"
      height="16"
    />
  );
}

export function PrChat({
  repository,
  number,
  title,
  overview = false,
}: {
  repository: string;
  number?: number;
  title?: string;
  overview?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const key = overview ? `overview:${repository}` : `${repository}#${number}`;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const readingImages = useRef(false);
  const pickersRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closePickers = (event: PointerEvent | globalThis.KeyboardEvent) => {
      const root = pickersRef.current;
      if (!root) return;
      if (event.type === 'keydown' && (event as globalThis.KeyboardEvent).key !== 'Escape') return;
      const inside =
        event.type === 'pointerdown' ? (event.target as Element).closest?.('details') : null;
      const open = root.querySelectorAll<HTMLDetailsElement>('details[open]');
      for (const picker of open) {
        if (inside === picker) continue;
        picker.open = false;
        if (event.type === 'keydown') picker.querySelector<HTMLElement>('summary')?.focus();
      }
      if (event.type === 'keydown' && open.length) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('pointerdown', closePickers);
    document.addEventListener('keydown', closePickers, true);
    return () => {
      document.removeEventListener('pointerdown', closePickers);
      document.removeEventListener('keydown', closePickers, true);
    };
  }, []);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsError, setAgentsError] = useState(false);
  const uid = useId();
  const [messages, setMessagesState] = useState<Message[]>(() => readThread(key));
  const [model, setModel] = useState(
    () => localStorage.getItem('wakeline-pr-chat-model') ?? 'sonnet'
  );
  const [value, setValue] = useState('');
  const [images, setImages] = useState<ChatAttachment[]>([]);
  const [imageError, setImageError] = useState('');
  const [effort, setEffort] = useState(
    () => localStorage.getItem('wakeline-pr-chat-effort') ?? 'default'
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const agent = agents.find((item) => item.available);
  const selectedModel = agent?.models.includes(model) ? model : agent?.models[0];
  const efforts = agent?.efforts?.[selectedModel ?? ''] ?? ['default'];
  const selectedEffort = efforts.includes(effort) ? effort : 'default';
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = '72px';
      if (value) el.style.height = `${Math.min(200, Math.max(72, el.scrollHeight))}px`;
    }
  }, [value]);
  useEffect(() => {
    let active = true;
    const load = () =>
      invoke<Agent[]>('get_review_agents').then(
        (items) => {
          if (active) {
            setAgents(items);
            setAgentsError(false);
          }
        },
        () => {
          if (active) setAgentsError(true);
        }
      );
    void load();
    window.addEventListener('focus', load);
    return () => {
      active = false;
      window.removeEventListener('focus', load);
    };
  }, []);
  const busy = messages.some((message) => message.pending);

  useEffect(() => {
    setMessagesState(readThread(key));
    const changed = () => setMessagesState(threads.get(key) ?? []);
    const listeners = threadListeners.get(key) ?? new Set<() => void>();
    listeners.add(changed);
    threadListeners.set(key, listeners);
    return () => {
      listeners.delete(changed);
      if (!listeners.size) threadListeners.delete(key);
    };
  }, [key]);

  const setMessages = useCallback(
    (update: (previous: Message[]) => Message[]) => {
      const next = update(threads.get(key) ?? []);
      threads.set(key, next);
      try {
        localStorage.setItem(
          `wakeline-chat:${key}`,
          JSON.stringify(next.slice(-80).map(({ images: attachments, ...message }) => message))
        );
      } catch {
        /* Keep the live conversation if storage is full. */
      }
      threadListeners.get(key)?.forEach((changed) => changed());
      window.dispatchEvent(new CustomEvent('wakeline:chat-thread', { detail: key }));
    },
    [key]
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const addImages = async (files: File[]) => {
    if (readingImages.current || busy || !files.length) return;
    const error = validateImageSelection(images, files);
    if (error) {
      setImageError(t(`chatInput.${error}`));
      return;
    }
    readingImages.current = true;
    setImageError('');
    try {
      const added = await Promise.all(files.map(readImage));
      setImages((previous) => [...previous, ...added]);
    } catch {
      setImageError(t('chatInput.readFailed'));
    } finally {
      readingImages.current = false;
    }
  };

  const ask = (question: string) => {
    if (!agent?.available || !selectedModel || busy) return;
    const history = (threads.get(key) ?? [])
      .filter((message) => !message.pending && !message.failed)
      .map(({ role, text }) => ({ role, text }));
    const contextImages: ChatAttachment[] = [];
    for (const image of [
      ...(threads.get(key) ?? []).slice(-12).flatMap((m) => m.images ?? []),
      ...images,
    ].reverse()) {
      if (
        contextImages.length < 3 &&
        contextImages.reduce((sum, i) => sum + i.size, 0) + image.size <= 10 * 1024 * 1024 &&
        !contextImages.some((i) => i.data === image.data)
      )
        contextImages.unshift(image);
    }
    const userImages = images;
    setImages([]);
    setImageError('');
    const userId = nextId++;
    const botId = nextId++;
    setMessages((previous) => [
      ...previous,
      { id: userId, role: 'user', text: question, images: userImages },
      {
        id: botId,
        role: 'assistant',
        text: '',
        pending: true,
        model: selectedModel,
        effort: selectedEffort,
      },
    ]);
    invoke<string>(overview ? 'ask_review_agent' : 'ask_pr_agent', {
      repository: repository || null,
      number,
      title,
      options: {
        model: selectedModel,
        effort: selectedEffort,
        images: contextImages.map((image) => ({ media_type: image.type, data: image.data })),
      },
      question,
      history,
      lang: i18n.language,
    }).then(
      (text) =>
        setMessages((previous) =>
          previous.map((m) => (m.id === botId ? { ...m, pending: false, text } : m))
        ),
      (cause) =>
        setMessages((previous) =>
          previous.map((m) =>
            m.id === botId
              ? { ...m, pending: false, failed: true, text: errorText(String(cause), t) }
              : m
          )
        )
    );
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const question = value.trim() || (images.length ? t('chatInput.imageQuestion') : '');
    if (!question || busy || !agent?.available) return;
    setValue('');
    ask(question);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const close = (target: EventTarget) =>
    (target as HTMLElement).closest('details')?.removeAttribute('open');

  return (
    <aside className="wk-pr-chat" aria-label={t('prChat.title')}>
      <header className="wk-pr-chat-head">
        <img src="/logo/wakeline-icon.svg" alt="" width="22" height="22" />
        <div>
          <strong>{t('prChat.title')}</strong>
          <small>
            <ShieldCheck size={12} />
            {t(overview ? 'reviewChat.privacy' : 'prChat.privacy')}
          </small>
        </div>
      </header>

      <div className="wk-pr-chat-scroll" ref={scrollRef}>
        {!messages.length && (
          <div className="wk-pr-chat-empty">
            <p>{t(overview ? 'reviewChat.empty' : 'prChat.empty')}</p>
            {['summary', 'risks', 'tests'].map((id) => (
              <button
                key={id}
                type="button"
                className="chip press"
                disabled={busy || !agent?.available}
                onClick={() => ask(t(`${overview ? 'reviewChat' : 'prChat'}.suggestions.${id}`))}
              >
                {t(`${overview ? 'reviewChat' : 'prChat'}.suggestions.${id}`)}
              </button>
            ))}
          </div>
        )}
        {!agent && (
          <p className="wk-help" role="status">
            {t(agentsError ? 'reviewChat.detectError' : 'reviewChat.noAgent')}
          </p>
        )}
        <ol className="thread" aria-live="polite">
          {messages.map((message) => (
            <li key={message.id} className={`msg msg-${message.role}`}>
              {message.role === 'assistant' ? (
                <div className="wk-assistant" data-pending={!!message.pending}>
                  <span className="wk-thinking-logo">
                    <img src="/logo/wakeline-icon.svg" alt="" width="22" height="22" />
                  </span>
                  <div className="wk-pr-chat-answer" data-failed={!!message.failed}>
                    <div className="wk-message-meta">
                      Wakeline{' '}
                      <span>
                        · Claude / {modelLabel(message.model ?? '')} /{' '}
                        {t(`chatInput.effort.${message.effort ?? 'default'}`)}
                      </span>
                    </div>
                    {message.pending ? (
                      <span role="status" className="wk-thinking">
                        {t('prChat.thinking', { agent: 'Claude' })}
                        <span aria-hidden="true" className="wk-thinking-dots">
                          <i />
                          <i />
                          <i />
                        </span>
                      </span>
                    ) : message.failed ? (
                      <p>{message.text}</p>
                    ) : (
                      <EvidenceMarkdown text={message.text} />
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  {message.images?.length ? (
                    <div className="wk-chat-images">
                      {message.images.map((image) => (
                        <img
                          key={image.id}
                          src={`data:${image.type};base64,${image.data}`}
                          alt={image.name}
                        />
                      ))}
                    </div>
                  ) : null}
                  {message.text}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>

      <form
        className="composer"
        onSubmit={submit}
        data-has-value={!!value.trim() || images.length > 0}
      >
        <label htmlFor={`${uid}-input`} className="sr-only">
          {t(overview ? 'reviewChat.placeholder' : 'prChat.placeholder')}
        </label>
        {images.length > 0 && (
          <div className="wk-chat-images">
            {images.map((image) => (
              <div key={image.id}>
                <img src={`data:${image.type};base64,${image.data}`} alt={image.name} />
                <button
                  type="button"
                  aria-label={t('chatInput.remove', { name: image.name })}
                  onClick={() => setImages((old) => old.filter((i) => i.id !== image.id))}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        {imageError && (
          <p role="alert" className="wk-chat-input-error">
            {imageError}
          </p>
        )}
        <textarea
          ref={inputRef}
          id={`${uid}-input`}
          className="composer-input"
          rows={3}
          placeholder={t(overview ? 'reviewChat.placeholder' : 'prChat.placeholder')}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onPaste={(event) => {
            const files = pastedImages(event.clipboardData.items);
            if (files.length) {
              event.preventDefault();
              void addImages(files);
            }
          }}
          onKeyDown={onKeyDown}
        />
        <div className="composer-row wk-pr-chat-row">
          <button
            type="button"
            className="chip wk-chat-attach"
            aria-label={t('chatInput.attach')}
            title={t('chatInput.attach')}
            disabled={busy || !agent?.images}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus size={16} />
          </button>
          <input
            hidden
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              void addImages(files);
            }}
          />
          <div className="wk-chat-selectors" ref={pickersRef}>
            <details className="wk-chat-picker" name={`${uid}-picker`}>
              <summary className="chip">
                <AgentLogo id={agent?.id ?? 'claude'} />
                {agent?.name ?? t('reviewChat.detecting')}
                <ChevronDown size={12} />
              </summary>
              <div className="wk-chat-options" role="menu" aria-label={t('prChat.chooseAgent')}>
                {agents
                  .filter((item) => item.installed)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      aria-pressed={item.id === agent?.id}
                      disabled={!item.available}
                      title={item.available ? undefined : t('prChat.unavailable')}
                      onClick={(event) => close(event.currentTarget)}
                    >
                      <AgentLogo id={item.id} />
                      {item.name}
                      {!item.available && <small>{t('prChat.soon')}</small>}
                    </button>
                  ))}
              </div>
            </details>
            <details className="wk-chat-picker" name={`${uid}-picker`}>
              <summary className="chip">
                {selectedModel ? modelLabel(selectedModel) : t('prChat.chooseModel')}
                <ChevronDown size={12} />
              </summary>
              <div className="wk-chat-options" role="menu" aria-label={t('prChat.chooseModel')}>
                {(agent?.models ?? []).map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="menuitem"
                    aria-pressed={selectedModel === name}
                    onClick={(event) => {
                      setModel(name);
                      localStorage.setItem('wakeline-pr-chat-model', name);
                      close(event.currentTarget);
                    }}
                  >
                    <AgentLogo id="claude" />
                    {modelLabel(name)}
                  </button>
                ))}
              </div>
            </details>
            <details className="wk-chat-picker" name={`${uid}-picker`}>
              <summary className="chip">
                {t(`chatInput.effort.${selectedEffort}`)}
                <ChevronDown size={12} />
              </summary>
              <div className="wk-chat-options" role="menu" aria-label={t('chatInput.effortLabel')}>
                {efforts.map((level) => (
                  <button
                    key={level}
                    type="button"
                    role="menuitem"
                    aria-pressed={level === selectedEffort}
                    onClick={(event) => {
                      setEffort(level);
                      localStorage.setItem('wakeline-pr-chat-effort', level);
                      close(event.currentTarget);
                    }}
                  >
                    {t(`chatInput.effort.${level}`)}
                  </button>
                ))}
              </div>
            </details>
          </div>
          <button
            type="submit"
            className="send press"
            aria-label={t('prChat.send')}
            disabled={(!value.trim() && !images.length) || busy || !agent?.available}
          >
            <ArrowUp size={15} />
          </button>
        </div>
        <small className="wk-chat-model-note">{t('chatInput.access')}</small>
      </form>
    </aside>
  );
}

function errorText(cause: string, t: (key: string) => string) {
  if (cause.includes('AGENT_NOT_INSTALLED')) return t('prChat.errors.notInstalled');
  if (cause.includes('AGENT_CANCELLED_OR_TIMED_OUT')) return t('prChat.errors.timeout');
  if (cause.includes('IMAGE_')) return t('chatInput.invalid');
  if (cause.includes('AGENT_NO_PROPOSAL')) return t('prChat.errors.empty');
  return `${t('prChat.errors.failed')} ${cause}`;
}
