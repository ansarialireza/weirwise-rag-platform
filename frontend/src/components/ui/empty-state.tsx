import React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Button } from "./button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-950/20 py-16 px-6 text-center transition-all",
        className
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/40 text-zinc-400 mb-4">
        <Icon className="h-5 w-5 stroke-[1.5]" />
      </div>
      <h3 className="text-sm font-medium text-foreground tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs text-zinc-400 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <div className="mt-6">
          <Button variant="primary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
