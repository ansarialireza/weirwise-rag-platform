"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { SiteHeader } from "@/components/layout/site-header";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
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
  ArrowUpRight,
  ChevronRight,
  Gift,
} from "lucide-react";

export default function RootPage() {
  const { user, loading } = useAuth();
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      api
        .getWorkspaces()
        .then((workspaces) => {
          if (workspaces.length > 0) {
            setDashboardUrl(`/workspaces/${workspaces[0].id}`);
          }
        })
        .catch(() => {});
    }
  }, [user, loading]);

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
      desc: "Define plain-English instructions and tune citation thresholds in the interactive Studio. Test answers against verified source citations.",
      icon: Sliders,
    },
    {
      step: "03",
      title: "Publish & Embed",
      desc: "Deploy immutable assistant snapshots with one click. Embed clean, responsive widgets on any website or connect via REST API.",
      icon: Code2,
    },
  ];

  const highlights = [
    {
      title: "Truthful, Grounded Responses",
      desc: "Assistants answer strictly from your uploaded knowledge. If evidence is lacking, the assistant responds honestly rather than inventing facts.",
      icon: Shield,
    },
    {
      title: "Simple by Default, Powerful by Design",
      desc: "No engineering jargon for business owners. Advanced vector controls, BYOK keys, and FinOps metrics unfold progressively when needed.",
      icon: Layers,
    },
    {
      title: "Complete Model Freedom",
      desc: "Switch seamlessly between GPT-4o, Claude 3.5 Sonnet, and Gemini Flash, or bring your own API credentials without platform markups.",
      icon: Bot,
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between selection:bg-primary selection:text-primary-foreground font-sans transition-colors">
      {/* 1. Unified Site Header */}
      <SiteHeader />

      {/* 2. Main Hero & Intelligent Product Experience */}
      <main className="flex-1 flex flex-col items-center justify-center w-full">
        {/* Hero Section */}
        <section className="w-full px-4 sm:px-6 pt-12 sm:pt-20 md:pt-28 pb-16 sm:pb-24 max-w-5xl mx-auto text-center">
          {/* Welcome Credit Announcement Pill */}
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary mb-6 hover:bg-primary/15 transition-all shadow-xs group"
          >
            <Gift className="h-4 w-4 text-primary" />
            <span>New: Free Trial with Dynamic Quotas</span>
            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          {/* Core Headline */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.1]">
            Custom AI Assistants <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary to-accent">
              Powered by Your Business Data.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-5 text-base sm:text-lg md:text-xl text-muted-foreground font-normal leading-relaxed max-w-2xl mx-auto">
            Build, test, and publish autonomous AI assistants grounded in your company knowledge. Zero hallucinations, verified inline citations, and effortless web embedding.
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5 w-full max-w-md mx-auto">
            <Link
              href={dashboardUrl || "/register"}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-primary px-7 py-3.5 text-sm font-bold text-primary-foreground shadow-md hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <span>{dashboardUrl ? "Open Workspace" : "Start Free Trial"}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/pricing"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary/80 px-6 py-3.5 text-sm font-semibold text-foreground hover:bg-secondary hover:border-border active:scale-[0.98] transition-all shadow-xs"
            >
              Explore Subscription Tiers
            </Link>
          </div>

          {/* Micro-guarantee */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> No credit card required</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Setup in under 3 minutes</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Strict data isolation</span>
          </div>

          {/* Interactive Assistant Preview Simulation Card */}
          <div className="mt-14 sm:mt-18 rounded-2xl sm:rounded-3xl border border-border bg-card p-4 sm:p-6 md:p-8 shadow-2xl text-left max-w-3xl mx-auto relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/80 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
                  <Bot className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-foreground">Customer Care Assistant</h3>
                  <span className="text-[11px] text-muted-foreground">Grounded on Store_Policies_2026.pdf</span>
                </div>
              </div>
              <span className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                LIVE SNAPSHOT v2
              </span>
            </div>

            <div className="space-y-4 text-xs sm:text-sm">
              <div className="flex justify-end">
                <div className="bg-primary text-primary-foreground font-medium px-4 py-2.5 rounded-2xl rounded-tr-xs max-w-sm shadow-xs">
                  What is your refund timeframe and standard delivery speed?
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5 p-1">
                  <WeirwiseSymbol className="h-4 w-auto" />
                </div>
                <div className="bg-secondary/50 border border-border/80 text-foreground p-4 rounded-2xl rounded-tl-xs max-w-lg space-y-2.5 shadow-xs">
                  <p className="leading-relaxed">
                    Based on our company policy: Standard shipping takes <strong>2 to 3 business days</strong> nationwide. Full refunds are granted within <strong>30 days</strong> of delivery with the original receipt.
                  </p>
                  <div className="pt-2 border-t border-border/60 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                    <span className="text-primary font-bold">Verified Citation:</span>
                    <span className="rounded bg-card px-1.5 py-0.5 border border-border font-mono text-[10px] text-foreground">
                      Store_Policies_2026.pdf (Chunk #1, Sim: 1.0)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3-Step Simple Journey */}
        <section className="w-full border-t border-border/80 bg-card/40 py-16 sm:py-24 px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center max-w-xl mx-auto mb-12 sm:mb-16">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">How It Works</span>
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-2">
                From documents to production in three steps.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {steps.map((s, idx) => {
                const Icon = s.icon;
                return (
                  <div
                    key={idx}
                    className="rounded-2xl border border-border bg-card p-6 sm:p-7 flex flex-col justify-between shadow-xs hover:border-primary/50 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-5">
                        <div className="h-10 w-10 rounded-xl bg-secondary border border-border/80 flex items-center justify-center">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <span className="text-xs font-mono font-bold text-muted-foreground">{s.step}</span>
                      </div>
                      <h3 className="text-base font-bold text-foreground mb-2">{s.title}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Product Highlights */}
        <section className="w-full py-16 sm:py-24 px-4 sm:px-6 max-w-5xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-12 sm:mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Core Guarantees</span>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-2">
              Engineered for accuracy and business peace of mind.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {highlights.map((h, idx) => {
              const Icon = h.icon;
              return (
                <div key={idx} className="rounded-2xl border border-border/80 bg-card/60 p-6 sm:p-7 shadow-xs">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-2">{h.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{h.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bottom Conversion CTA */}
        <section className="w-full border-t border-border/80 bg-card py-16 sm:py-20 px-4 sm:px-6 text-center">
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Ready to give your business an intelligent assistant?
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Create an account now to start your free trial with dynamic quota allocation. Ingest documentation, test in the studio, and embed on your site in minutes.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-sm mx-auto">
              <Link
                href="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-bold text-primary-foreground shadow-md hover:opacity-90 active:scale-[0.98] transition-all"
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
