"use client";

import React from "react";

/**
 * A sharp geometric caret that echoes the ascent of the Weirwise mark.
 * Solid accent, no glow or animation trails.
 */
export function CrystallineCursor({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none ml-1.5 inline-flex select-none items-center justify-center align-middle ${className}`}
    >
      <svg viewBox="0 0 12 16" className="h-3.5 w-2.5 fill-accent">
        <polygon points="6,0 12,8 6,16 0,8" />
      </svg>
    </span>
  );
}
