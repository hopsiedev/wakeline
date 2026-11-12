import type { ReactNode, CSSProperties } from 'react';

import { useTranslation } from 'react-i18next';
import {
  X,
  Check,
  Folder,
  RefreshCw,
  ArrowRight,
  FolderPlus,
  MessageSquare,
  GitPullRequest,
} from 'lucide-react';

import { CONFIG } from 'src/config-global';

import { Github } from './brand-icons';

type Scene = 'import' | 'refresh' | 'agents' | 'sessions' | 'activity' | 'folders' | 'all';
type Slide = { scene: Scene; caption: string; title: string; text: string };
/** One slide of a version's presentation. `closing` is the wrap-up, left out of All changes. */
export type ReleaseSlide = {
  id: string;
  kind: 'feature' | 'fix' | 'update';
  caption: string;
  title: string;
  text: string;
  art: ReactNode;
  closing?: boolean;
};
function Rows({ items }: { items: { icon?: ReactNode; label: string; off?: boolean }[] }) {
  return (
    <div className="wk-art-review">
      {items.map((item, i) => (
        <div
          key={item.label}
          style={{ animationDelay: i * 0.4 + 's', opacity: item.off ? 0.45 : undefined }}
        >
          {item.icon && <span>{item.icon}</span>}
          <strong style={item.off ? { textDecoration: 'line-through' } : undefined}>
            {item.label}
          </strong>
          {item.off ? <X size={14} /> : <Check size={14} />}
        </div>
      ))}
    </div>
  );
}

