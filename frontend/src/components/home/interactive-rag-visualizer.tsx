"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  Search,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  Database,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Layers,
} from "lucide-react";

interface PromptScenario {
  id: string;
  query: string;
  sourceDoc: string;
  sourceChunk: string;
  similarity: string;
  answer: string;
}

const SCENARIOS: PromptScenario[] = [
  {
    id: "compliance",
    query: "What is our company data retention policy on client exports?",
    sourceDoc: "sec_compliance_policy_v2.pdf",
    sourceChunk: "Section 8.1: Client data export requests require dual cryptographic authorization. All generated archives are purged automatically after 30 days.",
    similarity: "0.942",
    answer: "Client exports require dual cryptographic authorization and are automatically purged after 30 days.",
  },
  {
    id: "sla",
    query: "What is the guaranteed uptime SLA for our enterprise multi-region tier?",
    sourceDoc: "enterprise_service_sla_2026.md",
    sourceChunk: "Schedule B: Enterprise Multi-Region customers receive a 99.99% monthly availability guarantee with automatic failover across designated VPC clusters.",
    similarity: "0.968",
    answer: "Enterprise Multi-Region tier includes a guaranteed 99.99% monthly availability with automated VPC failover.",
  },
  {
    id: "unsupported",
    query: "Can marketing employees issue root cloud API credentials?",
    sourceDoc: "access_control_matrix_q3.pdf",
    sourceChunk: "Section 2.4: Root cloud credentials are strictly restricted to SecOps Leads. Role escalation outside approved tiers is denied and logged to audit trails.",
    similarity: "0.915",
    answer: "No. Root cloud credentials are restricted exclusively to SecOps Leads. Escalations outside this tier are prohibited.",
  },
];

export function InteractiveRagVisualizer() {
  const [selectedScenarioIndex, setSelectedScenarioIndex] = useState(0);
  const [activeStage, setActiveStage] = useState<"ingest" | "embed" | "retrieve" | "generate">("retrieve");
  const [isTyping, setIsTyping] = useState(false);

  const scenario = SCENARIOS[selectedScenarioIndex];

  // Auto-cycle between stages for organic, living demonstration
  useEffect(() => {
    const stageOrder: ("ingest" | "embed" | "retrieve" | "generate")[] = [
      "ingest",
      "embed",
      "retrieve",
      "generate",
    ];
    let currentIdx = stageOrder.indexOf(activeStage);
    const interval = setInterval(() => {
      currentIdx = (currentIdx + 1) % stageOrder.length;
      setActiveStage(stageOrder[currentIdx]);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeStage]);

  const handleSelectScenario = (index: number) => {
    setIsTyping(true);
    setSelectedScenarioIndex(index);
    setActiveStage("retrieve");
    setTimeout(() => setIsTyping(false), 300);
  };

  return (
    <div className="w-full rounded-2xl border border-border bg-card/90 shadow-xl backdrop-blur-md overflow-hidden transition-all duration-300">
      {/* 1. Header: Interactive Scenario Picker (Like Gemini prompt chips) */}
      <div className="px-4 py-3 border-b border-border/80 bg-card flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Cpu className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-semibold text-foreground tracking-tight">
            Live Grounded Orchestrator
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Verified Truth
          </span>
        </div>

        {/* Question Selector Chips */}
        <div className="flex items-center gap-1.5">
          {SCENARIOS.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelectScenario(idx)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                selectedScenarioIndex === idx
                  ? "bg-secondary text-primary font-semibold border border-primary/30 shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              Prompt {idx + 1}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Interactive Pipeline Stages Breadcrumbs */}
      <div className="px-4 py-2 border-b border-border/60 bg-background/50 flex items-center justify-between text-[11px] font-mono">
        <button
          type="button"
          onClick={() => setActiveStage("ingest")}
          className={`flex items-center gap-1.5 transition-colors ${
            activeStage === "ingest" ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">1. Chunk</span>
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30" />

        <button
          type="button"
          onClick={() => setActiveStage("embed")}
          className={`flex items-center gap-1.5 transition-colors ${
            activeStage === "embed" ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Database className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">2. Vectorize</span>
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30" />

        <button
          type="button"
          onClick={() => setActiveStage("retrieve")}
          className={`flex items-center gap-1.5 transition-colors ${
            activeStage === "retrieve" ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">3. Match (Cosine)</span>
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30" />

        <button
          type="button"
          onClick={() => setActiveStage("generate")}
          className={`flex items-center gap-1.5 transition-colors ${
            activeStage === "generate" ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">4. Grounded Output</span>
        </button>
      </div>

      {/* 3. The Visual Interactive Canvas */}
      <div className="p-4 sm:p-5 space-y-3.5 font-sans">
        {/* User Prompt Bubble */}
        <div className="rounded-xl bg-secondary/50 p-3 border border-border/60 transition-all">
          <div className="text-[10px] font-mono text-muted-foreground mb-1 flex items-center justify-between">
            <span className="uppercase tracking-wider">Natural Language Query</span>
            <span className="text-[10px] text-primary font-mono">1536-dim vector</span>
          </div>
          <div className="text-xs sm:text-sm text-foreground font-medium flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span>&quot;{scenario.query}&quot;</span>
          </div>
        </div>

        {/* Dynamic Interactive Stage Inspector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 font-mono text-xs">
          {/* Retrieved Knowledge Source */}
          <div className="rounded-xl border border-border/80 bg-background/60 p-3.5 space-y-2 relative overflow-hidden group">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground uppercase tracking-wider font-sans font-semibold">
                Cited Knowledge Source
              </span>
              <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5 font-mono font-bold">
                sim: {scenario.similarity}
              </span>
            </div>

            <div className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span className="truncate">{scenario.sourceDoc}</span>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed pl-2.5 border-l-2 border-primary/60 font-sans italic">
              &quot;{scenario.sourceChunk}&quot;
            </p>
          </div>

          {/* Synthesized Grounded Response */}
          <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-primary uppercase tracking-wider font-sans font-semibold flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Grounded Assistant
              </span>
              <span className="text-[9px] rounded bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 font-semibold">
                Zero Hallucination
              </span>
            </div>

            <p className="text-xs text-foreground font-sans leading-relaxed">
              {scenario.answer}
            </p>

            <div className="pt-1.5 border-t border-border/40 text-[10px] text-muted-foreground flex items-center justify-between font-sans">
              <span>Cryptographic hash validated</span>
              <span className="text-primary font-mono font-semibold">Attributed 100%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
