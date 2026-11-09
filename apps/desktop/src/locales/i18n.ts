import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import es from './es.json';

// ----------------------------------------------------------------------

export const LANGUAGES = ['es', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'wakeline-lang';

/** Idioma guardado por el usuario; si no hay, el del sistema; si no es español, inglés. */
export function initialLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'es' || saved === 'en') return saved;
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export async function changeLanguage(lang: Language) {
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  await i18n.changeLanguage(lang);
  syncTrayLabels();
}

/** El menú de la bandeja lo dibuja Windows: hay que pasarle los textos. */
function syncTrayLabels() {
  if (!('__TAURI_INTERNALS__' in window)) return;
  import('@tauri-apps/api/core').then(({ invoke }) =>
    invoke('set_tray_labels', { open: i18n.t('tray.open'), quit: i18n.t('tray.quit') }).catch(
      () => {}
    )
  );
}

const lng = initialLanguage();
document.documentElement.lang = lng;

i18n
  .use(initReactI18next)
  .init({
    resources: { es: { translation: es }, en: { translation: en } },
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
  .then(syncTrayLabels);

export default i18n;
