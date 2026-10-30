"use client";

import { useTheme, Theme } from "@/lib/theme-context";
import { Moon, Sun, Laptop, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";

interface CompactThemeMenuProps {
  className?: string;
}

export function CompactThemeMenu({ className }: CompactThemeMenuProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const options: { id: Theme; label: string; icon: typeof Moon }[] = [
    { id: "system", label: "System (Auto)", icon: Laptop },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "colorful", label: "Colorful", icon: Palette },
    { id: "light", label: "Light", icon: Sun },
  ];

  const CurrentIcon =
    resolvedTheme === "colorful" ? Palette : resolvedTheme === "light" ? Sun : Moon;

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40"
        title={`Theme preference: ${theme} (currently ${resolvedTheme})`}
        aria-label="Toggle theme menu"
        aria-expanded={open}
      >
        <CurrentIcon className="h-3.5 w-3.5" />
        <span className="text-[11px] capitalize">{theme}</span>
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-36 rounded-md border border-border bg-card shadow-lg py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60 mb-0.5">
            Theme Preference
          </div>
          {options.map((opt) => {
            const Icon = opt.icon;
            const isSelected = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setTheme(opt.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center justify-between w-full px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-secondary",
                  isSelected ? "text-primary font-semibold" : "text-foreground"
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  <span>{opt.label}</span>
                </div>
                {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
