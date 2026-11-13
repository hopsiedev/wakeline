import './release-0110.css';

import type { CSSProperties } from 'react';

import { useTranslation } from 'react-i18next';
import {
  X,
  Folder,
  Square,
  Images,
  ArrowUp,
  FolderX,
  Columns2,
  ImageDown,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  ListCollapse,
  LoaderCircle,
  GripVertical,
  GitPullRequest,
} from 'lucide-react';

import { CONFIG } from 'src/config-global';

import type { ReleaseSlide } from './release-patch';

type Scene = 'stop' | 'gallery' | 'drop' | 'draft' | 'layout' | 'unwatch' | 'summary' | 'all';

const REPOSITORIES = ['my-proyect', 'my-api', 'my-web'];

function Art({ scene, caption }: { scene: Scene; caption: string }) {
  const { t } = useTranslation();
  return (
    <div className="wk-update-art wk-patch-art wk-r110" aria-hidden="true">
      {scene === 'stop' && (
        <div className="wk-r110-stop">
          <div className="wk-r110-reply">
            <span className="wk-r110-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="wk-r110-stopped">{t('chatInput.stopped')}</span>
          </div>
          <div className="wk-r110-composer">
            <i />
            <span className="wk-r110-send">
              <Square size={11} />
              <ArrowUp size={13} />
            </span>
          </div>
        </div>
      )}
      {scene === 'gallery' && (
        <div className="wk-r110-gallery">
          <div className="wk-r110-viewer">
            <ChevronLeft size={16} />
            <div>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ '--shot': i } as CSSProperties} />
              ))}
            </div>
            <ChevronRight size={16} />
          </div>
          <div className="wk-r110-pips">
            {Array.from({ length: 10 }, (_, i) => (
              <i key={i} />
            ))}
            <b />
          </div>
        </div>
      )}
      {scene === 'drop' && (
        <div className="wk-r110-drop">
          <span className="wk-r110-file">
            <ImageDown size={16} />
          </span>
          <div className="wk-r110-zone">
            <div>
              <span />
              <span className="wk-r110-dropped" />
            </div>
            <i />
          </div>
        </div>
      )}
      {scene === 'draft' && (
        <div className="wk-r110-draft">
          <div className="wk-r110-scroller">
            <div>
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} style={{ '--shot': i % 4 } as CSSProperties} />
              ))}
            </div>
            <i>
              <b />
            </i>
          </div>
          <div className="wk-r110-input">
            <i />
            <b />
            <span className="wk-r110-send">
              <ArrowUp size={13} />
            </span>
          </div>
        </div>
      )}
      {scene === 'layout' && (
        <div className="wk-r110-layout">
          <div className="wk-r110-list">
            {[70, 52, 84].map((width, i) => (
              <div key={i}>
                <GitPullRequest size={11} />
                <i style={{ width: width + '%' }} />
              </div>
            ))}
          </div>
          <div className="wk-r110-panel">
            <span className="wk-r110-grip">
              <GripVertical size={12} />
            </span>
            <i />
            <i />
            <i />
          </div>
        </div>
      )}
      {scene === 'unwatch' && (
        <div className="wk-r110-unwatch">
          <div className="wk-r110-folders">
            {REPOSITORIES.slice(0, 2).map((name) => (
              <span key={name}>
                <Folder size={12} />
                {name}
                <X size={11} />
              </span>
            ))}
          </div>
          <span className="wk-r110-status">
            <LoaderCircle size={12} />
            <span>{t('nav.stoppingWatch', { name: REPOSITORIES[0] })}</span>
          </span>
        </div>
      )}
      {scene === 'summary' && (
        <div className="wk-r110-summary">
          <div className="wk-r110-person">
            <b />
            <i />
            <strong>64%</strong>
          </div>
          <div className="wk-r110-repos">
            <ChevronRight size={12} />
            <span>{REPOSITORIES.join(' / ')}</span>
          </div>
          <ul>
            {REPOSITORIES.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}
      {scene === 'all' && (
        <div className="wk-r110-all">
          <div>
            {[Square, Images, ImageDown, ScrollText, Columns2, FolderX, ListCollapse].map(
              (Icon, i) => (
                <span key={i} style={{ '--item': i } as CSSProperties}>
                  <Icon size={16} />
                </span>
              )
            )}
          </div>
          <strong>7</strong>
        </div>
      )}
      <span className="wk-art-caption">{caption}</span>
    </div>
  );
}

const CHANGES: { scene: Exclude<Scene, 'all'>; kind: ReleaseSlide['kind'] }[] = [
  { scene: 'stop', kind: 'feature' },
  { scene: 'gallery', kind: 'feature' },
  { scene: 'drop', kind: 'feature' },
  { scene: 'draft', kind: 'fix' },
  { scene: 'layout', kind: 'fix' },
  { scene: 'unwatch', kind: 'fix' },
  { scene: 'summary', kind: 'update' },
];

export function useRelease0110Slides(): ReleaseSlide[] {
  const { t } = useTranslation();
  return [
    ...CHANGES.map(({ scene, kind }) => {
      const caption = t(`release0110.${scene}.caption`);
      return {
        id: scene,
        kind,
        caption,
        title: t(`release0110.${scene}.title`),
        text: t(`release0110.${scene}.text`),
        art: <Art scene={scene} caption={caption} />,
      };
    }),
    {
      id: 'all',
      kind: 'update',
      closing: true,
      caption: CONFIG.appVersion,
      title: t('release0110.all.title'),
      text: t('release0110.all.text'),
      art: <Art scene="all" caption={CONFIG.appVersion} />,
    },
  ];
}
