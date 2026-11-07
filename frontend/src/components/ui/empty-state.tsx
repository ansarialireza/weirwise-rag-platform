import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
        "relative flex flex-col items-center justify-center text-center overflow-hidden border border-[#2E3444] bg-[#090A0C] px-6 transition-all",
        compact ? "py-10" : "py-16 sm:py-20",
        className
      )}
    >
      {/* Stark Brutalist Technical Grid Background */}
      <div 
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #CCFF00 1px, transparent 1px),
            linear-gradient(to bottom, #CCFF00 1px, transparent 1px)
          `,
          backgroundSize: "32px 32px",
          backgroundPosition: "center center",
        }}
        aria-hidden="true"
      />

      {/* Decorative Technical Crosshairs on Corners */}
      <div className="pointer-events-none absolute left-3 top-3 font-mono text-[10px] text-[#CCFF00]/40 select-none">
        +
      </div>
      <div className="pointer-events-none absolute right-3 top-3 font-mono text-[10px] text-[#CCFF00]/40 select-none">
        +
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-[10px] text-[#CCFF00]/40 select-none">
        +
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 font-mono text-[10px] text-[#CCFF00]/40 select-none">
        +
      </div>

      {/* Stark Geometric Emblem / Frame */}
      <div className="relative mb-5 flex items-center justify-center">
        {/* Outer sharp square with Electric Lime accent border */}
        <div className="relative flex h-14 w-14 items-center justify-center border-2 border-[#CCFF00] bg-[#101217] shadow-[4px_4px_0px_0px_#CCFF00]">
          <Icon className="h-6 w-6 stroke-[2] text-[#CCFF00]" aria-hidden="true" />
          
          {/* Absolute corner notches */}
          <span className="absolute -top-1 -left-1 h-2 w-2 bg-[#CCFF00]" />
          <span className="absolute -bottom-1 -right-1 h-2 w-2 bg-[#CCFF00]" />
        </div>
      </div>

      {/* Typography: Oversized Minimalist Title & Technical Description */}
      <h3 className="relative text-lg sm:text-xl font-bold uppercase tracking-wider text-white font-mono">
        {title}
      </h3>
      <p className="relative mt-2 max-w-md text-xs sm:text-sm leading-relaxed text-[#A3ACBD] font-mono">
        {description}
      </p>

      {/* Button Restyling: Brutalist, Sharp Edges, High-Contrast Electric Lime, Uppercase, No Rounded Corners */}
      {(actionLabel && onAction) || secondaryAction ? (
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex h-11 items-center justify-center px-6 text-xs sm:text-sm font-bold uppercase tracking-wider bg-[#CCFF00] text-black hover:bg-white hover:text-black active:translate-x-[2px] active:translate-y-[2px] transition-all border-2 border-[#CCFF00] shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090A0C] font-mono select-none"
            >
              {actionLabel}
            </button>
          )}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
