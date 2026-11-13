import type { ChatAttachment } from 'src/services/chat-input';

import { useTranslation } from 'react-i18next';
import { useRef, useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export function ChatImageViewer({
  images,
  initialIndex,
  onClose,
}: {
  images: ChatAttachment[];
  initialIndex: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const image = images[index];
  const move = (direction: number) =>
    setIndex((previous) => (previous + direction + images.length) % images.length);
  const { t } = useTranslation();
  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="wk-image-viewer"
      aria-label={image.name}
      onKeyDown={(event) => {
        if (images.length > 1 && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault();
          event.stopPropagation();
          move(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header>
        <span>{image.name}</span>
        {images.length > 1 && (
          <nav className="wk-image-navigation" aria-label={t('chatInput.gallery')}>
            <button
              type="button"
              className="icon-btn"
              aria-label={t('chatInput.previousImage')}
              onClick={() => move(-1)}
            >
              <ChevronLeft size={20} />
            </button>
            <span role="status" aria-live="polite">
              {t('chatInput.imagePosition', { current: index + 1, total: images.length })}
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label={t('chatInput.nextImage')}
              onClick={() => move(1)}
            >
              <ChevronRight size={20} />
            </button>
          </nav>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label={t('account.close')}
        >
          <X size={20} />
        </button>
      </header>
      <img src={`data:${image.type};base64,${image.data}`} alt={image.name} />
    </dialog>
  );
}
