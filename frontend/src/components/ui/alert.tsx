import React from "react";
import { AlertCircle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertProps {
  type?: "info" | "success" | "warning" | "destructive";
  title?: string;
  message: React.ReactNode;
  className?: string;
}

export function Alert({ type = "info", title, message, className }: AlertProps) {
  const styles = {
    info: "border-accent/25 bg-accent-soft text-foreground",
    success: "border-success/25 bg-success/10 text-foreground",
    warning: "border-warning/25 bg-warning/10 text-foreground",
    destructive: "border-destructive/25 bg-destructive/10 text-foreground",
  };

  const icons = {
    info: <Info className="h-4 w-4 text-accent" />,
    success: <CheckCircle2 className="h-4 w-4 text-success" />,
    warning: <AlertCircle className="h-4 w-4 text-warning" />,
    destructive: <XCircle className="h-4 w-4 text-destructive" />,
  };

  return (
    <div
      role="alert"
      className={cn("flex items-start gap-3 rounded-xl border p-3.5 text-[13px]", styles[type], className)}
    >
      <span className="mt-0.5 shrink-0">{icons[type]}</span>
      <div className="space-y-0.5">
        {title && <h5 className="font-semibold text-foreground">{title}</h5>}
        <div className="leading-relaxed text-muted-foreground">{message}</div>
      </div>
    </div>
  );
}

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "primary" | "outline" | "success" | "warning" | "destructive" | "accent";
  className?: string;
}) {
  const variants = {
    default: "border-border bg-muted text-muted-foreground",
    primary: "border-primary/15 bg-primary/10 text-foreground",
    outline: "border-border bg-transparent text-muted-foreground",
    success: "border-success/20 bg-success/10 text-success",
    warning: "border-warning/20 bg-warning/10 text-warning",
    destructive: "border-destructive/20 bg-destructive/10 text-destructive",
    accent: "border-accent/20 bg-accent/10 text-accent",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
