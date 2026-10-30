"use client";

import React from "react";

export function IntelligentFlowGraphic() {
  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden select-none bg-[#090A0C] text-neutral-200">
      {/* Background ambient radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#CCFF00]/[0.04] rounded-full blur-3xl pointer-events-none" />

      {/* Top Header: Architecture Badge */}
      <div className="relative z-10 space-y-1">
        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-[#12151A]/80 backdrop-blur-md px-3 py-1 text-[11px] font-mono text-neutral-400 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#CCFF00] animate-pulse" />
          <span>Intelligent Flow Control &bull; RAG Synthesis</span>
        </div>
        <p className="text-xs text-neutral-400 pt-1">
          Scattered unstructured corporate knowledge routed and synthesized into verified grounded answers.
        </p>
      </div>

      {/* Centerpiece SVG Flow Composition */}
      <div className="relative z-10 w-full max-w-lg mx-auto py-8">
        <svg
          viewBox="0 0 540 280"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto drop-shadow-sm"
        >
          <defs>
            {/* Gradients for converging lines */}
            <linearGradient id="flowGrad1" x1="40" y1="50" x2="270" y2="140" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#334155" stopOpacity="0.4" />
              <stop offset="60%" stopColor="#CCFF00" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#CCFF00" stopOpacity="1" />
            </linearGradient>

            <linearGradient id="flowGrad2" x1="40" y1="110" x2="270" y2="140" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#334155" stopOpacity="0.4" />
              <stop offset="70%" stopColor="#CCFF00" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#CCFF00" stopOpacity="1" />
            </linearGradient>

            <linearGradient id="flowGrad3" x1="40" y1="170" x2="270" y2="140" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#334155" stopOpacity="0.4" />
              <stop offset="70%" stopColor="#CCFF00" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#CCFF00" stopOpacity="1" />
            </linearGradient>

            <linearGradient id="flowGrad4" x1="40" y1="230" x2="270" y2="140" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#334155" stopOpacity="0.4" />
              <stop offset="60%" stopColor="#CCFF00" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#CCFF00" stopOpacity="1" />
            </linearGradient>

            <linearGradient id="outGrad" x1="270" y1="140" x2="500" y2="140" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#CCFF00" stopOpacity="1" />
              <stop offset="100%" stopColor="#CCFF00" stopOpacity="0.2" />
            </linearGradient>

            {/* Glowing filter */}
            <filter id="coreGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Left Ingestion Source Nodes */}
          {/* Node 1: PDF Documents */}
          <g transform="translate(40, 50)">
            <circle cx="0" cy="0" r="14" fill="#12151A" stroke="#262D3D" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="3" fill="#64748B" />
            <text x="22" y="4" fill="#94A3B8" fontSize="10" fontFamily="monospace" fontWeight="500">
              PDF / Docs (Unstructured)
            </text>
          </g>

          {/* Node 2: Database / SQL */}
          <g transform="translate(40, 110)">
            <circle cx="0" cy="0" r="14" fill="#12151A" stroke="#262D3D" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="3" fill="#64748B" />
            <text x="22" y="4" fill="#94A3B8" fontSize="10" fontFamily="monospace" fontWeight="500">
              Company Knowledge Bases
            </text>
          </g>

          {/* Node 3: Web Crawls / URLs */}
          <g transform="translate(40, 170)">
            <circle cx="0" cy="0" r="14" fill="#12151A" stroke="#262D3D" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="3" fill="#64748B" />
            <text x="22" y="4" fill="#94A3B8" fontSize="10" fontFamily="monospace" fontWeight="500">
              Live Web &amp; API Feeds
            </text>
          </g>

          {/* Node 4: Policy Manuals */}
          <g transform="translate(40, 230)">
            <circle cx="0" cy="0" r="14" fill="#12151A" stroke="#262D3D" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="3" fill="#64748B" />
            <text x="22" y="4" fill="#94A3B8" fontSize="10" fontFamily="monospace" fontWeight="500">
              Operating Directives
            </text>
          </g>

          {/* Flow Paths to Weirwise Convergence Core */}
          <path
            d="M 54 50 C 140 50, 190 140, 260 140"
            stroke="url(#flowGrad1)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="motion-safe:animate-[dash_12s_linear_infinite]"
          />
          <path
            d="M 54 110 C 140 110, 200 140, 260 140"
            stroke="url(#flowGrad2)"
            strokeWidth="1.5"
          />
          <path
            d="M 54 170 C 140 170, 200 140, 260 140"
            stroke="url(#flowGrad3)"
            strokeWidth="1.5"
          />
          <path
            d="M 54 230 C 140 230, 190 140, 260 140"
            stroke="url(#flowGrad4)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="motion-safe:animate-[dash_12s_linear_infinite]"
          />

          {/* Central Intelligent Weir Routing Node */}
          <g transform="translate(270, 140)">
            {/* Outer precision ring */}
            <circle cx="0" cy="0" r="28" fill="#090A0C" stroke="#262D3D" strokeWidth="1.5" />
            {/* Energy halo */}
            <circle cx="0" cy="0" r="20" fill="#CCFF00" fillOpacity="0.08" filter="url(#coreGlow)" />
            {/* Inner core */}
            <circle cx="0" cy="0" r="12" fill="#12151A" stroke="#CCFF00" strokeWidth="2" />
            <circle cx="0" cy="0" r="4" fill="#CCFF00" />
            
            {/* Weir badge labels */}
            <text x="0" y="-36" fill="#CCFF00" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle" letterSpacing="0.05em">
              WEIR CORE
            </text>
            <text x="0" y="44" fill="#64748B" fontSize="8" fontFamily="monospace" textAnchor="middle">
              1536-dim Jina v4
            </text>
          </g>

          {/* Synthesized Output Path */}
          <path
            d="M 298 140 L 450 140"
            stroke="url(#outGrad)"
            strokeWidth="2.5"
          />

          {/* Right Grounded Answer Node */}
          <g transform="translate(460, 140)">
            <rect x="-10" y="-22" width="80" height="44" rx="8" fill="#12151A" stroke="#CCFF00" strokeWidth="1.5" strokeOpacity="0.6" />
            <text x="30" y="-4" fill="#F8FAFC" fontSize="10" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle">
              Verified
            </text>
            <text x="30" y="10" fill="#CCFF00" fontSize="8" fontFamily="monospace" textAnchor="middle">
              Cited Answer
            </text>
          </g>
        </svg>
      </div>

      {/* Bottom Technical Principles */}
      <div className="relative z-10 grid grid-cols-2 gap-6 pt-6 border-t border-neutral-800/80 text-xs">
        <div>
          <span className="font-semibold text-neutral-200 font-mono">Precision Filtering</span>
          <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
            Eliminates hallucination by enforcing cosine similarity cutoffs on vectorized chunks.
          </p>
        </div>
        <div>
          <span className="font-semibold text-neutral-200 font-mono">Contextual Synthesis</span>
          <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
            Delivers concise, attributed intelligence directly to users and integration channels.
          </p>
        </div>
      </div>
    </div>
  );
}
