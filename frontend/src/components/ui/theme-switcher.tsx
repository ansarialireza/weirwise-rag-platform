"use client";

import { useTheme, Theme } from "@/lib/theme-context";
import { Moon, Sun, Monitor, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThemeSwitcherProps {
  className?: string;
  showLabels?: boolean;
}

export function ThemeSwitcher({ className, showLabels = false }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();

  const themes: { id: Theme; label: string; icon: typeof Moon }[] = [
    { id: "obsidian", label: "Obsidian", icon: Moon },
    { id: "light", label: "Light", icon: Sun },
    { id: "cyber", label: "Cyber", icon: Sparkles },
  ];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 p-1 rounded-lg border border-border bg-card shadow-sm",
        className
      )}
      role="group"
      aria-label="Theme selection"
    >
      {themes.map((item) => {
        const Icon = item.icon;
        const isActive = theme === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setTheme(item.id)}
            aria-pressed={isActive}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              isActive
                ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            )}
            title={`Switch to ${item.label} theme`}
          >
            <Icon className="h-3.5 w-3.5" />
            {showLabels && <span>{item.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
