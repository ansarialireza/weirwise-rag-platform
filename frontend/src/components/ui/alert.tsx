import React from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Info, XCircle } from "lucide-react";

interface AlertProps {
  type?: "info" | "success" | "warning" | "destructive";
  title?: string;
  message: string;
  className?: string;
}

export function Alert({ type = "info", title, message, className }: AlertProps) {
  const styles = {
    info: "border-primary/30 bg-primary/10 text-foreground",
    success: "border-emerald-500/30 bg-emerald-500/10 text-foreground",
    warning: "border-amber-500/30 bg-amber-500/10 text-foreground",
    destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  };

  const icons = {
    info: <Info className="h-4 w-4 text-primary flex-shrink-0" />,
    success: <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />,
    warning: <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />,
    destructive: <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />,
  };

  return (
    <div
      role="alert"
      className={cn("flex items-start gap-3 rounded-lg border p-3.5 text-xs shadow-sm", styles[type], className)}
    >
      {icons[type]}
      <div className="space-y-0.5">
        {title && <h5 className="font-semibold">{title}</h5>}
        <div className="leading-relaxed opacity-90">{message}</div>
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
  variant?: "default" | "primary" | "outline" | "success" | "destructive";
  className?: string;
}) {
  const variants = {
    default: "border-border bg-secondary text-secondary-foreground",
    primary: "border-primary/20 bg-primary/10 text-primary font-semibold",
    outline: "border-border text-muted-foreground",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
    destructive: "border-destructive/20 bg-destructive/10 text-destructive",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border tracking-wide uppercase font-mono",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
