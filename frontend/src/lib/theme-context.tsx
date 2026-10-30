"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export type Theme = "dark" | "light" | "system";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  resolvedTheme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
});

const STORAGE_KEY = "wwp_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default preference is strictly "system"
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  const getSystemTheme = useCallback((): "dark" | "light" => {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }, []);

  const applyTheme = useCallback((t: Theme) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.remove("dark", "light", "theme-obsidian", "theme-light", "theme-cyber");

    const effective = t === "system" ? getSystemTheme() : t;
    setResolvedTheme(effective);

    if (effective === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.add("light");
    }
  }, [getSystemTheme]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    let initial: Theme = "system";

    if (stored === "dark" || stored === "light") {
      initial = stored;
    } else if (stored === "system") {
      initial = "system";
    }

    setThemeState(initial);
    applyTheme(initial);
    setMounted(true);

    // Active listener for OS theme changes while app is open
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = () => {
      const currentStored = localStorage.getItem(STORAGE_KEY);
      // If user has not set an explicit override (or explicitly selected "system"), follow OS
      if (!currentStored || currentStored === "system") {
        applyTheme("system");
      }
    };

    mediaQuery.addEventListener("change", handleSystemChange);
    return () => mediaQuery.removeEventListener("change", handleSystemChange);
  }, [applyTheme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    if (newTheme === "system") {
      // Clear explicit override or persist "system"
      localStorage.setItem(STORAGE_KEY, "system");
    } else {
      localStorage.setItem(STORAGE_KEY, newTheme);
    }
    applyTheme(newTheme);
  };

  const toggleTheme = () => {
    // When toggling manually, alternate between dark and light
    const next: Theme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
