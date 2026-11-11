import type { CSSProperties } from 'react';
import type { PullRequestDetails } from 'src/services/wakeline';
import type { DiffLine } from 'src/sections/pull-requests/pr-diff';

import { useTranslation } from 'react-i18next';
import { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, GitBranch, ChevronDown, ExternalLink, MessageSquare } from 'lucide-react';

import { openExternal, invoke as desktopInvoke } from 'src/services/wakeline';

import { EvidenceMarkdown } from 'src/components/evidence-markdown';

import { parseDiff, splitDiff, highlightCode } from 'src/sections/pull-requests/pr-diff';

import { ErrorNotice } from './views';
import { EditorOpen } from './editor-open';
import { useWorkspace } from './workspace-context';
import { useAgo, Avatar, Segmented, StatusPill } from './github-pages';

const enter = (index: number) => ({ '--i': index }) as CSSProperties;

export function PullRequestPage() {
  const { t } = useTranslation();
  const ago = useAgo();
  const [chatOpen, setChatOpen] = useState(
    () => sessionStorage.getItem('wakeline-review-chat-open') !== 'false'
  );
  useEffect(() => {
    const change = (event: Event) => setChatOpen((event as CustomEvent<boolean>).detail);
    window.addEventListener('wakeline:chat-state', change);
    return () => window.removeEventListener('wakeline:chat-state', change);
  }, []);
  const navigate = useNavigate();
  const { owner = '', repo = '', number = '' } = useParams();
  const repository = `${owner}/${repo}`;
  const { github } = useWorkspace();
  const pr = github?.pull_requests.find(
    (item) => item.repository === repository && item.number === Number(number)
  );
  const [detail, setDetail] = useState<PullRequestDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<'unified' | 'split'>(
    () => (localStorage.getItem('wakeline-diff-layout') as 'unified' | 'split') ?? 'unified'
  );

  useEffect(() => {
    let active = true;
    setDetail(null);
    setError(null);
    desktopInvoke<PullRequestDetails>('get_remote_pr_details', {
      repository,
      number: Number(number),
    }).then(
      (value) => active && setDetail(value),
      (cause) => active && setError(String(cause))
    );
    return () => {
      active = false;
    };
  }, [repository, number]);

  const additions = detail?.files.reduce((sum, file) => sum + file.additions, 0) ?? 0;
  const deletions = detail?.files.reduce((sum, file) => sum + file.deletions, 0) ?? 0;
  const url = pr?.url ?? `https://github.com/${repository}/pull/${number}`;

  return (
    <div className="page-content wk-pr-page">
      <div className="wk-review-heading">
        <button
          type="button"
          className="link-more wk-pr-back enter"
          style={enter(0.5)}
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/pull-requests'))}
        >
          <ArrowLeft size={14} />
          {t('nav.pullRequests')}
        </button>

        <header className="wk-pr-head enter" style={enter(1)}>
          {pr && <StatusPill state={pr.state} />}
          <h1 className="page-title wk-pr-title">
            {pr?.title ?? repository} <span>#{number}</span>
          </h1>
          <p className="review-meta">
            <span className="review-repo">{repository}</span>
            {pr?.author && (
              <>
                <span aria-hidden="true">·</span>
                <span className="review-author">
                  <Avatar src={pr.avatar_url} size={22} />
                  {pr.author}
                </span>
              </>
            )}
            {pr?.branch && (
              <>
                <span aria-hidden="true">·</span>
                <span className="wk-pr-branch">
                  <GitBranch size={13} />
                  {pr.branch}
                </span>
              </>
            )}
            {pr && (
              <>
                <span aria-hidden="true">·</span>
                <span>{t('githubDashboard.updated', { ago: ago(pr.updated_at) })}</span>
              </>
            )}
          </p>
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
            <button type="button" className="btn press" onClick={() => openExternal(url)}>
              <ExternalLink size={14} />
              {t('cards.openOnGithub')}
            </button>
          </div>
        </header>
      </div>
      <div className="wk-pr-layout" data-chat="false">
        <div className="wk-pr-main">
          <ErrorNotice error={error} />
          {!detail && !error && <p className="wk-help">{t('common.loading')}</p>}

          {detail && (
            <>
              <section className="wk-pr-body enter" style={enter(2)}>
                <EvidenceMarkdown text={detail.body || t('pullRequests.noDescription')} />
              </section>

              <EditorOpen repository={repository} />
              <div className="toolbar wk-pr-files-head enter" style={enter(2.5)}>
                <h2 className="block-title">
                  {t('pullRequestPage.files', { count: detail.files.length })}
                  <span className="diff-add">+{additions}</span>
                  <span className="diff-del">−{deletions}</span>
                </h2>
                <Segmented
                  label={t('pullRequestPage.layout')}
                  options={[
                    { id: 'unified' as const, label: t('pullRequestPage.unified') },
                    { id: 'split' as const, label: t('pullRequestPage.split') },
                  ]}
                  value={layout}
                  onChange={(next) => {
                    localStorage.setItem('wakeline-diff-layout', next);
                    setLayout(next);
                  }}
                />
              </div>

              {detail.files.map((file, index) => (
                <FileDiff key={file.filename} file={file} layout={layout} index={index} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FileDiff({
  file,
  layout,
  index,
}: {
  file: PullRequestDetails['files'][number];
  layout: 'unified' | 'split';
  index: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const lines = useMemo(() => (file.patch ? parseDiff(file.patch) : []), [file.patch]);
  const html = useMemo(
    () => new Map(lines.map((line) => [line, highlightCode(line.code, file.filename)])),
    [lines, file.filename]
  );
  return (
    <section className="card wk-diff-file enter" style={enter(3 + Math.min(index, 10) * 0.2)}>
      <button
        type="button"
        className="wk-diff-file-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown size={15} className="wk-diff-chevron" />
        <span className="wk-diff-name">{file.filename}</span>
        <span className="diff-add">+{file.additions}</span>
        <span className="diff-del">−{file.deletions}</span>
      </button>
      {open &&
        (file.patch ? (
          <div className="wk-diff-scroll">
            <table className="wk-diff" data-layout={layout}>
              {layout === 'split' ? (
                <colgroup>
                  <col className="wk-diff-col-num" />
                  <col />
                  <col className="wk-diff-col-num" />
                  <col />
                </colgroup>
              ) : (
                <colgroup>
                  <col className="wk-diff-col-num" />
                  <col className="wk-diff-col-num" />
                  <col />
                </colgroup>
              )}
              <tbody>
                {layout === 'split'
                  ? splitDiff(lines).map((row, i) =>
                      row.left && (row.left.kind === 'hunk' || row.left.kind === 'note') ? (
                        <tr key={i} className={`diff-${row.left.kind}`}>
                          <td colSpan={4}>{row.left.code}</td>
                        </tr>
                      ) : (
                        <tr key={i}>
                          <Cell line={row.left} number={row.left?.oldNumber} html={html} />
                          <Cell line={row.right} number={row.right?.newNumber} html={html} />
                        </tr>
                      )
                    )
                  : lines.map((line, i) =>
                      line.kind === 'hunk' || line.kind === 'note' ? (
                        <tr key={i} className={`diff-${line.kind}`}>
                          <td colSpan={3}>{line.code}</td>
                        </tr>
                      ) : (
                        <tr key={i} className={`diff-${line.kind}`}>
                          <td className="wk-diff-num">{line.oldNumber ?? ''}</td>
                          <td className="wk-diff-num">{line.newNumber ?? ''}</td>
                          <td className="wk-diff-code">
                            <span className="wk-diff-sign" aria-hidden="true">
                              {line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}
                            </span>
                            <code dangerouslySetInnerHTML={{ __html: html.get(line) ?? '' }} />
                          </td>
                        </tr>
                      )
                    )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="wk-help wk-diff-empty">{t('pullRequests.noPatch')}</p>
        ))}
    </section>
  );
}

function Cell({
  line,
  number,
  html,
}: {
  line: DiffLine | null;
  number: number | null | undefined;
  html: Map<DiffLine, string>;
}) {
  const kind = line?.kind ?? 'empty';
  return (
    <>
      <td className={`wk-diff-num diff-${kind}`}>{number ?? ''}</td>
      <td className={`wk-diff-code diff-${kind}`}>
        {line && (
          <>
            <span className="wk-diff-sign" aria-hidden="true">
              {kind === 'added' ? '+' : kind === 'removed' ? '−' : ' '}
            </span>
            <code dangerouslySetInnerHTML={{ __html: html.get(line) ?? '' }} />
          </>
        )}
      </td>
    </>
  );
}
