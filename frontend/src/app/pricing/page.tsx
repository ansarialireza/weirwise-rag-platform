"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import {
  Shield,
  CheckCircle2,
  Zap,
} from "lucide-react";

export default function PricingPage() {
  const tiers = [
    {
      name: "Free Trial",
      tier: "free",
      price: "$0",
      description: "Ideal for testing Weirwise Platform on a small proof of concept.",
      features: [
        "2 AI Assistants",
        "10 Business Documents",
        "100 Grounded Chat Queries / mo",
        "Standard RAG Retrieval",
        "Interactive Testing Studio",
        "Community & Standard Support",
      ],
      cta: "Get Started Free",
      popular: false,
    },
    {
      name: "Team Starter",
      tier: "starter",
      price: "$49",
      description: "Perfect for growing teams launching AI assistants to their customers.",
      features: [
        "10 AI Assistants",
        "100 Business Documents",
        "2,500 Grounded Chat Queries / mo",
        "Web Widget Embed Code",
        "Domain Origin Lockdown",
        "Priority Email & Slack Support",
      ],
      cta: "Start 14-Day Trial",
      popular: true,
    },
    {
      name: "Business Pro",
      tier: "enterprise",
      price: "$199",
      description: "For high-volume production deployments with strict SLAs and security.",
      features: [
        "50 AI Assistants",
        "1,000 Business Documents",
        "20,000 Grounded Chat Queries / mo",
        "Programmatic REST API Keys",
        "Custom Embedding & Models",
        "Dedicated Account SLA",
      ],
      cta: "Upgrade to Pro",
      popular: false,
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between transition-colors">
      {/* 1. Shared Unified Header with Responsive Mobile Navigation */}
      <SiteHeader />

      {/* 2. Main Pricing Content */}
      <main className="flex-1 py-12 sm:py-16 md:py-20 px-4 sm:px-6 max-w-6xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary mb-4 shadow-2xs">
            <Zap className="h-3.5 w-3.5" /> Transparent, usage-based SaaS pricing
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
            Simple, predictable pricing for enterprise AI assistants
          </h1>
          <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Connect your company documentation, test grounded citations in the studio, and embed anywhere in minutes.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 sm:mb-16">
          {tiers.map((t) => (
            <div
              key={t.tier}
              className={`rounded-2xl border p-6 flex flex-col justify-between transition-all ${
                t.popular
                  ? "border-primary bg-card ring-2 ring-primary/20 shadow-lg relative"
                  : "border-border/90 bg-card/80 hover:border-border hover:bg-card shadow-xs"
              }`}
            >
              {t.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-xs">
                  Most Popular
                </div>
              )}
              <div>
                <h2 className="text-base font-bold text-foreground">{t.name}</h2>
                <p className="text-xs text-muted-foreground mt-1 mb-4 leading-relaxed">{t.description}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl sm:text-4xl font-extrabold text-foreground">{t.price}</span>
                  <span className="text-xs text-muted-foreground font-medium">/ month</span>
                </div>
                <div className="border-t border-border pt-4 mb-6">
                  <ul className="space-y-2.5 text-xs text-muted-foreground">
                    {t.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <span className="text-foreground/90 font-medium">{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <Link
                href="/register"
                className={`w-full py-2.5 rounded-xl text-xs font-semibold text-center transition-all ${
                  t.popular
                    ? "bg-primary text-primary-foreground hover:opacity-90 shadow-xs active:scale-[0.98]"
                    : "border border-border/90 bg-secondary/80 hover:bg-secondary text-secondary-foreground active:scale-[0.98]"
                }`}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Feature comparison guarantee */}
        <div className="rounded-2xl border border-border/80 bg-card/60 p-6 sm:p-8 text-center max-w-3xl mx-auto shadow-xs">
          <Shield className="h-8 w-8 text-primary mx-auto mb-3" />
          <h2 className="text-base font-bold text-foreground">Strict Data Privacy & Grounding Transparency</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed max-w-xl mx-auto">
            Every assistant answer is strictly grounded in the documents you ingest. If no knowledge chunk meets the similarity threshold, the assistant tells you honestly rather than hallucinating or inventing citations.
          </p>
        </div>
      </main>

      {/* 3. Footer */}
      <footer className="border-t border-border/80 py-6 px-4 sm:px-6 text-xs text-muted-foreground">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
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
