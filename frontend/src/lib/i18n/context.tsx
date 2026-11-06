"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Locale, Direction, TranslationDictionary } from "./types";
import {
  defaultLocale,
  getDictionary,
  getDirection,
  getSpec,
  locales,
  matchLocale,
  type LocaleSpec,
} from "./index";

interface I18nContextType {
  locale: Locale;
  direction: Direction;
  spec: LocaleSpec;
  dict: TranslationDictionary;
  setLocale: (locale: Locale) => void;
}

const fallbackValue: I18nContextType = {
  locale: defaultLocale,
  direction: "ltr",
  spec: getSpec(defaultLocale),
  dict: getDictionary(defaultLocale),
  setLocale: () => {},
};

const I18nContext = createContext<I18nContextType>(fallbackValue);

const LOCALE_COOKIE = "wwp_locale";

/** Read the choice the same way the boot script and middleware do. */
export function readStoredLocale(): Locale | null {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(LOCALE_COOKIE);
  } catch {
    // Storage can be blocked; the cookie below still works.
  }
  if (!saved && typeof document !== "undefined") {
    const match = document.cookie.match(new RegExp(`(^|;\\s*)${LOCALE_COOKIE}=([^;]*)`));
    if (match) saved = decodeURIComponent(match[2]);
  }
  return matchLocale(saved);
}

function detectLocale(): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;
  // Accept-Language order matters: walk the list and take the first we ship.
  const preferred = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
  for (const tag of preferred) {
    const hit = matchLocale(tag);
    if (hit) return hit;
  }
  return defaultLocale;
}

function applyDocumentLocale(locale: Locale) {
  const root = document.documentElement;
  const spec = getSpec(locale);
  root.lang = spec.code;
  root.dir = spec.direction;
  root.dataset.font = spec.fontStack;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  try {
    localStorage.setItem(LOCALE_COOKIE, locale);
  } catch {
    // Cookie above is the durable copy.
  }
}

export function I18nProvider({
  children,
  initialLocale = defaultLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    const detected = detectLocale();
    setLocaleState(detected);
    applyDocumentLocale(detected);
  }, []);

  const applyLocale = useCallback((newLocale: Locale) => {
    if (!locales.includes(newLocale)) return;
    setLocaleState(newLocale);
    if (typeof document !== "undefined") applyDocumentLocale(newLocale);
  }, []);

  const value: I18nContextType = {
    locale,
    direction: getDirection(locale),
    spec: getSpec(locale),
    dict: getDictionary(locale),
    setLocale: applyLocale,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
