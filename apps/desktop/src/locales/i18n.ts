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

export function changeLanguage(lang: Language) {
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  return i18n.changeLanguage(lang);
}

const lng = initialLanguage();
document.documentElement.lang = lng;

i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
