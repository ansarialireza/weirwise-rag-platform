import type { Locale, TranslationDictionary } from "./types";
import { defaultLocale } from "./locales";
import en from "@/dictionaries/en.json";
import fa from "@/dictionaries/fa.json";

export * from "./locales";
export * from "./types";

const dictionaries: Record<Locale, TranslationDictionary> = {
  en: en as TranslationDictionary,
  fa: fa as TranslationDictionary,
};

export function getDictionary(locale: Locale): TranslationDictionary {
  return dictionaries[locale] || dictionaries[defaultLocale];
}
