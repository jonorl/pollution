import { en, es, type Strings } from './strings';

export type Lang = 'en' | 'es';

export const LANGS: readonly { id: Lang; label: string; locale: string }[] = [
  { id: 'en', label: 'EN', locale: 'en-GB' },
  { id: 'es', label: 'ES', locale: 'es-AR' },
];

const STRINGS: Record<Lang, Strings> = { en, es };
const STORAGE_KEY = 'pollution:lang';

/** A saved choice wins; otherwise Spanish for Spanish-language browsers, English for the rest. */
function detect(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch {
    // Storage can be blocked; fall back to the browser's language.
  }
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

const localeOf = (lang: Lang) => LANGS.find((l) => l.id === lang)?.locale ?? 'en-GB';

// Module-level rather than React state alone, so the 3D views (which live outside React) read it too.
let current: Lang = detect();
document.documentElement.lang = localeOf(current);
document.title = STRINGS[current].title;

export const getLang = (): Lang => current;
export const getLocale = (): string => localeOf(current);
/** The interface text in the current language. */
export const tr = (): Strings => STRINGS[current];

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = localeOf(lang);
  document.title = STRINGS[lang].title;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage can be blocked; the choice just won't be remembered.
  }
}