export function ReleasePatchArt({ scene, caption }: { scene: Scene; caption: string }) {
  const { t } = useTranslation();
  return (
    <div className="wk-update-art wk-patch-art" aria-hidden="true">
      {scene === 'import' && (
        <div className="wk-patch-import">
          <div className="wk-patch-window">
            <span>● ● ●</span>
            <strong>{t('releasePatch.copy0')}</strong>
            <div>
              <Check size={18} />
              {t('releasePatch.copy1')}
            </div>
          </div>
          <div className="wk-patch-progress">
            <RefreshCw size={16} />
            <span>{t('releasePatch.copy2')}</span>
            <i>
              <b />
            </i>
          </div>
        </div>
      )}
      {scene === 'refresh' && (
        <div className="wk-patch-refresh">
          <div className="wk-patch-refresh-button">
            <RefreshCw size={23} />
          </div>
          <div className="wk-patch-refresh-track">
            <i />
          </div>
          <div className="wk-patch-pr">
            <GitPullRequest size={25} />
            <strong>#22</strong>
            <span>{t('releasePresentation.ui.open')}</span>
          </div>
        </div>
      )}
      {scene === 'agents' && (
        <div className="wk-art-connectors wk-patch-agents">
          <div className="wk-art-hub">
            <img src="/logo/wakeline-mark.svg" alt="" width="36" height="18" />
          </div>
          <svg className="wk-patch-wires" width="165" height="52" viewBox="0 0 165 52">
            {[21.5, 82.5, 143.5].map((x, i) => (
              <g key={x} style={{ '--agent': i } as CSSProperties}>
                <path d={`M82.5 0 V16 Q82.5 24 ${x} 24 V52`} />
                <path
                  className="wk-patch-signal"
                  d={`M82.5 0 V16 Q82.5 24 ${x} 24 V52`}
                  pathLength="1"
                />
              </g>
            ))}
          </svg>
          {/* Brand colours: no icon filter here; Codex is its cloud mask over its gradient. */}
          <div className="wk-art-tools">
            <span>
              <Github size={22} />
            </span>
            <span>
              <img
                src="/assets/icons/agents/claude.svg"
                width="22"
                height="22"
                alt=""
                style={{ filter: 'none' }}
              />
            </span>
            <span>
              <i
                style={{
                  width: 24,
                  height: 24,
                  background: 'linear-gradient(140deg, #7aa2ff 0%, #5b6cff 45%, #8b5cf6 100%)',
                  WebkitMask: 'url(/assets/icons/agents/codex.svg) center / contain no-repeat',
                  mask: 'url(/assets/icons/agents/codex.svg) center / contain no-repeat',
                }}
              />
            </span>
          </div>
          <code>Co-authored-by → @claude · @codex</code>
        </div>
      )}
      {scene === 'sessions' && (
        <div className="wk-patch-sessions">
          <div className="wk-patch-session">
            <MessageSquare size={19} />
            <strong>wakeline #22</strong>
            <span>2</span>
          </div>
          <div className="wk-patch-bubble">{t('releasePatch.copy3')}</div>
          <div className="wk-patch-bubble wk-patch-reply">
            <Check size={15} /> Code review
          </div>
          <div className="wk-patch-empty">
            <MessageSquare size={15} />
            {t('releasePatch.copy4')}
            <X size={14} />
          </div>
        </div>
      )}
      {scene === 'activity' && (
        <div className="wk-art-repos">
          {['hopsiedev/wakeline', 'example/my-proyect', 'hopsiedev/duet'].map((name, i) => (
            <div className="wk-art-repo" key={name} style={{ '--layer': i } as CSSProperties}>
              <div>
                <img src="/logo/wakeline-mark.svg" width="21" height="17" alt="" />
                <span>{name}</span>
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
      {scene === 'folders' && (
        <div className="wk-patch-folders">
          <div className="wk-patch-folder">
            <FolderPlus size={34} />
            <span>wakeline</span>
          </div>
          <ArrowRight size={24} />
          <div className="wk-patch-board">
            <strong>To do</strong>
            <div>
              <Folder size={15} /> wakeline <Check size={14} />
            </div>
            <div>
              <Folder size={15} /> my-proyect
            </div>
          </div>
        </div>
      )}
      {scene === 'all' && (
        <Rows
          items={[
            { label: t('releasePatch.copy5') },
            { label: t('releasePatch.copy6') },
            { label: t('releasePatch.copy7') },
            { label: t('releasePatch.copy8') },
          ]}
        />
      )}
      <span className="wk-art-caption">{caption}</span>
    </div>
  );
}

/** 0.1.8: six fixes from variant A and the wrap-up from C. */
export function usePatchSlides(): ReleaseSlide[] {
  const { t } = useTranslation();
  const one: Slide[] = [
    {
      scene: 'import',
      caption: t('releasePatch.copy9'),
      title: t('releasePatch.copy10'),
      text: t('releasePatch.copy11'),
    },
    {
      scene: 'refresh',
      caption: 'Code review',
      title: t('releasePatch.copy12'),
      text: t('releasePatch.copy13'),
    },
    {
      scene: 'agents',
      caption: t('releasePatch.copy14'),
      title: t('releasePatch.copy15'),
      text: t('releasePatch.copy16'),
    },
    {
      scene: 'sessions',
      caption: t('releasePatch.copy17'),
      title: t('releasePatch.copy18'),
      text: t('releasePatch.copy19'),
    },
    {
      scene: 'activity',
      caption: t('releasePatch.copy20'),
      title: t('releasePatch.copy21'),
      text: t('releasePatch.copy22'),
    },
    {
      scene: 'folders',
      caption: 'To do',
      title: t('releasePatch.copy23'),
      text: t('releasePatch.copy24'),
    },
  ];
  const slides: Slide[] = [
    ...one,
    {
      scene: 'all',
      caption: CONFIG.appVersion,
      title: t('releasePatch.copy25'),
      text: t('releasePatch.copy26'),
    },
  ];
  return slides.map((slide) => ({
    id: slide.scene,
    kind: 'fix',
    caption: slide.caption,
    title: slide.title,
    text: slide.text,
    art: <ReleasePatchArt scene={slide.scene} caption={slide.caption} />,
    closing: slide.scene === 'all',
  }));
}
