"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface BrutalistLoaderProps {
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function BrutalistLoader({
  label = "PROCESSING",
  className,
  size = "md",
}: BrutalistLoaderProps) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 350);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      role="status"
      aria-label={`${label}${dots}`}
      className={cn(
        "flex flex-col items-center justify-center gap-3 select-none",
        className
      )}
    >
      {/* Brutalist terminal cursor block & pulse bar */}
      <div className="flex items-center gap-2 font-mono">
        <span className="text-zinc-600 font-bold text-xs">[</span>
        <div className="relative flex items-center">
          <span
            className={cn(
              "font-mono font-bold tracking-widest text-[#46C7D6] uppercase",
              size === "sm" && "text-[11px]",
              size === "md" && "text-xs",
              size === "lg" && "text-sm"
            )}
          >
            {label}
            <span className="inline-block w-4 text-left">{dots}</span>
          </span>
        </div>
        {/* Blinking Cyan terminal block cursor */}
        <span
          className={cn(
            "inline-block bg-[#46C7D6] animate-pulse duration-700",
            size === "sm" ? "h-3 w-1.5" : size === "md" ? "h-3.5 w-2" : "h-4 w-2.5"
          )}
          aria-hidden="true"
        />
        <span className="text-zinc-600 font-bold text-xs">]</span>
      </div>

      {/* High-contrast minimalist telemetry bar */}
      <div className="w-28 sm:w-36 h-0.5 bg-zinc-900 border border-zinc-800 overflow-hidden relative">
        <div className="h-full bg-gradient-to-r from-transparent via-[#46C7D6] to-transparent w-1/2 animate-shimmer" />
      </div>
    </div>
  );
}
