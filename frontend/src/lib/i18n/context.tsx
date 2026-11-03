"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Locale, Direction, TranslationDictionary, getDictionary, getDirection, defaultLocale, locales } from "./index";

interface I18nContextType {
  locale: Locale;
  direction: Direction;
  dict: TranslationDictionary;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

const I18nContext = createContext<I18nContextType>({
  locale: defaultLocale,
  direction: "ltr",
  dict: getDictionary(defaultLocale),
  setLocale: () => {},
  toggleLocale: () => {},
});

const LOCALE_COOKIE = "wwp_locale";

export function I18nProvider({
  children,
  initialLocale = defaultLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [mounted, setMounted] = useState(false);

  const applyLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    const dir = getDirection(newLocale);

    if (typeof document !== "undefined") {
      document.documentElement.lang = newLocale;
      document.documentElement.dir = dir;
      document.cookie = `${LOCALE_COOKIE}=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
      try {
        localStorage.setItem(LOCALE_COOKIE, newLocale);
      } catch {
        // LocalStorage fallback handled
      }
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    // 1. Check cookie or local storage
    let saved: Locale | null = null;
    try {
      saved = localStorage.getItem(LOCALE_COOKIE) as Locale | null;
    } catch {
      // ignore
    }

    if (!saved && typeof document !== "undefined") {
      const match = document.cookie.match(new RegExp(`(^|;\\s*)${LOCALE_COOKIE}=([^;]*)`));
      if (match) saved = match[2] as Locale;
    }

    if (saved && locales.includes(saved)) {
      applyLocale(saved);
    } else if (typeof navigator !== "undefined" && navigator.language) {
      const navLang = navigator.language.toLowerCase();
      if (navLang.startsWith("fa")) {
        applyLocale("fa");
      } else {
        applyLocale(initialLocale);
      }
    } else {
      applyLocale(initialLocale);
    }
  }, [applyLocale, initialLocale]);

  const toggleLocale = useCallback(() => {
    const next = locale === "en" ? "fa" : "en";
    applyLocale(next);
  }, [locale, applyLocale]);

  const dict = getDictionary(locale);
  const direction = getDirection(locale);

  return (
    <I18nContext.Provider
      value={{
        locale,
        direction,
        dict,
        setLocale: applyLocale,
        toggleLocale,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
