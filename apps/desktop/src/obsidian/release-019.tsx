import './release-019.css';

import type { CSSProperties } from 'react';

import { useTranslation } from 'react-i18next';
import {
  X,
  Bell,
  Hash,
  Check,
  Power,
  BellRing,
  FileCode2,
  ImagePlus,
  RefreshCw,
  GripVertical,
  LoaderCircle,
  MessageSquare,
} from 'lucide-react';

import { CONFIG } from 'src/config-global';

import type { ReleaseSlide } from './release-patch';

type Scene =
  'chat' | 'images' | 'todo' | 'numbers' | 'paths' | 'refresh' | 'startup' | 'daily' | 'all';

/** Wakeline mark at its original 156:76 proportions. */
function Mark({ width }: { width: number }) {
  return (
    <img
      src="/logo/wakeline-mark.svg"
      alt=""
      width={width}
      height={Math.round((width * 76) / 156)}
    />
  );
}

function Art({ scene, caption }: { scene: Scene; caption: string }) {
  const { t } = useTranslation();
  return (
    <div className="wk-update-art wk-patch-art wk-r19" aria-hidden="true">
      {scene === 'chat' && (
        <div className="wk-r19-chat">
          <div className="wk-r19-diff">
            {[78, 52, 90, 64, 40].map((width, i) => (
              <i key={i} data-add={i % 2 === 0} style={{ width: width + '%' }} />
            ))}
          </div>
          <div className="wk-r19-panel">
            <span className="wk-r19-grip">
              <GripVertical size={12} />
            </span>
            <p className="wk-r19-user">{t('release019.chat.question')}</p>
            <p className="wk-r19-agent">{t('release019.chat.answer')}</p>
          </div>
        </div>
      )}
      {scene === 'images' && (
        <div className="wk-r19-images">
          <div className="wk-r19-thumbs">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} style={{ '--shot': i } as CSSProperties} />
            ))}
            <span className="wk-r19-add">
              <ImagePlus size={16} />
            </span>
          </div>
          <div className="wk-r19-viewer">
            <span />
            <X size={13} />
          </div>
        </div>
      )}
      {scene === 'todo' && (
        <div className="wk-r19-todo">
          <div className="wk-r19-column">
            <strong>{t('board.new')}</strong>
          </div>
          <div className="wk-r19-column">
            <strong>{t('board.accepted')}</strong>
          </div>
          <div className="wk-r19-card">
            <Check size={13} />
            {t('release019.todo.card')}
          </div>
          <span className="wk-r19-scan">
            <LoaderCircle size={12} />
            {t('release019.todo.scanning')}
          </span>
        </div>
      )}
      {scene === 'numbers' && (
        <div className="wk-r19-numbers">
          <span className="wk-r19-stat-label">{t('githubDashboard.metrics.commits')}</span>
          <span className="wk-r19-measure">
            <b>5</b>
            <span className="wk-r19-roll">
              <b>5</b>
              <b>6</b>
            </span>
            <span className="wk-r19-roll">
              <b>9</b>
              <b>0</b>
            </span>
          </span>
          <div className="wk-r19-bars">
            {[30, 55, 40, 72, 48, 90, 64].map((h, i) => (
              <i key={i} style={{ height: h + '%', animationDelay: i * 0.08 + 's' }} />
            ))}
          </div>
        </div>
      )}
      {scene === 'paths' && (
        <div className="wk-r19-path-card">
          <strong>{t('release019.paths.card')}</strong>
          <code>
            C:\Users\dev\my-proyect\src\features\checkout\components\payment-form\PaymentForm.tsx
          </code>
        </div>
      )}
      {scene === 'refresh' && (
        <div className="wk-r19-refresh">
          <span className="wk-r19-badge">
            <RefreshCw size={13} />
            {t('release019.refresh.parallel')}
          </span>
          {['my-proyect', 'my-api', 'my-web', 'my-docs'].map((name, i) => (
            <div key={name} style={{ '--repo': i } as CSSProperties}>
              <span>{name}</span>
              <i>
                <b />
              </i>
              <Check size={12} />
            </div>
          ))}
        </div>
      )}
      {scene === 'startup' && (
        <div className="wk-r19-startup">
          <div className="wk-r19-toggle">
            <Power size={14} />
            <span>{t('release019.startup.toggle')}</span>
            <i>
              <b />
            </i>
          </div>
          <div className="wk-r19-taskbar">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <rect x="0" y="0" width="6" height="6" />
              <rect x="8" y="0" width="6" height="6" />
              <rect x="0" y="8" width="6" height="6" />
              <rect x="8" y="8" width="6" height="6" />
            </svg>
            <span className="wk-r19-tray">
              <Mark width={25} />
            </span>
            <time>08:00</time>
          </div>
        </div>
      )}
      {scene === 'daily' && (
        <div className="wk-r19-daily">
          <div className="wk-r19-toast">
            <Mark width={33} />
            <div>
              <strong>{t('release019.daily.noticeTitle')}</strong>
              <span>{t('release019.daily.noticeBody')}</span>
            </div>
            <BellRing size={14} />
          </div>
        </div>
      )}
      {scene === 'all' && (
        <div className="wk-r19-all">
          {[MessageSquare, ImagePlus, Check, Hash, FileCode2, RefreshCw, Power, Bell].map(
            (Icon, i) => (
              <span key={i} style={{ '--item': i } as CSSProperties}>
                <Icon size={16} />
              </span>
            )
          )}
          <strong>8</strong>
        </div>
      )}
      <span className="wk-art-caption">{caption}</span>
    </div>
  );
}

const CHANGES: { scene: Exclude<Scene, 'all'>; kind: ReleaseSlide['kind'] }[] = [
  { scene: 'chat', kind: 'feature' },
  { scene: 'images', kind: 'feature' },
  { scene: 'todo', kind: 'fix' },
  { scene: 'numbers', kind: 'fix' },
  { scene: 'paths', kind: 'fix' },
  { scene: 'refresh', kind: 'update' },
  { scene: 'startup', kind: 'feature' },
  { scene: 'daily', kind: 'feature' },
];

export function useRelease019Slides(): ReleaseSlide[] {
  const { t } = useTranslation();
  return [
    ...CHANGES.map(({ scene, kind }) => {
      const caption = t(`release019.${scene}.caption`);
      return {
        id: scene,
        kind,
        caption,
        title: t(`release019.${scene}.title`),
        text: t(`release019.${scene}.text`),
        art: <Art scene={scene} caption={caption} />,
      };
    }),
    {
      id: 'all',
      kind: 'update',
      closing: true,
      caption: CONFIG.appVersion,
      title: t('release019.all.title'),
      text: t('release019.all.text'),
      art: <Art scene="all" caption={CONFIG.appVersion} />,
    },
  ];
}
