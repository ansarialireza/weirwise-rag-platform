import { useId } from "react";
import { cn } from "@/lib/utils";
import {
  WW_MARK_GRADIENTS,
  WW_MARK_PATHS,
  WW_MARK_VIEWBOX,
} from "@/components/ui/weirwise-mark-paths";

interface WeirwiseMarkProps {
  className?: string;
  variant?: "two-tone" | "monochrome";
  surface?: "theme" | "dark";
}

/**
 * The official Weirwise mark, drawn inline from generated geometry so it stays
 * crisp at any size. Colour comes from --ww-mark-* variables, which the theme
 * scopes define: silver and cyan on ink surfaces, graphite on paper.
 */
export function WeirwiseMark({
  className,
  variant = "two-tone",
  surface = "theme",
}: WeirwiseMarkProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  return (
    <span
      className={cn(
        "inline-flex aspect-[840/540] shrink-0 items-center justify-center",
        surface === "dark" && "ww-on-ink",
        className
      )}
      aria-hidden="true"
    >
      <svg viewBox={WW_MARK_VIEWBOX} className="h-full w-full overflow-visible">
        {variant === "monochrome" ? (
          WW_MARK_PATHS.map((path, i) => (
            <path key={i} d={path.d} fill="currentColor" fillRule="evenodd" />
          ))
        ) : (
          <>
            <defs>
              {WW_MARK_GRADIENTS.map((gradient) => (
                <linearGradient
                  key={gradient.i}
                  id={`${uid}g${gradient.i}`}
                  gradientUnits="userSpaceOnUse"
                  x1={gradient.x1}
                  y1={gradient.y1}
                  x2={gradient.x2}
                  y2={gradient.y2}
                >
                  <stop offset="0" style={{ stopColor: "var(--ww-mark-1)" }} />
                  <stop offset=".5" style={{ stopColor: "var(--ww-mark-2)" }} />
                  <stop offset="1" style={{ stopColor: "var(--ww-mark-3)" }} />
                </linearGradient>
              ))}
            </defs>
            {WW_MARK_PATHS.map((path, i) =>
              path.accent ? (
                <path key={i} d={path.d} fillRule="evenodd" style={{ fill: "var(--ww-mark-accent)" }} />
              ) : (
                <path key={i} d={path.d} fill={`url(#${uid}g${i})`} fillRule="evenodd" />
              )
            )}
          </>
        )}
      </svg>
    </span>
  );
}
