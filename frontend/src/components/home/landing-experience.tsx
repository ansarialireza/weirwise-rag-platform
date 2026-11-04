"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { SignalFlow, SignalDot } from "@/components/brand/signal-flow";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  Globe2,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export function LandingExperience() {
  const { dict } = useI18n();
  const [mode, setMode] = useState<"answer" | "search">("answer");

  const steps = [
    {
      icon: Database,
      title: dict.landing.step1Title,
      description: dict.landing.step1Desc,
    },
    {
      icon: Bot,
      title: dict.landing.step2Title,
      description: dict.landing.step2Desc,
    },
    {
      icon: MessageSquare,
      title: dict.landing.step3Title,
      description: dict.landing.step3Desc,
    },
    {
      icon: Globe2,
      title: dict.landing.step4Title,
      description: dict.landing.step4Desc,
    },
  ];

  const features = [
    {
      icon: CheckCircle2,
      title: dict.landing.feature1Title,
      description: dict.landing.feature1Desc,
    },
    {
      icon: Search,
      title: dict.landing.feature2Title,
      description: dict.landing.feature2Desc,
    },
    {
      icon: ShieldCheck,
      title: dict.landing.feature3Title,
      description: dict.landing.feature3Desc,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 dot-grid opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]"
          />
          <div className="relative mx-auto flex w-full max-w-content flex-col items-center px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-20 lg:px-10 lg:pt-24">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              <SignalDot />
              {dict.landing.badge}
            </span>

            <h1 className="mt-6 max-w-3xl text-[2.35rem] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground sm:text-6xl lg:text-[4.25rem]">
              {dict.landing.heroHeadline1}{" "}
              <span className="text-muted-foreground">{dict.landing.heroHeadline2}</span>
            </h1>

            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              {dict.landing.heroSubhead}
            </p>

            <div className="mt-8 flex w-full flex-col items-center justify-center gap-2.5 sm:w-auto sm:flex-row">
              <Link
                href="/register"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto"
              >
                {dict.landing.primaryCta}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 sm:w-auto"
              >
                {dict.landing.secondaryCta}
              </Link>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Free to start · No credit card required
            </p>

            {/* Product preview */}
            <div className="relative mt-14 w-full max-w-3xl text-start">
              <div className="absolute -inset-x-6 -top-8 bottom-10 -z-10 rounded-[2.5rem] bg-gradient-to-b from-accent/[0.07] to-transparent blur-2xl" />

              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
                <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      <WeirwiseSymbol className="h-5 w-auto" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span className="truncate">{dict.landing.previewTitle}</span>
                        <SignalDot />
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {dict.landing.previewSubtitle}
                      </div>
                    </div>
                  </div>

                  <div
                    role="group"
                    aria-label="Answer mode"
                    className="flex shrink-0 items-center rounded-lg bg-muted/70 p-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => setMode("answer")}
                      aria-pressed={mode === "answer"}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                        mode === "answer"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Sparkles className="h-3 w-3" />
                      <span className="hidden sm:inline">{dict.landing.previewModeAnswer}</span>
                      <span className="sm:hidden">AI</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("search")}
                      aria-pressed={mode === "search"}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                        mode === "search"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Search className="h-3 w-3" />
                      {dict.landing.previewModeSearch}
                    </button>
                  </div>
                </div>

                <div className="space-y-4 px-4 py-5 sm:px-6 sm:py-6">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-ee-md bg-primary px-4 py-2.5 text-[13px] leading-relaxed text-primary-foreground">
                      {dict.landing.previewQuestion}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
                      <WeirwiseSymbol className="h-4 w-auto" />
                    </div>

                    {mode === "answer" ? (
                      <div className="max-w-[85%] space-y-3">
                        <div className="rounded-2xl rounded-es-md border border-border/70 bg-background px-4 py-3 text-[13px] leading-relaxed text-foreground">
                          {dict.landing.previewAnswer}
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground">
                          <FileText className="h-3.5 w-3.5 text-accent" />
                          {dict.landing.previewCitation}
                          <CheckCircle2 className="h-3 w-3 text-success" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full max-w-[85%] space-y-2">
                        {[2, 6].map((page, index) => (
                          <div
                            key={page}
                            className="rounded-xl border border-border/70 bg-background px-3.5 py-2.5"
                          >
                            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-accent">
                              <FileText className="h-3 w-3" />
                              Refund policy · Page {page}
                            </div>
                            <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                              {dict.landing.previewAnswer}
                            </p>
                            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-accent/60"
                                style={{ width: index === 0 ? "86%" : "61%" }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-border/70 bg-background/60 px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    <span>Ask a follow-up…</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Journey */}
        <section
          id="how-it-works"
          className="scroll-mt-20 border-t border-border/60 bg-card/40"
        >
          <div className="mx-auto w-full max-w-content px-4 py-16 sm:px-6 sm:py-20 lg:px-10">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {dict.landing.journeyTitle}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{dict.landing.journeySubtitle}</p>
            </div>

            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li
                    key={step.title}
                    className="relative rounded-xl border border-border bg-card p-5 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">
                        0{index + 1}
                      </span>
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-foreground">{step.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border/60">
          <div className="mx-auto w-full max-w-content px-4 py-16 sm:px-6 sm:py-20 lg:px-10">
            <div className="grid gap-4 md:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="rounded-xl border border-border bg-card p-6 shadow-sm"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                      <Icon className="h-[18px] w-[18px]" />
                    </div>
                    <h3 className="mt-4 text-[15px] font-semibold text-foreground">
                      {feature.title}
                    </h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-border/60">
          <div className="mx-auto w-full max-w-content px-4 py-16 sm:px-6 lg:px-10">
            <div className="relative overflow-hidden rounded-2xl bg-onyx px-6 py-12 text-center sm:px-12 sm:py-16">
              <SignalFlow
                className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto max-w-2xl -translate-y-1/2 opacity-40"
                variant="wide"
              />
              <div className="relative">
                <h2 className="mx-auto max-w-xl text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  {dict.landing.ctaHeadline}
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
                  {dict.landing.ctaSubtitle}
                </p>
                <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
                  <Link
                    href="/register"
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-signal-foreground transition-[filter] hover:brightness-95 sm:w-auto"
                  >
                    {dict.landing.ctaButton}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/15 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5 sm:w-auto"
                  >
                    {dict.common.signIn}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-6">
        <div className="mx-auto flex w-full max-w-content flex-col items-center justify-between gap-4 px-4 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-10">
          <div className="flex items-center gap-2">
            <WeirwiseSymbol className="h-4 w-auto" />
            <span className="font-semibold text-foreground">{dict.common.brand}</span>
            <span>{dict.landing.copyright}</span>
          </div>

          <div className="flex items-center gap-5">
            <Link href="/pricing" className="transition-colors hover:text-foreground">
              {dict.common.pricing}
            </Link>
            <Link href="/blog" className="transition-colors hover:text-foreground">
              {dict.common.blog}
            </Link>
            <Link href="/login" className="transition-colors hover:text-foreground">
              {dict.common.signIn}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
