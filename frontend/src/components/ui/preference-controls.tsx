"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Globe, Moon, Sun, Laptop } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n/context";
import { locales, getSpec, type Locale } from "@/lib/i18n";

/**
 * The whole application has exactly one place where theme and language are
 * chosen, and it is this pair of buttons. Every chrome surface imports it
 * rather than growing its own control — three earlier components did the same
 * job differently, and the sidebar had an inline tri-toggle on top of them.
 *
 * Options live inside a popover, so adding a seventh language costs a row in
 * the registry, not a seventh button in the header.
 */

interface TriggerProps {
  open: boolean;
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}

function Trigger({ open, label, children, onClick }: TriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg border border-border/80 bg-card px-2 text-[12px] font-medium",
        "text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        open && "bg-muted text-foreground"
      )}
    >
      {children}
    </button>
  );
}

interface MenuProps {
  id: string;
  label: string;
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
}

function Popover({ id, label, open, onClose, anchorRef, children }: MenuProps) {
  const itemsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      // Keyboard traversal inside the menu: the pointer is not the only way
      // through a product, and a menu nobody can drive is not a menu.
      event.preventDefault();
      const items = Array.from(itemsRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
      if (!items.length) return;
      const current = items.findIndex((el) => el === document.activeElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = current === -1 ? (step === 1 ? 0 : items.length - 1) : (current + step + items.length) % items.length;
      items[next].focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      id={id}
      role="menu"
      aria-label={label}
      ref={itemsRef}
      className="animate-in absolute end-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 text-xs shadow-lift"
    >
      {children}
    </div>
  );
}

function MenuItem({
  selected,
  onClick,
  children,
  icon: Icon,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "font-semibold text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-signal" />}
    </button>
  );
}

function ThemeControl() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { dict } = useI18n();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const options: { id: Theme; label: string; icon: typeof Sun }[] = [
    { id: "light", label: dict.common.lightTheme, icon: Sun },
    { id: "dark", label: dict.common.darkTheme, icon: Moon },
    { id: "system", label: dict.common.systemTheme, icon: Laptop },
  ];
  const Current = resolvedTheme === "light" ? Sun : Moon;

  return (
    <div ref={anchorRef} className="relative">
      <Trigger open={open} label={dict.common.theme} onClick={() => setOpen((v) => !v)}>
        <Current className="h-3.5 w-3.5" />
      </Trigger>
      <Popover id="theme-menu" label={dict.common.theme} open={open} onClose={close} anchorRef={anchorRef}>
        {options.map((option) => (
          <MenuItem
            key={option.id}
            selected={theme === option.id}
            onClick={() => {
              setTheme(option.id);
              close();
            }}
            icon={option.icon}
          >
            {option.label}
          </MenuItem>
        ))}
      </Popover>
    </div>
  );
}

function LanguageControl() {
  const { locale, spec, setLocale, dict } = useI18n();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div ref={anchorRef} className="relative">
      <Trigger open={open} label={dict.common.language} onClick={() => setOpen((v) => !v)}>
        <Globe className="h-3.5 w-3.5" />
        {/* Endonym, not a two-letter code: a reader who is hunting for their own
            language scans for the shape of it, not for letters they may not use. */}
        <span className="max-w-[4.5rem] truncate">{spec.endonym}</span>
      </Trigger>
      <Popover id="language-menu" label={dict.common.language} open={open} onClose={close} anchorRef={anchorRef}>
        {locales.map((code: Locale) => {
          const option = getSpec(code);
          return (
            <MenuItem
              key={code}
              selected={locale === code}
              onClick={() => {
                setLocale(code);
                close();
              }}
              icon={Globe}
            >
              {option.endonym}
            </MenuItem>
          );
        })}
      </Popover>
    </div>
  );
}

export function PreferenceControls({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <LanguageControl />
      <ThemeControl />
    </div>
  );
}
