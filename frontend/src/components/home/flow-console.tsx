"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileText } from "lucide-react";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { cn } from "@/lib/utils";

export interface FlowScenario {
  id: string;
  source: string;
  question: string;
  answer: string;
  citation: string;
  page: string;
}

interface FlowConsoleLabels {
  live: string;
  sample: string;
  sources: string;
  control: string;
  answer: string;
  checked: string;
  hint: string;
}

interface FlowConsoleProps {
  scenarios: FlowScenario[];
  labels: FlowConsoleLabels;
}

const CYCLE_MS = 5600;

export function FlowConsole({ scenarios, labels }: FlowConsoleProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (paused || reduceMotion || hasInteracted || scenarios.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % scenarios.length);
    }, CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [paused, reduceMotion, hasInteracted, scenarios.length]);

  const active = scenarios[activeIndex] ?? scenarios[0];

  const select = (index: number) => {
    setActiveIndex(index);
    setHasInteracted(true);
  };

  return (
    <div
      ref={panelRef}
      className="flow-panel on-onyx p-4 sm:p-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        aria-hidden="true"
        className="onyx-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 top-1/4 h-56 w-56 rounded-full bg-primary/20 blur-3xl"
      />

      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.12em] text-white/60 min-[380px]:text-[10px] min-[380px]:tracking-[0.18em]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 rounded-full bg-volt/60 motion-safe:animate-ping" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-volt" />
            </span>
            {labels.live}
          </span>
          <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/55 min-[380px]:inline-flex">
            {labels.sample}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
          {scenarios.map((scenario, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => select(index)}
                aria-pressed={isActive}
                className={cn(
                  "group flex min-h-10 items-center gap-2 rounded-lg border px-2.5 py-2 text-start text-[11px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt/70 focus-visible:ring-offset-2 focus-visible:ring-offset-onyx",
                  isActive
                    ? "border-volt/40 bg-white/[0.07] text-white"
                    : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20 hover:text-white"
                )}
              >
                <FileText
                  className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-volt" : "text-white/50")}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{scenario.source}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    isActive ? "bg-volt" : "bg-white/30"
                  )}
                />
              </button>
            );
          })}
        </div>

        <svg
          aria-hidden="true"
          viewBox="0 0 400 72"
          preserveAspectRatio="none"
          className="mt-1 h-14 w-full"
        >
          <defs>
            <linearGradient id="flow-console-line" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity="0.16" />
              <stop offset="100%" stopColor="hsl(var(--volt))" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          {[50, 150, 250, 350].map((x, index) => (
            <path
              key={x}
              d={`M ${x} 0 C ${x} 38, 200 34, 200 72`}
              fill="none"
              stroke="url(#flow-console-line)"
              strokeWidth="1"
              className={cn(
                "motion-safe:animate-trace",
                index === activeIndex % 4 ? "opacity-100" : "opacity-30"
              )}
              style={{ animationDelay: `${index * 0.4}s`, animationDuration: "6s" }}
            />
          ))}
        </svg>

        <div className="-mt-5 flex justify-center">
          <div className="relative grid h-[72px] w-[72px] place-items-center">
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border border-volt/20 bg-volt/[0.06] motion-safe:animate-soft-pulse"
            />
            <span
              aria-hidden="true"
              className="absolute inset-[-9px] rounded-full border border-dashed border-white/10 motion-safe:animate-orbit"
            />
            <span
              aria-hidden="true"
              className="absolute inset-2 rounded-full border border-volt/25"
            />
            <WeirwiseSymbol className="relative h-6 w-auto" surface="dark" />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-center gap-1.5 text-[9px] uppercase tracking-[0.16em] text-white/50">
          <span>{labels.sources}</span>
          <span aria-hidden="true">/</span>
          <span className="text-volt/70">{labels.control}</span>
          <span aria-hidden="true">/</span>
          <span>{labels.answer}</span>
        </div>

        <div
          key={active.id}
          className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-3.5 motion-safe:animate-in"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-white/55">
              {labels.answer}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-volt/25 bg-volt/10 px-1.5 py-0.5 text-[9px] font-medium text-volt">
              <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />
              {labels.checked}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-white/65">{active.question}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-white/90">{active.answer}</p>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] text-white/55">
            <FileText className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0 truncate">{active.citation}</span>
            <span className="ms-auto shrink-0 text-white/50">{active.page}</span>
          </div>
        </div>

        <p className="mt-3 text-center text-[10px] text-white/50">{labels.hint}</p>
      </div>
    </div>
  );
}
