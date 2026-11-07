import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { SignalFlow } from "@/components/brand/signal-flow";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryAction?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryAction,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center text-center overflow-hidden rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm px-6 transition-all",
        compact ? "py-10" : "py-16 sm:py-20",
        className
      )}
    >
      {/* Subtle organic SignalFlow animation ambient glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center opacity-70">
        <SignalFlow variant="compact" className="mx-auto max-w-[320px]" />
      </div>

      {/* Modern, soft icon emblem with theme-aware accent colors */}
      <div className="relative mb-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/80 bg-muted/60 text-primary shadow-xs">
        <Icon className="h-6 w-6 stroke-[1.8]" aria-hidden="true" />
      </div>

      {/* Typography: Balanced, responsive, elegant font */}
      <h3 className="relative text-base sm:text-lg font-semibold tracking-tight text-foreground text-center">
        {title}
      </h3>
      <p className="relative mt-2 max-w-sm text-xs sm:text-sm leading-relaxed text-muted-foreground text-center">
        {description}
      </p>

      {/* Action Buttons: Unified with Platform Button Tokens */}
      {(actionLabel && onAction) || secondaryAction ? (
        <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {actionLabel && onAction && (
            <Button variant="primary" size="md" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
