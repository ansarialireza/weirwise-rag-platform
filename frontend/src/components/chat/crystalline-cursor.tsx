"use client";

import React from "react";

/**
 * CrystallineCursor:
 * Replaces the standard blinking line cursor with the sharp, glowing
 * Cyan/Teal crystal inspired by the right-wing stabilizing apex of the Weirwise logo.
 */
export function CrystallineCursor({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center align-middle ml-1.5 select-none pointer-events-none ${className}`}
    >
      <span className="relative flex h-3.5 w-2.5 items-center justify-center">
        {/* Soft crystalline aura glow */}
        <span className="absolute inline-flex h-full w-full animate-ping rounded-xs bg-[#46C7D6] opacity-40 duration-1000" />
        
        {/* Sharp geometric crystal diamond SVG (Apex of Weirwise Brand Insight) */}
        <svg
          viewBox="0 0 12 16"
          className="relative h-3.5 w-2.5 fill-[#46C7D6] drop-shadow-[0_0_6px_#46C7D6]"
        >
          <polygon points="6,0 12,8 6,16 0,8" />
        </svg>
      </span>
    </span>
  );
}
