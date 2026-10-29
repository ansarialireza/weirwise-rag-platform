"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
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
  Globe,
  Sliders,
} from "lucide-react";

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // If user is already authenticated, offer direct link into dashboard
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      api.getWorkspaces().then((workspaces) => {
        if (workspaces.length > 0) {
          setDashboardUrl(`/workspaces/${workspaces[0].id}`);
        }
      }).catch(() => {});
    }
  }, [user, loading]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary selection:text-primary-foreground">
      {/* Top Navbar */}
      <header className="border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black shadow-md">
              <Brain className="h-5 w-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">Weirwise</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/pricing"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
            {dashboardUrl ? (
              <Link
                href={dashboardUrl}
                className="text-xs font-medium text-primary hover:underline transition-colors"
              >
                Go to Workspace &rarr;
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign In
              </Link>
            )}
            <ThemeSwitcher />
            <Link
              href={dashboardUrl || "/register"}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
            >
              {dashboardUrl ? "Open Dashboard" : "Get Started Free"}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="py-20 px-6 max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary mb-6 shadow-sm">
            <Sparkles className="h-3.5 w-3.5" /> Enterprise Multi-Tenant AI Assistant Platform
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-tight max-w-4xl mx-auto">
            Build AI assistants grounded in your company&apos;s own knowledge.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Upload business documents, ingest chunks via Weirwise Core RAG, test transparent citations in real-time, and deploy secure widgets to your users with zero hallucinations.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg hover:opacity-95 transition-all"
            >
              Create Free Account <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-secondary transition-all"
            >
              Explore SaaS Plans
            </Link>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Strict similarity thresholds</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Verifiable chunk citations</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Role-based workspace security</span>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section className="py-16 px-6 border-t border-border bg-card/30">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-2xl font-bold tracking-tight">Everything required for business-grade retrieval</h2>
              <p className="text-xs text-muted-foreground mt-2">
                Designed to deliver truthful, referenceable answers with complete visibility into chunk rankings.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                  <FileText className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-foreground">Multi-Format Knowledge Ingestion</h3>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Upload PDF, Markdown, and TXT company manuals. Chunks are automatically partitioned, indexed, and stored in high-performance vector indexes.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                  <Search className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-foreground">Grounded Citations & Honesty</h3>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Every query retrieves verbatim chunks scored by cosine similarity. When documents don&apos;t have the answer, the assistant declines honestly rather than guessing.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                  <Globe className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-foreground">Embeddable Web Widgets & API</h3>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Publish assistants to your corporate intranet or customer portal with strict domain origin whitelisting and scoped REST API access tokens.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Workflow Showcase */}
        <section className="py-16 px-6 max-w-6xl mx-auto">
          <div className="rounded-3xl border border-border bg-card/60 p-8 sm:p-12 shadow-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                  <Sliders className="h-3.5 w-3.5" /> Interactive Studio
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Tune temperature, top-k, and similarity thresholds in real time
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-4 leading-relaxed">
                  In the Assistant Studio, configure prompt templates, adjust score cutoffs, and inspect retrieved citations alongside message latency in milliseconds.
                </p>
                <div className="mt-6">
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline"
                  >
                    Launch your workspace today &rarr;
                  </Link>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-background p-5 font-mono text-xs shadow-inner">
                <div className="text-muted-foreground mb-3">&#47;&#47; Sample Grounded Chat Response</div>
                <div className="text-primary font-bold">Q: &quot;What is our company remote work policy?&quot;</div>
                <div className="mt-2 text-foreground/90 pl-3 border-l-2 border-primary/40 text-[11px] leading-relaxed">
                  Based on your grounded business knowledge sources:
                  &quot;Employees may work remotely up to 3 days per week with manager coordination...&quot;
                </div>
                <div className="mt-4 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="rounded bg-secondary px-1.5 py-0.5">chunk_id: d3e4a1f</span>
                  <span className="rounded bg-secondary px-1.5 py-0.5">similarity: 0.942</span>
                  <span className="rounded bg-secondary px-1.5 py-0.5">rank: 1</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6 text-center text-xs text-muted-foreground">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">Weirwise Platform</span>
            <span>&copy; 2026</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
