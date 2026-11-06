"use client";

import React, { useState } from "react";
import { Check, ChevronDown, Copy, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CitationItem } from "@/types";

export interface SourceReferenceLabels {
  sourceFallback: (index: number) => string;
  copyQuote: string;
  copied: string;
}

interface SourceReferencesProps {
  sources: CitationItem[];
  labels: SourceReferenceLabels;
  /** Retrieval confidence, useful to the person building the assistant and noise to
   *  everyone reading an answer. */
  showScore?: boolean;
  className?: string;
}

/**
 * The minimal form of a source list: one line per document, no text shown until the
 * line is opened. One passage is readable at a time, so a long result stays a short
 * block, and the original text is always an interaction away rather than a wall.
 */
export function SourceReferences({ sources, labels, showScore = false, className }: SourceReferencesProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyQuote = async (source: CitationItem, index: number) => {
    try {
      await navigator.clipboard.writeText(source.content);
    } catch {
      return;
    }
    setCopiedIndex(index);
    window.setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1400);
  };

  return (
    <ol className={cn("divide-y divide-border/60 overflow-hidden rounded-lg border border-border", className)}>
      {sources.map((source, index) => {
        const isOpen = openIndex === index;
        const name = source.document_name || labels.sourceFallback(index);
        return (
          <li key={`${name}-${index}`}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-2 text-start transition-colors",
                "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              )}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{name}</span>
              {showScore && Math.round(source.similarity_score * 100) > 0 && (
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {Math.round(source.similarity_score * 100)}%
                </span>
              )}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-fast",
                  isOpen && "rotate-180"
                )}
                aria-hidden="true"
              />
            </button>

            {isOpen && (
              <div className="animate-in border-t border-border/60 bg-muted/30 px-2.5 py-2.5">
                <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
                  {source.content}
                </p>
                <button
                  type="button"
                  onClick={() => copyQuote(source, index)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={copiedIndex === index ? labels.copied : labels.copyQuote}
                >
                  {copiedIndex === index ? (
                    <Check className="h-3 w-3 text-success" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3 w-3" aria-hidden="true" />
                  )}
                  {copiedIndex === index ? labels.copied : labels.copyQuote}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
