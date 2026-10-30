import React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "interactive" | "subtle";
}

export function Card({ className, variant = "default", ...props }: CardProps) {
  const variants = {
    default: "border border-border bg-card text-card-foreground shadow-sm",
    interactive:
      "border border-border bg-card text-card-foreground shadow-sm hover:border-primary/50 hover:shadow-md transition-all cursor-pointer",
    subtle: "border border-border/60 bg-card/50 text-card-foreground",
  };

  return (
    <div
      className={cn("rounded-xl transition-colors", variants[variant], className)}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 p-5 border-b border-border/50", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
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
  return (
    <p
      className={cn("text-xs text-muted-foreground leading-relaxed", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center p-5 pt-0 border-t border-border/50 mt-4", className)}
      {...props}
    />
  );
}
