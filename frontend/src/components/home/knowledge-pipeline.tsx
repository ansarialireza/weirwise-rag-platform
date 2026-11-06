import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PipelineNode {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface KnowledgePipelineProps {
  /** Exactly four nodes: the rail spans from the centre of the first to the
   *  centre of the last, which is what a four-column grid puts at 12.5%. */
  nodes: PipelineNode[];
  className?: string;
}

/**
 * The route knowledge takes through the product, drawn instead of written. The
 * list carries the words and the order; the rail and the travelling comet carry
 * the direction, so the section needs no explanatory paragraph.
 */
export function KnowledgePipeline({ nodes, className }: KnowledgePipelineProps) {
  return (
    <div className={cn("relative", className)}>
      <div aria-hidden="true" className="flow-rail">
        <span className="flow-comet" />
      </div>

      <ol className="relative grid grid-cols-4 gap-x-1.5 sm:gap-x-2">
        {nodes.map((node, index) => {
          const Icon = node.icon;
          return (
            <li key={node.id} className="flex flex-col items-center gap-2 text-center sm:gap-2.5">
              <span
                className="flow-node flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground sm:h-8 sm:w-8"
                style={{ animationDelay: `${index}s` }}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <h3 className="text-[11px] font-medium leading-tight text-foreground sm:text-xs">
                {node.label}
              </h3>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
