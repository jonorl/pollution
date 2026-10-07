import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';

import { en, es, type Strings } from './strings';

export type Lang = 'en' | 'es';

export const LANGS: readonly { id: Lang; label: string; locale: string }[] = [
  { id: 'en', label: 'EN', locale: 'en-GB' },
  { id: 'es', label: 'ES', locale: 'es-AR' },
];

const STRINGS: Record<Lang, Strings> = { en, es };
const STORAGE_KEY = 'pollution:lang';

/** Spanish for phones set to Spanish, English for the rest. */
function detect(): Lang {
  return getLocales()[0]?.languageCode === 'es' ? 'es' : 'en';
}

const localeOf = (lang: Lang) => LANGS.find((l) => l.id === lang)?.locale ?? 'en-GB';

// Module-level rather than React state alone, so the 3D views (which live outside React) read it too.
let current: Lang = detect();

export const getLang = (): Lang => current;
export const getLocale = (): string => localeOf(current);
/** The interface text in the current language. */
export const tr = (): Strings => STRINGS[current];

export function setLang(lang: Lang): void {
  current = lang;
  AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {
    // Storage can fail; the choice just won't be remembered.
  });
}

/** Restores a choice saved on this phone, which wins over the phone's language. */
export async function loadLang(): Promise<Lang> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'es') current = saved;
  } catch {
    // Storage can fail; the phone's language is fine.
  }
  return current;
}
