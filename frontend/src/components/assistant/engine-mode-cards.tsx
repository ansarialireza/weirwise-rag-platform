"use client";

import type { ReactNode } from "react";
import { Search, Sparkles } from "lucide-react";
import { AnswerShape } from "@/components/assistant/answer-shape";
import { cn } from "@/lib/utils";
import type { EngineMode } from "@/types";

const OPTIONS = [
  { value: "ai_answer", title: "AI answers", icon: Sparkles, variant: "prose" },
  { value: "search_only", title: "Search only", icon: Search, variant: "passages" },
] as const;

interface EngineModeCardsProps {
  value: EngineMode;
  onChange: (value: EngineMode) => void;
  /**
   * A control for the Search card, shown only while it is selected. The card's own
   * drawing reacts to it, so the setting demonstrates itself and needs no sentence.
   */
  searchControl?: ReactNode;
  /** Whether the passages drawn in the Search card are visible to the reader. */
  searchControlOn?: boolean;
  className?: string;
}

/**
 * The choice between a written answer and a list of passages, drawn rather than
 * explained: each card shows the shape of what its reader will see.
 */
export function EngineModeCards({
  value,
  onChange,
  searchControl,
  searchControlOn = true,
  className,
}: EngineModeCardsProps) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = value === option.value;
        const showControl = option.value === "search_only" && selected && searchControl;
        return (
          <div
            key={option.value}
            className={cn(
              "overflow-hidden rounded-xl border transition-colors",
              selected
                ? "border-accent/50 bg-accent-soft"
                : "border-border bg-background hover:bg-muted/50"
            )}
          >
            <button
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className="block w-full rounded-xl p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <Icon
                  className={cn("h-4 w-4 shrink-0", selected ? "text-accent" : "text-muted-foreground")}
                  aria-hidden="true"
                />
                {option.title}
              </span>
              <AnswerShape
                variant={option.variant}
                revealed={option.value === "search_only" ? searchControlOn : true}
                selected={selected}
                className={cn("mt-2 transition-opacity duration-fast", !selected && "opacity-70")}
              />
            </button>

            {showControl && (
              <div className="flex items-center justify-end border-t border-accent/25 px-3 py-1.5">
                {searchControl}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
