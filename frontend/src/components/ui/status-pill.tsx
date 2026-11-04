import React from "react";
import { Check, Clock3, Loader2, AlertTriangle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusKind = "ready" | "processing" | "pending" | "failed" | "draft" | "published" | "unpublished" | string;

interface StatusPillProps {
  status: StatusKind;
  label?: string;
  className?: string;
}

const statusConfig: Record<
  string,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  ready: {
    label: "Ready",
    className: "border-success/20 bg-success/10 text-success",
    icon: Check,
  },
  completed: {
    label: "Ready",
    className: "border-success/20 bg-success/10 text-success",
    icon: Check,
  },
  published: {
    label: "Published",
    className: "border-success/20 bg-success/10 text-success",
    icon: Check,
  },
  processing: {
    label: "Processing",
    className: "border-accent/25 bg-accent-soft text-accent",
    icon: Loader2,
  },
  pending: {
    label: "Queued",
    className: "border-border bg-muted text-muted-foreground",
    icon: Clock3,
  },
  queued: {
    label: "Queued",
    className: "border-border bg-muted text-muted-foreground",
    icon: Clock3,
  },
  draft: {
    label: "Draft",
    className: "border-border bg-muted text-muted-foreground",
    icon: Circle,
  },
  unpublished: {
    label: "Unpublished",
    className: "border-border bg-muted text-muted-foreground",
    icon: Circle,
  },
  failed: {
    label: "Needs attention",
    className: "border-destructive/25 bg-destructive/10 text-destructive",
    icon: AlertTriangle,
  },
  error: {
    label: "Needs attention",
    className: "border-destructive/25 bg-destructive/10 text-destructive",
    icon: AlertTriangle,
  },
};

export function StatusPill({ status, label, className }: StatusPillProps) {
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;
  const spinning = status === "processing";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        config.className,
        className
      )}
    >
      <Icon
        className={cn("h-3 w-3", spinning && "animate-spin")}
        aria-hidden="true"
      />
      <span>{label || config.label}</span>
    </span>
  );
}
