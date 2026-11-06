"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface SourcesToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  /** The word on the control, so the switch never has to be explained. */
  label: string;
  className?: string;
}

/**
 * The one control a reader gets: sources on, sources off. A switch rather than an
 * icon button because on/off is the whole job, and a reader should not have to
 * guess what an icon does before they trust it enough to tap it.
 */
export function SourcesToggle({ enabled, onChange, label, className }: SourcesToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        "inline-flex items-center gap-2 rounded-full py-1 pe-1.5 ps-1 text-[11px] font-medium",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        enabled ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative block h-4 w-7 shrink-0 rounded-full transition-colors duration-fast",
          enabled ? "bg-signal" : "border border-border bg-muted"
        )}
      >
        <span
          className={cn(
            "absolute start-[3px] top-[3px] block h-2.5 w-2.5 rounded-full bg-card shadow-sm",
            "transition-transform duration-fast",
            enabled ? "ltr:translate-x-3 rtl:-translate-x-3" : "translate-x-0"
          )}
        />
      </span>
      {label}
    </button>
  );
}
