"use client";

import React from "react";

export function IntelligentFlowGraphic() {
  return (
    <div className="relative flex h-full w-full select-none flex-col justify-between overflow-hidden bg-background/50 p-12 text-foreground transition-colors">
      <div className="relative z-10 space-y-1">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-[11px] font-mono text-muted-foreground shadow-sm backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          <span>Intelligent Flow Control &bull; RAG &amp; Copilot Synthesis</span>
        </div>
        <p className="pt-1 text-xs text-muted-foreground">
          Scattered unstructured corporate knowledge routed and synthesized into verified grounded answers.
        </p>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-lg py-8">
        <svg
          viewBox="0 0 540 280"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-auto w-full"
          role="img"
          aria-label="Knowledge streams converging into a verification core and producing a cited answer"
        >
          <defs>
            <linearGradient id="flowGradAccent" x1="40" y1="50" x2="270" y2="140" gradientUnits="userSpaceOnUse">
              <stop offset="0%" style={{ stopColor: "hsl(var(--muted-foreground))", stopOpacity: 0.35 }} />
              <stop offset="100%" style={{ stopColor: "hsl(var(--accent))", stopOpacity: 0.9 }} />
            </linearGradient>

            <linearGradient id="flowGradNeutral" x1="40" y1="110" x2="270" y2="140" gradientUnits="userSpaceOnUse">
              <stop offset="0%" style={{ stopColor: "hsl(var(--muted-foreground))", stopOpacity: 0.3 }} />
              <stop offset="100%" style={{ stopColor: "hsl(var(--border-strong))", stopOpacity: 0.9 }} />
            </linearGradient>

            <linearGradient id="outGrad" x1="270" y1="140" x2="500" y2="140" gradientUnits="userSpaceOnUse">
              <stop offset="0%" style={{ stopColor: "hsl(var(--accent))", stopOpacity: 0.9 }} />
              <stop offset="100%" style={{ stopColor: "hsl(var(--accent))", stopOpacity: 0.5 }} />
            </linearGradient>
          </defs>

          <g transform="translate(40, 50)">
            <circle cx="0" cy="0" r="14" className="fill-card stroke-accent/60" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="3" className="fill-accent" />
            <text x="22" y="4" className="fill-muted-foreground" fontSize="10" fontFamily="monospace" fontWeight="500">
              PDF / Docs (Unstructured)
            </text>
          </g>

          <g transform="translate(40, 110)">
            <circle cx="0" cy="0" r="14" className="fill-card stroke-border-strong" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="3" className="fill-foreground" />
            <text x="22" y="4" className="fill-muted-foreground" fontSize="10" fontFamily="monospace" fontWeight="500">
              Company Knowledge Bases
            </text>
          </g>

          <g transform="translate(40, 170)">
            <circle cx="0" cy="0" r="14" className="fill-card stroke-border-strong" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="3" className="fill-foreground" />
            <text x="22" y="4" className="fill-muted-foreground" fontSize="10" fontFamily="monospace" fontWeight="500">
              Live Web &amp; API Feeds
            </text>
          </g>

          <g transform="translate(40, 230)">
            <circle cx="0" cy="0" r="14" className="fill-card stroke-accent/60" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="3" className="fill-accent" />
            <text x="22" y="4" className="fill-muted-foreground" fontSize="10" fontFamily="monospace" fontWeight="500">
              Operating Directives
            </text>
          </g>

          <path
            d="M 54 50 C 140 50, 190 140, 260 140"
            stroke="url(#flowGradAccent)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="motion-safe:animate-[dash_12s_linear_infinite]"
          />
          <path d="M 54 110 C 140 110, 200 140, 260 140" stroke="url(#flowGradNeutral)" strokeWidth="1.5" />
          <path d="M 54 170 C 140 170, 200 140, 260 140" stroke="url(#flowGradNeutral)" strokeWidth="1.5" />
          <path
            d="M 54 230 C 140 230, 190 140, 260 140"
            stroke="url(#flowGradAccent)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="motion-safe:animate-[dash_12s_linear_infinite]"
          />

          <g transform="translate(270, 140)">
            <circle cx="0" cy="0" r="28" className="fill-background stroke-border" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="12" className="fill-card stroke-accent" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="4" className="fill-accent" />

            <text
              x="0"
              y="-36"
              className="fill-foreground"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
              textAnchor="middle"
              letterSpacing="0.05em"
            >
              WEIR CORE
            </text>
            <text x="0" y="44" className="fill-muted-foreground" fontSize="8" fontFamily="monospace" textAnchor="middle">
              1536-dim Jina v4 &bull; Copilot
            </text>
          </g>

          <path d="M 298 140 L 450 140" stroke="url(#outGrad)" strokeWidth="2.5" />

          <g transform="translate(460, 140)">
            <rect x="-10" y="-22" width="80" height="44" rx="8" className="fill-card stroke-accent/70" strokeWidth="1.5" />
            <text x="30" y="-4" className="fill-foreground" fontSize="10" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle">
              Verified
            </text>
            <text x="30" y="10" className="fill-muted-foreground" fontSize="8" fontFamily="monospace" textAnchor="middle">
              Cited Answer
            </text>
          </g>
        </svg>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-6 border-t border-border pt-6 text-xs">
        <div>
          <span className="font-mono font-semibold text-foreground">Precision Filtering</span>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Eliminates hallucination by enforcing cosine similarity cutoffs on vectorized chunks.
          </p>
        </div>
        <div>
          <span className="font-mono font-semibold text-foreground">Contextual Synthesis</span>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Delivers concise, attributed intelligence directly to users and integration channels.
          </p>
        </div>
      </div>
    </div>
  );
}
