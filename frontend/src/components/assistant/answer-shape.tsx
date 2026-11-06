import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnswerShapeProps {
  /** "prose" is a written answer, "passages" is a list of documents you can open. */
  variant: "prose" | "passages";
  /** Only meaningful for "passages": the reader gets the list, or only its summary. */
  revealed?: boolean;
  selected?: boolean;
  className?: string;
}

/**
 * A drawing of what the reader gets, so neither the mode nor the source switch has
 * to be described in words: lines of uneven length are an answer that was written,
 * rows with a document mark and a caret are passages that can be opened.
 */
export function AnswerShape({ variant, revealed = true, selected = false, className }: AnswerShapeProps) {
  const strong = selected ? "bg-accent/50" : "bg-muted-foreground/25";
  const soft = selected ? "bg-accent/30" : "bg-muted-foreground/15";

  if (variant === "prose") {
    return (
      <span aria-hidden="true" className={cn("block space-y-1", className)}>
        {["w-full", "w-11/12", "w-1/2"].map((width, index) => (
          <span
            key={width}
            className={cn(
              "block h-1 rounded-full transition-colors duration-fast",
              width,
              index === 0 ? strong : soft
            )}
          />
        ))}
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={cn("relative block h-7", className)}>
      {/* Sources off: one short line, because that is all the reader is given. */}
      <span
        className={cn(
          "absolute inset-x-0 top-1/2 h-1 w-2/5 -translate-y-1/2 rounded-full transition-opacity duration-fast",
          soft,
          revealed ? "opacity-0" : "opacity-100"
        )}
      />
      <span
        className={cn(
          "absolute inset-x-0 top-0 space-y-1 transition-all duration-fast",
          revealed ? "opacity-100" : "translate-y-1 opacity-0"
        )}
      >
        {[0, 1].map((row) => (
          <span key={row} className="flex items-center gap-1">
            <span className={cn("h-2 w-1.5 shrink-0 rounded-[1px] transition-colors duration-fast", strong)} />
            <span className={cn("h-1 flex-1 rounded-full transition-colors duration-fast", soft)} />
            <ChevronDown
              className={cn(
                "h-2 w-2 shrink-0 transition-colors duration-fast",
                selected ? "text-accent" : "text-muted-foreground/50"
              )}
              strokeWidth={3}
            />
          </span>
        ))}
      </span>
    </span>
  );
}
