import type { Direction, Locale } from "./types";

/**
 * Everything a language needs, in one row. Adding a locale should mean adding a
 * row here plus a dictionary — never a new branch in a component.
 *
 * `bcp47` and `numbering` drive Intl, so dates and digits follow the reader
 * instead of the build. `fontStack` is the token name, not a CSS literal.
 */
export interface LocaleSpec {
  code: Locale;
  bcp47: string;
  /** What speakers call their own language, always in its own script. */
  endonym: string;
  englishName: string;
  direction: Direction;
  fontStack: "body" | "arabic";
  numbering: "latn" | "arab" | "arabext";
  calendar: "gregory" | "persian";
}

export const localeSpecs: Record<Locale, LocaleSpec> = {
  en: {
    code: "en",
    bcp47: "en",
    endonym: "English",
    englishName: "English",
    direction: "ltr",
    fontStack: "body",
    numbering: "latn",
    calendar: "gregory",
  },
  fa: {
    code: "fa",
    bcp47: "fa-IR",
    endonym: "فارسی",
    englishName: "Persian",
    direction: "rtl",
    fontStack: "arabic",
    numbering: "arabext",
    calendar: "persian",
  },
};

/**
 * Generation order. `toggleLocale` in the provider is deliberately gone: with
 * more than two languages a toggle has no meaning, and every locale deserves
 * the same one control.
 */
export const locales = (Object.keys(localeSpecs) as Locale[]).sort((a, b) =>
  localeSpecs[a].code.localeCompare(localeSpecs[b].code)
);

export const defaultLocale: Locale = "en";

export function getDirection(locale: Locale): Direction {
  return localeSpecs[locale]?.direction ?? "ltr";
}

export function getSpec(locale: Locale): LocaleSpec {
  return localeSpecs[locale] ?? localeSpecs[defaultLocale];
}

/** Accepts `fa`, `fa-IR`, `FA_ir` and returns the closest locale we ship, or null. */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const primary = tag.toLowerCase().split("-")[0];
  const found = locales.find((l) => l === primary);
  return found ?? null;
}
