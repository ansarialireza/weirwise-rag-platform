"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface BrutalistLoaderProps {
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function BrutalistLoader({ label = "Loading", className, size = "md" }: BrutalistLoaderProps) {
  const dotSize = size === "sm" ? "h-1.5 w-1.5" : size === "lg" ? "h-2.5 w-2.5" : "h-2 w-2";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex select-none flex-col items-center justify-center gap-3", className)}
    >
      <div className="flex items-end gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn("animate-signal rounded-full bg-accent", dotSize)}
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </div>
      <span className="text-xs font-medium tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}
