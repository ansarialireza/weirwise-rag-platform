"use client";

import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
  variant?: "header" | "sidebar" | "minimal";
}

const options = [
  { value: "en" as const, label: "EN", title: "English", ariaLabel: "Switch to English" },
  { value: "fa" as const, label: "FA", title: "فارسی (Persian)", ariaLabel: "تغییر به زبان فارسی" },
];

export function LanguageSwitcher({
  className,
  variant = "header",
}: LanguageSwitcherProps) {
  const { locale, setLocale } = useI18n();

  if (variant === "minimal") {
    return (
      <div className={cn("inline-flex select-none items-center gap-3 text-xs", className)}>
        {options.map((option, index) => (
          <span key={option.value} className="inline-flex items-center gap-3">
            {index > 0 && <span className="text-border" aria-hidden="true">/</span>}
            <button
              type="button"
              onClick={() => setLocale(option.value)}
              className={cn(
                "font-medium transition-colors",
                locale === option.value
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title={option.title}
              aria-label={option.ariaLabel}
              aria-pressed={locale === option.value}
            >
              {option.label}
            </button>
          </span>
        ))}
      </div>
    );
  }

  if (variant === "sidebar") {
    return (
      <div
        className={cn(
          "inline-flex select-none items-center rounded-lg border border-border bg-card p-0.5",
          className
        )}
        role="group"
        aria-label="Language"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setLocale(option.value)}
            className={cn(
              "rounded-md px-3 py-1 text-[11px] font-semibold transition-colors",
              locale === option.value
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={option.title}
            aria-label={option.ariaLabel}
            aria-pressed={locale === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex select-none items-center rounded-lg border border-border bg-card p-0.5",
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setLocale(option.value)}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
            locale === option.value
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          title={option.title}
          aria-label={option.ariaLabel}
          aria-pressed={locale === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
