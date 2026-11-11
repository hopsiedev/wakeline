import { useTranslation } from 'react-i18next';

export function LoadingSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="wk-loading-skeleton" role="status" aria-label={t('common.loading')}>
      <div className="wk-skeleton-heading" />
      <div className="wk-skeleton-subtitle" />
      <div className="wk-skeleton-stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} />
        ))}
      </div>
      <div className="wk-skeleton-content" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}
