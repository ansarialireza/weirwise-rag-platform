"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "obsidian" | "light" | "cyber";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "obsidian",
  setTheme: () => {},
  toggleTheme: () => {},
});

const STORAGE_KEY = "wwp_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("obsidian");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 1. Check local storage
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "obsidian" || stored === "light" || stored === "cyber") {
      setThemeState(stored);
      applyThemeClass(stored);
    } else {
      // 2. Check system preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initial: Theme = prefersDark ? "obsidian" : "light";
      setThemeState(initial);
      applyThemeClass(initial);
    }
    setMounted(true);
  }, []);

  const applyThemeClass = (t: Theme) => {
    const root = document.documentElement;
    root.classList.remove("theme-obsidian", "theme-light", "theme-cyber", "dark", "light");

    if (t === "obsidian") {
      root.classList.add("dark", "theme-obsidian");
    } else if (t === "cyber") {
      root.classList.add("dark", "theme-cyber");
    } else {
      root.classList.add("light", "theme-light");
    }
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyThemeClass(newTheme);
  };

  const toggleTheme = () => {
    const next: Theme = theme === "obsidian" ? "light" : theme === "light" ? "cyber" : "obsidian";
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
