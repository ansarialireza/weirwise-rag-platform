"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { ArrowRight, Bot, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

export function LandingExperience() {
  const { dict } = useI18n();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between selection:bg-[#46C7D6] selection:text-black font-sans">
      {/* 1. Header */}
      <SiteHeader />

      {/* 2. Brutalist-Tech Main Experience */}
      <main className="flex-1 flex flex-col items-center justify-center w-full">
        {/* Hero Section */}
        <section className="w-full px-4 sm:px-6 pt-16 sm:pt-24 md:pt-32 pb-20 max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm border border-zinc-800 bg-zinc-950/40 text-xs font-mono text-zinc-400 mb-6">
            <span className="w-1.5 h-1.5 rounded-none bg-[#46C7D6]" />
            <span>{dict.landing.badge}</span>
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-semibold tracking-tight text-white leading-[1.05]">
            {dict.landing.heroHeadline1} <br />
            <span className="text-zinc-500 font-normal">{dict.landing.heroHeadline2}</span>
          </h1>

          <p className="mt-5 text-sm sm:text-base text-zinc-400 font-normal leading-relaxed max-w-xl mx-auto">
            {dict.landing.heroSubhead}
          </p>

          {/* Live System Preview */}
          <div className="mt-14 rounded-md border border-zinc-800 bg-zinc-950/40 p-5 sm:p-7 text-start max-w-2xl mx-auto">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-sm border border-zinc-800 bg-zinc-900/40 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-xs font-medium text-white">{dict.landing.sampleBotTitle}</h3>
                  <span className="text-[10px] text-zinc-500 font-mono">{dict.landing.sampleBotSubtitle}</span>
                </div>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-sm border border-zinc-800 bg-zinc-900/40 text-[#46C7D6]">
                {dict.landing.sampleStatus}
              </span>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex justify-end">
                <div className="bg-white text-black font-medium px-3.5 py-1.5 rounded-md max-w-xs">
                  {dict.landing.sampleUserQuery}
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="rounded-sm border border-zinc-800 bg-zinc-900/40 flex items-center justify-center shrink-0 mt-0.5 p-1">
                  <WeirwiseSymbol className="h-3.5 w-auto" />
                </div>
                <div className="border border-zinc-800/80 bg-zinc-900/20 text-zinc-200 p-3.5 rounded-md max-w-md space-y-2">
                  <p className="leading-relaxed text-zinc-300">
                    {dict.landing.sampleAssistantReply}
                  </p>
                  <div className="pt-2 border-t border-zinc-800/60 flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                    <span className="text-[#46C7D6] flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {dict.landing.sampleCitation}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* High-Impact Minimalist Feature Row */}
        <section className="w-full py-16 px-4 sm:px-6 max-w-4xl mx-auto border-t border-zinc-800/60">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-start">
            <div className="rounded-md border border-zinc-800 bg-zinc-950/20 p-5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">{dict.landing.feature1Tag}</span>
              <h3 className="text-sm font-medium text-white mt-2 mb-1">{dict.landing.feature1Title}</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {dict.landing.feature1Desc}
              </p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/20 p-5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">{dict.landing.feature2Tag}</span>
              <h3 className="text-sm font-medium text-white mt-2 mb-1">{dict.landing.feature2Title}</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {dict.landing.feature2Desc}
              </p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/20 p-5">
              <span className="text-[10px] font-mono text-[#46C7D6] uppercase">{dict.landing.feature3Tag}</span>
              <h3 className="text-sm font-medium text-white mt-2 mb-1">{dict.landing.feature3Title}</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {dict.landing.feature3Desc}
              </p>
            </div>
          </div>
        </section>

        {/* Minimalist Bottom CTA */}
        <section className="w-full border-t border-zinc-800/80 py-16 px-4 sm:px-6 text-center">
          <div className="max-w-2xl mx-auto space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
              {dict.landing.ctaHeadline}
            </h2>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-white text-black px-5 py-2 text-xs sm:text-sm font-medium hover:bg-zinc-200 transition-all"
              >
                <span>{dict.landing.ctaButton}</span>
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* 3. Minimal Footer */}
      <footer className="w-full border-t border-zinc-800/80 py-5 px-4 sm:px-6 text-xs text-zinc-500">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <WeirwiseSymbol className="h-4 w-auto" />
            <span className="font-semibold text-white text-xs">{dict.common.brand}</span>
            <span>{dict.landing.copyright}</span>
          </div>

          <div className="flex items-center gap-5 text-xs font-mono">
            <Link href="/pricing" className="hover:text-white transition-colors">{dict.common.pricing}</Link>
            <Link href="/blog" className="hover:text-white transition-colors">{dict.common.blog}</Link>
            <Link href="/login" className="hover:text-white transition-colors">{dict.common.signIn}</Link>
            <Link href="/register" className="hover:text-white transition-colors">{dict.common.register}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
