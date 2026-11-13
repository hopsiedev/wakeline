import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { folderRemovals } from 'src/services/folder-removal';

export function useRemovingFolders() {
  return useSyncExternalStore(folderRemovals.subscribe, folderRemovals.getSnapshot);
}

export function FolderRemovalStatus() {
  const paths = useRemovingFolders();

  const { t } = useTranslation();

  if (!paths.length) return null;

  return (
    <div className="wk-removing-folders" role="status" aria-live="polite">
      <span className="wk-removal-spinner" aria-hidden="true" />

      {t('nav.stoppingWatch', {
        name: paths.map((path) => path.split(/[\\/]/).filter(Boolean).pop()).join(', '),
      })}
    </div>
  );
}
