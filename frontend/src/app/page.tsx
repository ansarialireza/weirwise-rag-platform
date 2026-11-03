import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { HeroActions } from "@/components/landing/hero-actions";
import {
  ArrowRight,
  Shield,
  Layers,
  Sparkles,
  Bot,
  FileCheck,
  Code2,
  Sliders,
  CheckCircle2,
  ChevronRight,
  Gift,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Weirwise",
  description:
    "Build, test, and publish autonomous AI assistants grounded in your company knowledge. Zero hallucinations, verified inline citations, and effortless web embedding.",
  alternates: {
    canonical: "https://dev.weirwise.com/",
  },
};

export default function RootPage() {
  const steps = [
    {
      step: "01",
      title: "Add Business Knowledge",
      desc: "Upload PDFs, manuals, policies, or point to your website documentation. Files are chunked and indexed into isolated pgvector stores.",
      icon: FileCheck,
    },
    {
      step: "02",
      title: "Configure & Test",
      desc: "Customize prompts, test responses with inline citations, and verify that the assistant stays strictly anchored to approved company data.",
      icon: Sliders,
    },
    {
      step: "03",
      title: "Publish Everywhere",
      desc: "Embed an interactive chat bubble on your website with one script tag, or trigger via standard REST APIs into your existing stack.",
      icon: Code2,
    },
  ];

  const highlights = [
    {
      title: "Deterministic Grounding",
      desc: "Assistants answer strictly from your uploaded knowledge. If evidence is lacking, the assistant responds honestly rather than inventing facts.",
      icon: Shield,
    },
    {
      title: "Simple by Default, Powerful by Design",
      desc: "No engineering jargon for business owners. Advanced vector controls, BYOK keys, and FinOps metrics unfold progressively when needed.",
      icon: Layers,
    },
    {
      title: "Intelligent Model Routing",
      desc: "Intelligent routing automatically selects the optimal engine for every prompt—balancing lightning-fast responses, cost efficiency, and deep analytical reasoning with zero technical complexity.",
      icon: Bot,
    },
  ];

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://dev.weirwise.com";

  // Structured Data Schema for Organization & SoftwareApplication
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Weirwise Inc.",
    url: baseUrl,
    logo: `${baseUrl}/weirwise-horizontal.svg`,
    description: "Enterprise Autonomous RAG Platform and AI Assistant Studio.",
    sameAs: [
      "https://github.com/ansarialireza/weirwise-rag-platform"
    ],
  };

  const softwareApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Weirwise Platform",
    operatingSystem: "Cloud / Web",
    applicationCategory: "BusinessApplication",
    offers: {
      "@type": "Offer",
      price: "0.00",
      priceCurrency: "USD",
    },
    description:
      "Autonomous AI assistant studio for business with zero-hallucination citation grounding, isolated vector stores, and intelligent model routing.",
    url: baseUrl,
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between selection:bg-primary selection:text-primary-foreground font-sans transition-colors">
      {/* Structured Data (JSON-LD) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
      />

      {/* 1. Unified Site Header */}
      <SiteHeader />

      {/* 2. Main Hero & Intelligent Product Experience */}
      <main className="flex-1 flex flex-col items-center justify-center w-full">
        {/* Hero Section */}
        <section className="w-full px-4 sm:px-6 pt-16 sm:pt-24 md:pt-32 pb-24 sm:pb-32 max-w-5xl mx-auto text-center">
          {/* Core Headline (LCP text element rendered on server) */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-foreground leading-[1.1]">
            Custom AI Assistants <br />
            <span className="text-muted-foreground font-medium">
              Powered by Your Business Data.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-5 text-base sm:text-lg md:text-xl text-muted-foreground font-normal leading-relaxed max-w-2xl mx-auto">
            Build, test, and publish autonomous AI assistants grounded in your company knowledge. Zero hallucinations, verified inline citations, and effortless web embedding.
          </p>

          {/* Interactive CTAs */}
          <HeroActions />

          {/* Micro-guarantee */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" /> No credit card required</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" /> Setup in under 3 minutes</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" /> Strict data isolation</span>
          </div>

          {/* Interactive Assistant Preview Simulation Card */}
          <div className="mt-14 sm:mt-18 rounded-lg border border-zinc-800 bg-zinc-950/20 p-5 sm:p-7 md:p-8 text-left max-w-3xl mx-auto relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-md border border-zinc-800 bg-zinc-900/40 flex items-center justify-center">
                  <Bot className="h-4.5 w-4.5 text-foreground" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-medium text-foreground">Customer Care Assistant</h3>
                  <span className="text-[11px] text-muted-foreground">Grounded on Verified Company Knowledge</span>
                </div>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-sm border border-zinc-800 bg-zinc-900/40 text-zinc-400">
                Grounded RAG
              </span>
            </div>

            <div className="space-y-4 text-xs sm:text-sm">
              <div className="flex justify-end">
                <div className="bg-white text-black font-medium px-3.5 py-2 rounded-md max-w-sm">
                  What is your refund timeframe and standard delivery speed?
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="rounded-md border border-zinc-800 bg-zinc-900/40 flex items-center justify-center shrink-0 mt-0.5 p-1.5">
                  <WeirwiseSymbol className="h-4 w-auto" />
                </div>
                <div className="border border-zinc-800/80 bg-zinc-900/20 text-foreground p-4 rounded-md max-w-lg space-y-2.5">
                  <p className="leading-relaxed text-zinc-300">
                    Based on our company policy: Standard shipping takes <strong>2 to 3 business days</strong> nationwide. Full refunds are granted within <strong>30 days</strong> of delivery with the original receipt.
                  </p>
                  <div className="pt-2 border-t border-zinc-800/60 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                    <span className="text-emerald-500 font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Verified by Company Knowledge
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3-Step Simple Journey */}
        <section className="w-full py-24 sm:py-32 px-4 sm:px-6 border-t border-zinc-800/60">
          <div className="max-w-5xl mx-auto">
            <div className="text-center max-w-xl mx-auto mb-12 sm:mb-16">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">How It Works</span>
              <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight text-foreground mt-2">
                From documents to production in three steps.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
              {steps.map((s, idx) => {
                const Icon = s.icon;
                return (
                  <div
                    key={idx}
                    className="rounded-lg border border-zinc-800 bg-zinc-950/20 p-6 sm:p-7 flex flex-col justify-between hover:border-zinc-700 hover:bg-zinc-900/30 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-5">
                        <div className="h-9 w-9 rounded-md border border-zinc-800 bg-zinc-900/40 flex items-center justify-center">
                          <Icon className="h-4.5 w-4.5 text-foreground" />
                        </div>
                        <span className="text-xs font-mono font-medium text-muted-foreground">{s.step}</span>
                      </div>
                      <h3 className="text-base font-medium text-foreground mb-2">{s.title}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Product Highlights */}
        <section className="w-full py-24 sm:py-32 px-4 sm:px-6 max-w-5xl mx-auto border-t border-zinc-800/60">
          <div className="text-center max-w-xl mx-auto mb-12 sm:mb-16">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Core Guarantees</span>
            <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight text-foreground mt-2">
              Engineered for accuracy and business peace of mind.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            {highlights.map((h, idx) => {
              const Icon = h.icon;
              return (
                <div key={idx} className="rounded-lg border border-zinc-800 bg-zinc-950/20 p-6 sm:p-7 hover:border-zinc-700 hover:bg-zinc-900/30 transition-all">
                  <div className="h-9 w-9 rounded-md border border-zinc-800 bg-zinc-900/40 flex items-center justify-center mb-5">
                    <Icon className="h-4.5 w-4.5 text-foreground" />
                  </div>
                  <h3 className="text-base font-medium text-foreground mb-2">{h.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{h.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bottom Conversion CTA */}
        <section className="w-full border-t border-zinc-800/80 py-24 sm:py-32 px-4 sm:px-6 text-center">
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight text-foreground">
              Ready to give your business an intelligent assistant?
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Create an account now to start building truthful AI copilots. Ingest documentation, test in the studio, and embed on your site in minutes.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-sm mx-auto">
              <Link
                href="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-md bg-white text-black px-6 py-2.5 text-sm font-medium hover:bg-zinc-200 active:scale-[0.98] transition-all"
              >
                <span>Start Free Trial</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* 3. Footer */}
      <footer className="w-full border-t border-border/80 py-6 px-4 sm:px-6 text-xs text-muted-foreground">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <WeirwiseSymbol className="h-5 w-auto" />
            <span className="font-semibold text-foreground text-xs">Weirwise</span>
            <span>&copy; 2026 Weirwise Inc. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6 text-xs font-medium">
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/blog" className="hover:text-foreground transition-colors">
              Blog
            </Link>
            <Link href="/login" className="hover:text-foreground transition-colors">
              Sign In
            </Link>
            <Link href="/register" className="hover:text-foreground transition-colors">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
