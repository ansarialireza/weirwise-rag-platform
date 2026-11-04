"use client";

import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
  variant?: "header" | "sidebar" | "minimal";
}

export function LanguageSwitcher({
  className,
  variant = "header",
}: LanguageSwitcherProps) {
  const { locale, setLocale } = useI18n();

  if (variant === "minimal") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 font-mono text-xs select-none tracking-wider",
          className
        )}
      >
        <button
          type="button"
          onClick={() => setLocale("en")}
          className={cn(
            "transition-colors text-xs font-semibold py-0.5",
            locale === "en"
              ? "text-[#CCFF00] underline underline-offset-4 decoration-2 decoration-[#CCFF00]"
              : "text-zinc-500 hover:text-zinc-300"
          )}
          title="English"
          aria-label="Switch to English"
        >
          EN
        </button>
        <span className="text-zinc-600 select-none text-[11px]">/</span>
        <button
          type="button"
          onClick={() => setLocale("fa")}
          className={cn(
            "transition-colors text-xs font-semibold py-0.5",
            locale === "fa"
              ? "text-[#CCFF00] underline underline-offset-4 decoration-2 decoration-[#CCFF00]"
              : "text-zinc-500 hover:text-zinc-300"
          )}
          title="فارسی (Persian)"
          aria-label="تغییر به زبان فارسی"
        >
          FA
        </button>
      </div>
    );
  }

  if (variant === "sidebar") {
    return (
      <div
        className={cn(
          "rounded-md border border-zinc-800/80 bg-zinc-900/30 p-1.5 flex items-center justify-between gap-2",
          className
        )}
      >
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 ps-1">
          Language
        </span>
        <div className="flex items-center gap-0.5 rounded-sm border border-zinc-800/90 bg-zinc-950/80 p-0.5 font-mono text-[11px]">
          <button
            type="button"
            onClick={() => setLocale("en")}
            className={cn(
              "px-2 py-0.5 rounded-xs transition-colors font-medium",
              locale === "en"
                ? "bg-zinc-800 text-white shadow-xs"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
            )}
            title="English"
            aria-label="Switch to English"
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLocale("fa")}
            className={cn(
              "px-2 py-0.5 rounded-xs transition-colors font-medium",
              locale === "fa"
                ? "bg-zinc-800 text-white shadow-xs"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
            )}
            title="فارسی (Persian)"
            aria-label="تغییر به زبان فارسی"
          >
            FA
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-sm border border-zinc-800/80 bg-zinc-950/80 p-0.5 font-mono text-xs select-none",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={cn(
          "px-2 py-1 rounded-xs transition-colors text-[11px] font-medium leading-none",
          locale === "en"
            ? "bg-zinc-800 text-white shadow-xs"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50"
        )}
        title="English"
        aria-label="Switch to English"
      >
        EN
      </button>
      <span className="text-zinc-700 text-[10px] select-none px-0.5">/</span>
      <button
        type="button"
        onClick={() => setLocale("fa")}
        className={cn(
          "px-2 py-1 rounded-xs transition-colors text-[11px] font-medium leading-none",
          locale === "fa"
            ? "bg-zinc-800 text-white shadow-xs"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50"
        )}
        title="فارسی (Persian)"
        aria-label="تغییر به زبان فارسی"
      >
        FA
      </button>
    </div>
  );
}
