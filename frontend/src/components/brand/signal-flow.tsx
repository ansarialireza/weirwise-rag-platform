import { cn } from "@/lib/utils";

interface SignalFlowProps {
  className?: string;
  animated?: boolean;
  variant?: "wide" | "compact";
}

/**
 * The small sibling of the Living Flow: scattered sources gathering into one
 * clear signal, drawn as a static SVG because an empty state does not warrant
 * a WebGL context. The canvas owns the brand surfaces; this owns the quiet ones.
 */
export function SignalFlow({
  className,
  animated = true,
  variant = "wide",
}: SignalFlowProps) {
  const compact = variant === "compact";
  return (
    <svg
      viewBox={compact ? "0 0 220 96" : "0 0 520 200"}
      fill="none"
      aria-hidden="true"
      className={cn("h-auto w-full", className)}
    >
      <g stroke="hsl(var(--accent))" strokeWidth="1.25" strokeLinecap="round" opacity="0.5">
        <path
          d={compact ? "M20 20 C 65 20, 75 48, 110 48" : "M40 34 C 150 34, 180 100, 260 100"}
          className={animated ? "flow-line" : undefined}
        />
        <path
          d={compact ? "M20 48 C 65 48, 75 48, 110 48" : "M40 100 C 150 100, 180 100, 260 100"}
          className={animated ? "flow-line" : undefined}
          opacity="0.75"
        />
        <path
          d={compact ? "M20 76 C 65 76, 75 48, 110 48" : "M40 166 C 150 166, 180 100, 260 100"}
          className={animated ? "flow-line" : undefined}
        />
      </g>

      {/* Source nodes */}
      <g fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1">
        <circle cx={compact ? 20 : 40} cy={compact ? 20 : 34} r={compact ? 5 : 7} />
        <circle cx={compact ? 20 : 40} cy={compact ? 48 : 100} r={compact ? 5 : 7} />
        <circle cx={compact ? 20 : 40} cy={compact ? 76 : 166} r={compact ? 5 : 7} />
      </g>
      <g fill="hsl(var(--accent))">
        <circle cx={compact ? 20 : 40} cy={compact ? 20 : 34} r={compact ? 2 : 2.5} />
        <circle cx={compact ? 20 : 40} cy={compact ? 48 : 100} r={compact ? 2 : 2.5} />
        <circle cx={compact ? 20 : 40} cy={compact ? 76 : 166} r={compact ? 2 : 2.5} />
      </g>

      {/* The answer node (convergent center) */}
      <circle
        cx={compact ? 110 : 260}
        cy={compact ? 48 : 100}
        r={compact ? 13 : 20}
        fill="hsl(var(--signal) / 0.1)"
        stroke="hsl(var(--signal))"
        strokeWidth="1.25"
      />
      <circle
        cx={compact ? 110 : 260}
        cy={compact ? 48 : 100}
        r={compact ? 6 : 9}
        fill="hsl(var(--signal))"
        className={animated ? "animate-signal origin-center" : undefined}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />

      {/* Signal continues */}
      <g stroke="hsl(var(--signal))" strokeWidth="1.25" strokeLinecap="round" opacity="0.8">
        <path
          d={compact ? "M126 48 H 200" : "M284 100 H 480"}
          className={animated ? "flow-line" : undefined}
          strokeDasharray={compact ? "3 6" : "5 8"}
        />
      </g>
    </svg>
  );
}
