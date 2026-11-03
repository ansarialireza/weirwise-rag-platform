import type { Locale, Direction, TranslationDictionary } from "./types";
import en from "@/dictionaries/en.json";
import fa from "@/dictionaries/fa.json";

export const locales: Locale[] = ["en", "fa"];
export const defaultLocale: Locale = "en";

export function getDirection(locale: Locale): Direction {
  return locale === "fa" ? "rtl" : "ltr";
}

const dictionaries: Record<Locale, TranslationDictionary> = {
  en: en as TranslationDictionary,
  fa: fa as TranslationDictionary,
};

export function getDictionary(locale: Locale): TranslationDictionary {
  return dictionaries[locale] || dictionaries[defaultLocale];
}

export * from "./types";
