"use client";

import { useTheme, Theme } from "@/lib/theme-context";
import { Moon, Sun, Laptop, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect, useCallback } from "react";

interface ThemeSwitcherProps {
  className?: string;
}

export function ThemeSwitcher({ className }: ThemeSwitcherProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    },
    [open]
  );

  const options: { id: Theme; label: string; icon: typeof Moon }[] = [
    { id: "dark", label: "Dark", icon: Moon },
    { id: "colorful", label: "Colorful", icon: Palette },
    { id: "light", label: "Light", icon: Sun },
    { id: "system", label: "System", icon: Laptop },
  ];

  const CurrentIcon =
    resolvedTheme === "colorful" ? Palette : resolvedTheme === "light" ? Sun : Moon;

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className={cn("relative inline-block text-left", className)}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border/80 bg-card text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary shadow-xs"
        title={`Theme preference: ${theme} (currently ${resolvedTheme})`}
        aria-label="Toggle theme selection menu"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <CurrentIcon className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme options"
          className="absolute right-0 top-full mt-1.5 w-32 rounded-lg border border-border bg-card shadow-lg py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
        >
          {options.map((opt) => {
            const Icon = opt.icon;
            const isSelected = theme === opt.id;
            return (
              <button
                key={opt.id}
                role="menuitem"
                type="button"
                onClick={() => {
                  setTheme(opt.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center justify-between w-full px-2.5 py-1.5 text-xs transition-colors hover:bg-secondary text-left",
                  isSelected ? "text-primary font-semibold" : "text-foreground"
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  <span>{opt.label}</span>
                </div>
                {isSelected && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
