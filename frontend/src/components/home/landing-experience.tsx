"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { LivingFlow } from "@/components/brand/living-flow";
import { FlowConsole, type FlowScenario } from "@/components/home/flow-console";
import { KnowledgePipeline, type PipelineNode } from "@/components/home/knowledge-pipeline";
import { ArrowRight, Check, FileText, Globe2, Search, SlidersHorizontal } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

export function LandingExperience() {
  const { dict } = useI18n();

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

  const nodes: PipelineNode[] = [
    { id: "ingest", label: dict.landing.path1Title, icon: FileText },
    { id: "configure", label: dict.landing.path2Title, icon: SlidersHorizontal },
    { id: "answer", label: dict.landing.path3Title, icon: Search },
    { id: "publish", label: dict.landing.path4Title, icon: Globe2 },
  ];

  /* Only the claims the console cannot show on its own. The passage and the
     citation are visible two columns away, so repeating them here would be
     captioning the picture. */
  const proofPoints = [dict.landing.proofPoint1, dict.landing.proofPoint2];

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
                  href="/login"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto"
                >
                  {dict.common.signIn}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </Link>
                <Link
                  href="/register"
                  className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 sm:w-auto"
                >
                  {dict.landing.primaryCta}
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
              }}
            />
          </div>
        </section>

        {/* How it works. The four stages used to carry a sentence each; the
            rail says what connects them, so the labels are all that is left. */}
        <section id="how-it-works" className="scroll-mt-20 border-b border-border/60">
          <div className="mx-auto w-full max-w-wide px-4 py-14 sm:px-6 sm:py-16 lg:px-10">
            <div className="max-w-2xl">
              <p className="eyebrow">{dict.landing.pathEyebrow}</p>
              <h2 className="section-title mt-3 font-semibold text-foreground">
                {dict.landing.pathTitle}
              </h2>
            </div>

            <KnowledgePipeline nodes={nodes} className="mt-10 sm:mt-12" />
          </div>
        </section>

        {/* What it solves */}
        <section className="border-b border-border/60 bg-card/40">
          <div className="mx-auto w-full max-w-wide px-4 py-14 sm:px-6 sm:py-16 lg:px-10">
            <div className="max-w-2xl">
              <p className="eyebrow">{dict.landing.useCasesEyebrow}</p>
              <h2 className="section-title mt-3 font-semibold text-foreground">
                {dict.landing.useCasesTitle}
              </h2>
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
                href="/login"
                className="mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-volt px-6 text-sm font-semibold text-volt-foreground transition-[filter] hover:brightness-95 sm:w-auto"
              >
                {dict.common.signIn}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
