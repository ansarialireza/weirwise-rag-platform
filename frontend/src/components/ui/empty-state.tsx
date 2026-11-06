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
        "relative flex flex-col items-center justify-center text-center overflow-hidden rounded-xl border border-border bg-card px-6",
        compact ? "py-10" : "py-16",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center opacity-60">
        <SignalFlow variant="compact" className="mx-auto max-w-[260px]" />
      </div>
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-accent">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="relative mt-4 text-[15px] font-semibold tracking-tight text-foreground text-center">{title}</h3>
      <p className="relative mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground text-center">
        {description}
      </p>
      {(actionLabel && onAction) || secondaryAction ? (
        <div className="relative mt-5 flex flex-wrap items-center justify-center gap-2">
          {actionLabel && onAction && (
            <Button variant="primary" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
