import Link from "next/link";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import {
  Brain,
  Shield,
  FileText,
  Search,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Code2,
  Building2,
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
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navigation */}
      <header className="border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <WeirwiseSymbol className="h-9 w-9" />
            <span className="font-bold text-xl tracking-tight text-foreground flex items-center gap-1.5">
              Weirwise
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <ThemeSwitcher />
            <Link
              href="/register"
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </header>

      {/* Main Pricing Hero */}
      <main className="flex-1 py-16 px-6 max-w-6xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-4">
            <Zap className="h-3.5 w-3.5" /> Transparent, usage-based SaaS pricing
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Simple, predictable pricing for enterprise AI assistants
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Connect your company documentation, test grounded citations in the studio, and embed anywhere in minutes.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {tiers.map((t) => (
            <div
              key={t.tier}
              className={`rounded-2xl border p-6 flex flex-col justify-between transition-all ${
                t.popular
                  ? "border-primary bg-card ring-2 ring-primary/20 shadow-xl relative"
                  : "border-border bg-card/60 hover:border-border/80"
              }`}
            >
              {t.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow">
                  Most Popular
                </div>
              )}
              <div>
                <h3 className="text-base font-bold text-foreground">{t.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-4">{t.description}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl sm:text-4xl font-black text-foreground">{t.price}</span>
                  <span className="text-xs text-muted-foreground">/ month</span>
                </div>
                <div className="border-t border-border pt-4 mb-6">
                  <ul className="space-y-2.5 text-xs text-muted-foreground">
                    {t.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <Link
                href="/register"
                className={`w-full py-2.5 rounded-xl text-xs font-semibold text-center transition-all ${
                  t.popular
                    ? "bg-primary text-primary-foreground hover:opacity-95 shadow-md"
                    : "border border-border bg-background hover:bg-secondary text-foreground"
                }`}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Feature comparison guarantee */}
        <div className="rounded-2xl border border-border bg-card/40 p-8 text-center max-w-3xl mx-auto">
          <Shield className="h-8 w-8 text-primary mx-auto mb-3" />
          <h2 className="text-base font-bold text-foreground">Strict Data Privacy & Grounding Transparency</h2>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Every assistant answer is strictly grounded in the documents you ingest. If no knowledge chunk meets the similarity threshold, the assistant tells you honestly rather than hallucinating or inventing citations.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 px-6 text-center text-xs text-muted-foreground">
        Weirwise Platform &copy; 2026. All rights reserved.
      </footer>
    </div>
  );
}
