import React from "react";
import { cn } from "@/lib/utils";

interface WeirwiseSymbolProps {
  className?: string;
  variant?: "two-tone" | "monochrome";
  size?: number | string;
}

/**
 * Official Weirwise Monogram Symbol (Concept 06: Shared Structure)
 * Canonical Brand Source of Truth:
 * - shared-path: Electric Lime (#CCFF00) - Fixed official brand color across all application themes
 * - upper-path & lower-path: Electric Blue (#2563FF) - Fixed official brand color across all application themes
 *
 * Theme changes (dark, light, colorful) do NOT alter official brand identity vectors or colors.
 * Use variant="monochrome" only when explicitly rendering single-color contexts (e.g. print/stamp).
 */
export function WeirwiseSymbol({ className, variant = "two-tone" }: WeirwiseSymbolProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md bg-card p-1 border border-border shadow-xs shrink-0 select-none transition-colors",
        className
      )}
    >
      <svg
        viewBox="0 0 350 170"
        className="w-full h-full object-contain"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <g transform="translate(10, 10)">
          {/* Primary Flow Bridge: Official Electric Lime (#CCFF00) */}
          <path
            id="shared-path"
            d="M 10.5,15.75 H 135.25 C 138,15.75 139.5,17 141.75,20.5 L 198,111.75 Q 200.5,115.75 203.5,111.75 L 229.5,70 Q 231.5,67 234.5,67 H 282.5 Q 285.75,67 283.75,70.75 L 247.75,130 Q 244,136.5 237.25,136.5 H 162.75 Q 155.25,136.5 151.75,130.25 L 105,53.5 Q 103.75,51.5 101.25,51.5 H 36.75 Q 31.75,51.5 28.75,46.5 Z"
            fill={variant === "two-tone" ? "#CCFF00" : "currentColor"}
          />
          {/* Upper Right Stabilizing Wing: Official Electric Blue (#2563FF) */}
          <path
            id="upper-path"
            d="M 316.75,15.75 H 216.5 Q 211,15.75 207.5,21.25 L 184,59.25 Q 182.75,61.25 184,63.25 L 200,88.75 L 222.5,53.5 Q 223.75,51.5 226.5,51.5 H 292.5 Q 297.25,51.5 300,46.75 Z"
            fill={variant === "two-tone" ? "#2563FF" : "currentColor"}
          />
          {/* Lower Left Stabilizing Wing: Official Electric Blue (#2563FF) */}
          <path
            id="lower-path"
            d="M 46.5,67 H 94.25 Q 98.75,67 101,70.75 L 125.5,110.75 Q 128.25,114.75 125.5,119.5 L 117.5,132.25 Q 115,136.5 110,136.5 H 90.5 Q 84.25,136.5 80.75,130.75 L 44.25,70.5 Q 42,67 46.5,67 Z"
            fill={variant === "two-tone" ? "#2563FF" : "currentColor"}
          />
        </g>
      </svg>
    </div>
  );
}
