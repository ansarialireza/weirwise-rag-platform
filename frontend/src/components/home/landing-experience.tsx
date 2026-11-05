"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { FlowConsole, type FlowScenario } from "@/components/home/flow-console";
import { SignalFlow, SignalDot } from "@/components/brand/signal-flow";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  FileText,
  Globe2,
  Lock,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export function LandingExperience() {
  const { dict } = useI18n();
  const [proofMode, setProofMode] = useState<"answer" | "source">("answer");

  const scenarios: FlowScenario[] = [
    {
      id: "refunds",
      source: dict.landing.demo1Source,
      question: dict.landing.demo1Question,
      answer: dict.landing.demo1Answer,
      citation: dict.landing.demo1Citation,
      page: dict.landing.demo1Page,
    },
    {
      id: "security",
      source: dict.landing.demo2Source,
      question: dict.landing.demo2Question,
      answer: dict.landing.demo2Answer,
      citation: dict.landing.demo2Citation,
      page: dict.landing.demo2Page,
    },
    {
      id: "admin",
      source: dict.landing.demo3Source,
      question: dict.landing.demo3Question,
      answer: dict.landing.demo3Answer,
      citation: dict.landing.demo3Citation,
      page: dict.landing.demo3Page,
    },
    {
      id: "handbook",
      source: dict.landing.demo4Source,
      question: dict.landing.demo4Question,
      answer: dict.landing.demo4Answer,
      citation: dict.landing.demo4Citation,
      page: dict.landing.demo4Page,
    },
  ];

  const path = [
    { title: dict.landing.path1Title, description: dict.landing.path1Desc, icon: FileText },
    { title: dict.landing.path2Title, description: dict.landing.path2Desc, icon: Bot },
    { title: dict.landing.path3Title, description: dict.landing.path3Desc, icon: Search },
    { title: dict.landing.path4Title, description: dict.landing.path4Desc, icon: Globe2 },
  ];

  const controls = [
    { title: dict.landing.control1Title, description: dict.landing.control1Desc, icon: Lock },
    { title: dict.landing.control2Title, description: dict.landing.control2Desc, icon: Search },
    { title: dict.landing.control3Title, description: dict.landing.control3Desc, icon: Globe2 },
  ];

  const useCases = [
    {
      label: dict.landing.useCase1Label,
      question: dict.landing.useCase1Question,
      source: dict.landing.useCase1Source,
    },
    {
      label: dict.landing.useCase2Label,
      question: dict.landing.useCase2Question,
      source: dict.landing.useCase2Source,
    },
    {
      label: dict.landing.useCase3Label,
      question: dict.landing.useCase3Question,
      source: dict.landing.useCase3Source,
    },
    {
      label: dict.landing.useCase4Label,
      question: dict.landing.useCase4Question,
      source: dict.landing.useCase4Source,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <SiteHeader />

      <main id="main-content" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/60">
          <div
            aria-hidden="true"
            className="dot-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_75%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-40 top-0 h-[32rem] w-[32rem] rounded-full bg-primary/[0.07] blur-3xl"
          />

          <div className="relative mx-auto grid w-full max-w-wide gap-12 px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-14 lg:px-10 lg:pb-24 lg:pt-20">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {dict.landing.heroEyebrow}
              </span>

              <h1 className="mt-6 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] text-foreground sm:text-6xl lg:text-[4.1rem]">
                {dict.landing.heroHeadline1}{" "}
                <span className="lime-underline text-foreground">{dict.landing.heroHeadline2}</span>
              </h1>

              <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-[17px]">
                {dict.landing.heroSubhead}
              </p>

              <div className="mt-8 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center">
                <Link
                  href="/register"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto"
                >
                  {dict.landing.primaryCta}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </Link>
                <Link
                  href="#the-path"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 sm:w-auto"
                >
                  {dict.landing.secondaryCta}
                </Link>
              </div>

              <p className="mt-4 text-xs text-muted-foreground">{dict.landing.heroNote}</p>

              <dl className="mt-8 grid max-w-md grid-cols-3 gap-4 border-t border-border/70 pt-5">
                {[
                  { value: dict.landing.stat1Value, label: dict.landing.stat1Label },
                  { value: dict.landing.stat2Value, label: dict.landing.stat2Label },
                  { value: dict.landing.stat3Value, label: dict.landing.stat3Label },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="text-[11px] text-muted-foreground">{stat.label}</dt>
                    <dd className="mt-1 text-sm font-semibold tracking-tight text-foreground">
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div id="flow" className="relative lg:pl-4">
              <div
                aria-hidden="true"
                className="absolute -inset-3 -z-10 rounded-[2rem] bg-primary/[0.06] blur-2xl"
              />
              <FlowConsole
                scenarios={scenarios}
                labels={{
                  live: dict.landing.consoleLive,
                  sample: dict.landing.consoleSample,
                  sources: dict.landing.consoleSources,
                  control: dict.landing.consoleControl,
                  answer: dict.landing.consoleAnswer,
                  checked: dict.landing.consoleChecked,
                  hint: dict.landing.consoleHint,
                }}
              />
            </div>
          </div>
        </section>

        {/* The path */}
        <section id="the-path" className="scroll-mt-20 border-b border-border/60">
          <div className="mx-auto w-full max-w-wide px-4 py-16 sm:px-6 sm:py-20 lg:px-10">
            <div className="max-w-2xl">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent-strong">
                {dict.landing.pathEyebrow}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-foreground sm:text-[2.5rem] sm:leading-[1.1]">
                {dict.landing.pathTitle}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {dict.landing.pathSubtitle}
              </p>
            </div>

            <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              {path.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li key={step.title} className="relative">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                        0{index + 1}
                      </span>
                      <span aria-hidden="true" className="hidden h-px flex-1 bg-border lg:block" />
                    </div>
                    <h3 className="mt-4 text-[15px] font-semibold text-foreground">{step.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Evidence */}
        <section className="border-b border-border/60 bg-card/40">
          <div className="mx-auto grid w-full max-w-wide gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-10">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent-strong">
                {dict.landing.proofEyebrow}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-foreground sm:text-[2.5rem] sm:leading-[1.1]">
                {dict.landing.proofTitle}
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
                {dict.landing.proofBody}
              </p>

              <ul className="mt-7 space-y-3">
                {[dict.landing.proofPoint1, dict.landing.proofPoint2, dict.landing.proofPoint3].map(
                  (point) => (
                    <li key={point} className="flex items-start gap-3 text-[13px] text-foreground">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-volt text-volt-foreground">
                        <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                      </span>
                      {point}
                    </li>
                  )
                )}
              </ul>
            </div>

            <div className="relative">
              <div className="surface overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-onyx">
                      <WeirwiseSymbol className="h-4 w-auto" surface="dark" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
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
                    aria-label={dict.landing.proofToggleLabel}
                    className="flex shrink-0 items-center rounded-lg bg-muted p-0.5"
                  >
                    {[
                      { id: "answer" as const, label: dict.landing.proofToggleAnswer },
                      { id: "source" as const, label: dict.landing.proofToggleSource },
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setProofMode(option.id)}
                        aria-pressed={proofMode === option.id}
                        className={cn(
                          "inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium transition-colors",
                          proofMode === option.id
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 px-4 py-5 sm:px-6 sm:py-6">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-xl rounded-ee-sm bg-primary px-3.5 py-2.5 text-[12.5px] leading-relaxed text-primary-foreground">
                      {dict.landing.proofQuestion}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                      <WeirwiseSymbol className="h-3.5 w-auto" />
                    </span>

                    {proofMode === "answer" ? (
                      <div className="max-w-[88%] space-y-2.5">
                        <div className="rounded-xl rounded-es-sm border border-border/70 bg-background px-3.5 py-3 text-[12.5px] leading-relaxed text-foreground">
                          {dict.landing.proofAnswer}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-volt px-2 py-1 text-[10px] font-semibold text-volt-foreground">
                            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                            {dict.landing.proofVerified}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground">
                            <FileText className="h-3 w-3 text-primary" aria-hidden="true" />
                            {dict.landing.proofCaption}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full max-w-[88%] rounded-xl border border-border/70 bg-background p-3.5">
                        <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          <span>{dict.landing.proofSourceLabel}</span>
                          <span>{dict.landing.proofCaption}</span>
                        </div>
                        <p className="mt-2.5 border-s-2 border-primary ps-3 text-[12.5px] leading-relaxed text-foreground">
                          {dict.landing.proofPassage}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Control */}
        <section className="border-b border-border/60">
          <div className="mx-auto w-full max-w-wide px-4 py-16 sm:px-6 sm:py-20 lg:px-10">
            <div className="max-w-2xl">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent-strong">
                {dict.landing.controlEyebrow}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-foreground sm:text-[2.5rem] sm:leading-[1.1]">
                {dict.landing.controlTitle}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {dict.landing.controlSubtitle}
              </p>
            </div>

            <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
              {controls.map((control, index) => {
                const Icon = control.icon;
                return (
                  <div key={control.title} className="bg-card p-6">
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        0{index + 1}
                      </span>
                    </div>
                    <h3 className="mt-5 text-[15px] font-semibold text-foreground">
                      {control.title}
                    </h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      {control.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="border-b border-border/60 bg-card/40">
          <div className="mx-auto w-full max-w-wide px-4 py-16 sm:px-6 sm:py-20 lg:px-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xl">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent-strong">
                  {dict.landing.useCasesEyebrow}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-foreground sm:text-[2.5rem] sm:leading-[1.1]">
                  {dict.landing.useCasesTitle}
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                {dict.landing.useCasesSubtitle}
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {useCases.map((useCase) => (
                <div
                  key={useCase.label}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-border-strong/40"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {useCase.label}
                    </span>
                  </div>
                  <p className="mt-3 text-[15px] font-medium leading-snug text-foreground">
                    “{useCase.question}”
                  </p>
                  <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {useCase.source}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section>
          <div className="mx-auto w-full max-w-wide px-4 py-16 sm:px-6 lg:px-10">
            <div className="on-onyx relative overflow-hidden rounded-2xl bg-onyx px-6 py-14 text-center sm:px-12 sm:py-20">
              <div
                aria-hidden="true"
                className="onyx-grid pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]"
              />
              <SignalFlow
                className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto max-w-3xl -translate-y-1/2 opacity-25"
                variant="wide"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(9,10,12,0.92)_20%,rgba(9,10,12,0.45)_58%,transparent_78%)]"
              />
              <div className="relative mx-auto max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-volt" aria-hidden="true" />
                  {dict.landing.ctaEyebrow}
                </span>
                <h2 className="mt-5 text-3xl font-semibold tracking-[-0.025em] text-white sm:text-[2.75rem] sm:leading-[1.05]">
                  {dict.landing.ctaHeadline}
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-white/60">
                  {dict.landing.ctaSubtitle}
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
                  <Link
                    href="/register"
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-volt px-5 text-sm font-semibold text-volt-foreground transition-[filter] hover:brightness-95 sm:w-auto"
                  >
                    {dict.landing.ctaButton}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-white/15 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5 sm:w-auto"
                  >
                    {dict.common.signIn}
                  </Link>
                </div>
                <p className="mt-5 text-[11px] text-white/35">{dict.landing.ctaNote}</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto grid w-full max-w-wide gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-10">
          <div>
            <div className="flex items-center gap-2.5">
              <WeirwiseSymbol className="h-7 w-auto" />
              <span className="text-[15px] font-semibold tracking-tight text-foreground">
                {dict.common.brand}
              </span>
            </div>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              {dict.landing.footerTagline}
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
              {dict.landing.footerStatus}
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {dict.landing.footerProduct}
            </h3>
            <ul className="mt-3 space-y-2 text-[13px]">
              <li>
                <Link href="/#the-path" className="text-foreground/80 hover:text-foreground">
                  {dict.landing.footerHowItWorks}
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-foreground/80 hover:text-foreground">
                  {dict.common.pricing}
                </Link>
              </li>
              <li>
                <Link href="/register" className="text-foreground/80 hover:text-foreground">
                  {dict.landing.primaryCta}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {dict.landing.footerResources}
            </h3>
            <ul className="mt-3 space-y-2 text-[13px]">
              <li>
                <Link href="/blog" className="text-foreground/80 hover:text-foreground">
                  {dict.common.blog}
                </Link>
              </li>
              <li>
                <Link href="/#the-path" className="text-foreground/80 hover:text-foreground">
                  {dict.landing.footerGuide}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {dict.landing.footerAccount}
            </h3>
            <ul className="mt-3 space-y-2 text-[13px]">
              <li>
                <Link href="/login" className="text-foreground/80 hover:text-foreground">
                  {dict.common.signIn}
                </Link>
              </li>
              <li>
                <Link href="/register" className="text-foreground/80 hover:text-foreground">
                  {dict.common.register}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/60">
          <div className="mx-auto flex w-full max-w-wide flex-col items-center justify-between gap-3 px-4 py-5 text-[11px] text-muted-foreground sm:flex-row sm:px-6 lg:px-10">
            <span>{dict.landing.copyright}</span>
            <span>{dict.landing.footerNote}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
