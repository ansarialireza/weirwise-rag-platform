"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { LivingFlow } from "@/components/brand/living-flow";
import { FlowConsole, type FlowScenario } from "@/components/home/flow-console";
import { ArrowRight, Bot, Check, FileText, Globe2, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatNumber } from "@/lib/i18n/format";

export function LandingExperience() {
  const { dict, locale } = useI18n();

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

  const proofPoints = [
    dict.landing.proofPoint1,
    dict.landing.proofPoint2,
    dict.landing.proofPoint3,
    dict.landing.proofPoint4,
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main id="main-content" className="flex-1">
        {/* Hero. The flow is the subject and the words are its caption, so the
            visual keeps the larger share of the row and nothing competes with
            it: no badge, no stat strip, no second picture. */}
        <section className="relative border-b border-border/60">
          <div className="mx-auto grid w-full max-w-wide items-center gap-y-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-x-8 lg:px-10">
            <LivingFlow className="flow-feather order-1 -mx-4 h-[17rem] sm:-mx-6 sm:h-[22rem] lg:mx-0 lg:order-2 lg:h-[clamp(20rem,32vw,30rem)]" />

            <div className="order-2 max-w-xl lg:order-1">
              <h1 className="hero-display font-semibold text-foreground">
                {dict.landing.heroHeadline}
              </h1>
              <p className="mt-5 max-w-lg text-[15px] text-muted-foreground sm:text-base">
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
                  href="#explore"
                  className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 sm:w-auto"
                >
                  {dict.landing.secondaryCta}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* What it does */}
        <section id="explore" className="scroll-mt-20 border-b border-border/60">
          <div className="mx-auto grid w-full max-w-wide gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:items-center lg:gap-14 lg:px-10">
            <div>
              <p className="eyebrow">{dict.landing.proofEyebrow}</p>
              <h2 className="section-title mt-3 font-semibold text-foreground">
                {dict.landing.proofTitle}
              </h2>
              <p className="mt-4 max-w-lg text-sm text-muted-foreground sm:text-[15px]">
                {dict.landing.proofBody}
              </p>

              <ul className="mt-6 space-y-2.5">
                {proofPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-[13px] text-foreground">
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <FlowConsole
              scenarios={scenarios}
              labels={{
                live: dict.landing.consoleLive,
                sample: dict.landing.consoleSample,
                answer: dict.landing.consoleAnswer,
                checked: dict.landing.consoleChecked,
                hint: dict.landing.consoleHint,
              }}
            />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-b border-border/60">
          <div className="mx-auto w-full max-w-wide px-4 py-14 sm:px-6 sm:py-16 lg:px-10">
            <div className="max-w-2xl">
              <p className="eyebrow">{dict.landing.pathEyebrow}</p>
              <h2 className="section-title mt-3 font-semibold text-foreground">
                {dict.landing.pathTitle}
              </h2>
              <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-[15px]">
                {dict.landing.pathSubtitle}
              </p>
            </div>

            <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              {path.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li key={step.title}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                        {formatNumber(index + 1, locale, { minimumIntegerDigits: 2 })}
                      </span>
                      <span aria-hidden="true" className="hidden h-px flex-1 bg-border lg:block" />
                    </div>
                    <h3 className="mt-4 text-[15px] font-semibold text-foreground">{step.title}</h3>
                    <p className="mt-1.5 text-[13px] text-muted-foreground">{step.description}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* What it solves */}
        <section className="border-b border-border/60 bg-card/40">
          <div className="mx-auto w-full max-w-wide px-4 py-14 sm:px-6 sm:py-16 lg:px-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xl">
                <p className="eyebrow">{dict.landing.useCasesEyebrow}</p>
                <h2 className="section-title mt-3 font-semibold text-foreground">
                  {dict.landing.useCasesTitle}
                </h2>
              </div>
              <p className="max-w-sm text-sm text-muted-foreground">
                {dict.landing.useCasesSubtitle}
              </p>
            </div>

            <dl className="mt-9 grid gap-x-12 gap-y-7 sm:grid-cols-2">
              {useCases.map((useCase) => (
                <div key={useCase.label} className="border-t border-border/70 pt-3">
                  <dt className="label">{useCase.label}</dt>
                  <dd className="mt-1.5 text-[15px] font-medium text-foreground">
                    {useCase.question}
                  </dd>
                  <dd className="mt-1.5 text-[12px] text-muted-foreground">{useCase.source}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Get started */}
        <section>
          <div className="mx-auto w-full max-w-wide px-4 py-14 sm:px-6 lg:px-10">
            <div className="on-onyx relative overflow-hidden rounded-2xl bg-onyx px-6 py-12 text-center sm:px-12 sm:py-16">
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-px bg-flow-signature opacity-70"
              />
              <h2 className="section-title mx-auto max-w-2xl font-semibold text-white">
                {dict.landing.ctaHeadline}
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-sm text-white/60">{dict.landing.ctaSubtitle}</p>
              <Link
                href="/register"
                className="mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-volt px-6 text-sm font-semibold text-volt-foreground transition-[filter] hover:brightness-95 sm:w-auto"
              >
                {dict.landing.primaryCta}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
              <p className="mt-5 text-[11px] text-white/55">{dict.landing.ctaNote}</p>
            </div>
          </div>
        </section>
      </main>

      {/* The header is sticky and already carries the navigation, so the footer
          adds no links and no second logo. */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-wide flex-col items-center justify-between gap-2 px-4 py-6 text-[11px] text-muted-foreground sm:flex-row sm:px-6 lg:px-10">
          <span>{dict.landing.copyright}</span>
          <span>{dict.landing.footerNote}</span>
        </div>
      </footer>
    </div>
  );
}
