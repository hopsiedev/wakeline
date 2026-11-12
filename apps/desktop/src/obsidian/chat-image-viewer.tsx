import type { ChatAttachment } from 'src/services/chat-input';

import { X } from 'lucide-react';
import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export function ChatImageViewer({
  image,
  onClose,
}: {
  image: ChatAttachment;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="wk-image-viewer"
      aria-label={image.name}
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
