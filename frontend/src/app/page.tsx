"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { IntelligentMeshBackground } from "@/components/home/intelligent-mesh-background";
import { InteractiveRagVisualizer } from "@/components/home/interactive-rag-visualizer";
import { ArrowRight, ShieldCheck, Zap, Database } from "lucide-react";

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

  return (
    <div className="relative min-h-screen lg:h-screen lg:max-h-screen overflow-x-hidden lg:overflow-hidden bg-background text-foreground flex flex-col font-sans selection:bg-primary selection:text-primary-foreground antialiased transition-colors">
      {/* Dynamic Background Mesh (Gemini-Inspired Living Ambience) */}
      <IntelligentMeshBackground />

      {/* 1. Header (Compact, 52px height) */}
      <header className="h-[52px] shrink-0 border-b border-border/80 bg-background/80 backdrop-blur-md z-50 relative">
        <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <WeirwiseSymbol className="h-7 w-7" />
            <span className="font-semibold text-sm tracking-tight text-foreground flex items-center gap-1.5">
              Weirwise
              <span className="inline-block h-1 w-1 rounded-full bg-primary" />
            </span>
          </Link>

          <nav className="flex items-center gap-4 text-xs">
            <Link
              href="/pricing"
              className="text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              Pricing
            </Link>

            {dashboardUrl ? (
              <Link
                href={dashboardUrl}
                className="text-primary hover:underline font-medium transition-colors"
              >
                Workspace
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground transition-colors font-medium"
              >
                Sign In
              </Link>
            )}

            <ThemeSwitcher />

            <Link
              href={dashboardUrl || "/register"}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:opacity-90 active:scale-[0.98] transition-all"
            >
              {dashboardUrl ? "Open Studio" : "Get Started"}
            </Link>
          </nav>
        </div>
      </header>

      {/* 2. Main Content Canvas: Alive, Fluid, Responsive */}
      <main className="flex-1 min-h-0 flex flex-col justify-center max-w-6xl w-full mx-auto px-6 py-4 lg:py-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center my-auto">
          {/* Left Column: Focused Headline & Actions */}
          <div className="lg:col-span-5 space-y-4 lg:space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-xs backdrop-blur-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span>Verifiable Enterprise RAG Studio</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.12]">
              AI assistants grounded in your business data.
            </h1>

            <p className="text-sm sm:text-base text-muted-foreground font-normal leading-relaxed max-w-md">
              Transform unstructured business documents into truthful, verifiable AI assistants with dense vector retrieval and transparent source citations.
            </p>

            {/* Primary & Secondary Actions */}
            <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Link
                href={dashboardUrl || "/register"}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-xs sm:text-sm font-semibold text-primary-foreground shadow-xs hover:opacity-90 active:scale-[0.98] transition-all"
              >
                {dashboardUrl ? "Enter Workspace" : "Start Building Free"}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card/80 backdrop-blur-xs px-5 py-2.5 text-xs sm:text-sm font-medium text-foreground hover:bg-secondary active:scale-[0.98] transition-all"
              >
                Pricing &amp; Plans
              </Link>
            </div>

            {/* Core Trust Indicators */}
            <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground font-medium">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Zero Hallucinations
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary" />
                Cosine Cutoffs ≥ 0.70
              </span>
            </div>
          </div>

          {/* Right Column: Interactive Living Product Centerpiece */}
          <div className="lg:col-span-7 w-full">
            <InteractiveRagVisualizer />
          </div>
        </div>
      </main>

      {/* 3. Footer (Discreet 40px height) */}
      <footer className="h-10 shrink-0 border-t border-border/80 px-6 text-xs text-muted-foreground relative z-10 bg-background/60 backdrop-blur-xs">
        <div className="max-w-6xl mx-auto h-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WeirwiseSymbol className="h-4 w-4" />
            <span className="font-semibold text-foreground text-[11px]">Weirwise</span>
            <span className="text-[11px]">&copy; 2026</span>
          </div>

          <div className="flex items-center gap-5 text-[11px]">
            <Link
              href="/pricing"
              className="hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="hover:text-foreground transition-colors"
            >
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
