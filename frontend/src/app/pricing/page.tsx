"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import {
  Shield,
  CheckCircle2,
  Zap,
  Gift,
  ArrowRight,
  Database,
  Cpu,
  Lock,
  Globe2,
  Terminal,
} from "lucide-react";

export default function PricingPage() {
  const modelRates = [
    { model: "GPT-4o Mini / Gemini Flash", input: "$0.15", output: "$0.60", unit: "1M tokens" },
    { model: "Claude 3.5 Sonnet / GPT-4o", input: "$3.00", output: "$15.00", unit: "1M tokens" },
    { model: "Dense Vector Ingestion", input: "$0.02", output: "—", unit: "1M characters" },
  ];

  const valueFeatures = [
    "Full access to all platform capabilities & inference runtime",
    "Unlimited knowledge bases, documents, and web crawlers",
    "Embeddable public & private widget snippets with domain lockdown",
    "Semantic RAG retrieval with verified inline citations",
    "Enterprise AI Vault with automatic failover and BYOK support",
    "Real-time FinOps ledger accounting down to micro-cents ($0.000001)",
    "Full REST API access and outgoing webhook subscriptions",
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between transition-colors selection:bg-primary selection:text-primary-foreground font-sans">
      {/* 1. Unified Shared Header */}
      <SiteHeader />

      {/* 2. Main Pricing Hero & Pay-As-You-Go Architecture */}
      <main className="flex-1 py-12 sm:py-16 md:py-24 px-4 sm:px-6 max-w-5xl mx-auto w-full">
        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary mb-5 shadow-xs">
            <Gift className="h-4 w-4 text-primary" /> $100 Welcome Credit for Every New Business
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground leading-[1.12]">
            Pure Pay-As-You-Go. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary to-accent">
              Zero Subscriptions.
            </span>
          </h1>
          <p className="mt-4 text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto">
            Pay only for the exact inference tokens and vector operations you consume. No seat fees, no artificial feature gating, and no monthly surprises.
          </p>
        </div>

        {/* Highlighted $100 Welcome Credit & Model Breakdown Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch mb-16">
          {/* Main Card: Welcome Credit & Simple Signup */}
          <div className="lg:col-span-7 rounded-3xl border border-border bg-card p-6 sm:p-8 md:p-10 flex flex-col justify-between shadow-xl relative overflow-hidden">
            {/* Top Glow Accent */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

            <div>
              <div className="flex items-center justify-between gap-4 mb-6">
                <div className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  Self-Service Commercial Plan
                </div>
                <span className="text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">
                  Tier: Pay-As-You-Go
                </span>
              </div>

              <div className="space-y-2 mb-8">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl sm:text-6xl font-black tracking-tight text-foreground">$100</span>
                  <span className="text-base sm:text-lg font-bold text-primary uppercase tracking-wide">Free Credit</span>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Automatically provisioned upon account creation. Test, ingest documentation, and deploy live customer assistants without entering a credit card.
                </p>
              </div>

              <div className="border-t border-border/80 pt-6 mb-8">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                  Everything Included From Day One
                </h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
                  {valueFeatures.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-foreground/90 font-medium leading-snug">{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <Link
                href="/register"
                className="w-full py-3.5 rounded-xl text-sm font-bold text-center inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.99] transition-all shadow-md"
              >
                <span>Claim Your $100 Credit</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="text-[11px] text-center text-muted-foreground">
                No credit card required. Usage first deducts from promotional balance before fiat billing.
              </p>
            </div>
          </div>

          {/* Side Card: Transparent Transparent Token Rates */}
          <div className="lg:col-span-5 rounded-3xl border border-border/90 bg-card/60 p-6 sm:p-8 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Terminal className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  Live Metered Rates
                </h2>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                Direct pass-through inference pricing with zero markups on enterprise models.
              </p>

              <div className="space-y-4">
                {modelRates.map((rate, i) => (
                  <div key={i} className="p-3.5 rounded-xl border border-border/70 bg-secondary/30 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-foreground">
                      <span>{rate.model}</span>
                      <span className="text-[11px] font-mono text-muted-foreground">per {rate.unit}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-muted-foreground">Prompt: <strong className="text-foreground">{rate.input}</strong></span>
                      <span className="text-muted-foreground">Completion: <strong className="text-foreground">{rate.output}</strong></span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 rounded-xl border border-border/60 bg-secondary/20 space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Database className="h-4 w-4 text-accent" />
                  <span>Bring Your Own Keys (BYOK)</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Prefer direct provider billing? Plug in your existing OpenAI, Anthropic, or OpenRouter keys in Settings. Platform routing and RAG retrieval remain 100% free.
                </p>
              </div>
            </div>

            <div className="pt-6 border-t border-border/60 mt-6 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-primary" /> SOC2 Compliant Vault
              </span>
              <span className="flex items-center gap-1.5">
                <Globe2 className="h-3.5 w-3.5 text-primary" /> 99.9% Uptime SLA
              </span>
            </div>
          </div>
        </div>

        {/* Grounding & Data Guarantee */}
        <div className="rounded-2xl border border-border/80 bg-card/60 p-6 sm:p-8 text-center max-w-3xl mx-auto shadow-xs">
          <Shield className="h-8 w-8 text-primary mx-auto mb-3" />
          <h2 className="text-base font-bold text-foreground">Uncompromising Fact-Grounding & Privacy</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed max-w-xl mx-auto">
            Your business documentation is never used to train global public AI models. Assistants strictly adhere to verified knowledge chunks and reject ungrounded hallucinations with transparent fallback notifications.
          </p>
        </div>
      </main>

      {/* 3. Footer */}
      <footer className="border-t border-border/80 py-6 px-4 sm:px-6 text-xs text-muted-foreground">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <WeirwiseSymbol className="h-4 w-4" />
            <span className="font-semibold text-foreground text-xs">Weirwise</span>
            <span>&copy; 2026 Weirwise Inc. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6 text-xs font-medium">
            <Link href="/" className="hover:text-foreground transition-colors">
              Home
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
