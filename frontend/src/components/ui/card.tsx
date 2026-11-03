import React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "interactive" | "subtle";
}

export function Card({ className, variant = "default", ...props }: CardProps) {
  const variants = {
    default: "border border-zinc-800/80 bg-zinc-950/20 text-card-foreground",
    interactive:
      "border border-zinc-800/80 bg-zinc-950/20 text-card-foreground hover:border-zinc-700 hover:bg-zinc-900/30 transition-all cursor-pointer",
    subtle: "border border-zinc-900 bg-transparent text-card-foreground",
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
      className={cn("flex flex-col space-y-1.5 p-6 border-b border-zinc-800/60", className)}
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
      className={cn("text-sm sm:text-base font-semibold tracking-tight text-foreground", className)}
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
      className={cn("text-xs text-zinc-400 leading-relaxed", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center p-6 pt-0 border-t border-zinc-800/60 mt-4", className)}
      {...props}
    />
  );
}
