import React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "interactive" | "subtle";
}

export function Card({ className, variant = "default", ...props }: CardProps) {
  const variants = {
    default: "border border-border bg-card shadow-soft",
    interactive:
      "border border-border bg-card shadow-soft transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-muted-foreground/25 hover:shadow-lift",
    subtle: "border border-border/70 bg-muted/35",
  };

  return <div className={cn("rounded-xl", variants[variant], className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 sm:p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-base font-semibold tracking-tight text-foreground", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] leading-relaxed text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0 sm:p-6 sm:pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center border-t border-border px-5 py-4 sm:px-6", className)}
      {...props}
    />
  );
}
