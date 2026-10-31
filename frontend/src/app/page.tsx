"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { SiteHeader } from "@/components/layout/site-header";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { ArrowRight, Check, Copy, Shield, Cpu, Sparkles } from "lucide-react";

export default function RootPage() {
  const { user, loading } = useAuth();
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const copyCommand = () => {
    navigator.clipboard.writeText("curl -s https://dev.weirwise.com/health/live");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between selection:bg-primary selection:text-primary-foreground font-sans transition-colors">
      {/* 1. Shared Unified Header with Responsive Mobile Navigation */}
      <SiteHeader />

      {/* 2. Focused Hero Section with Balanced Whitespace */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 sm:py-20 md:py-28 text-center max-w-4xl mx-auto w-full">
        <div className="space-y-6 sm:space-y-8 max-w-2xl mx-auto w-full">
          {/* Restrained Accent Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3.5 py-1 text-xs font-medium text-foreground shadow-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            <span className="tracking-tight">Enterprise AI Assistant Studio</span>
          </div>

          {/* Clear, Memorable Headline */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground leading-[1.12] sm:leading-[1.15]">
            Grounded AI assistants for your enterprise.
          </h1>

          {/* Short, Direct Supporting Description with High WCAG Contrast */}
          <p className="text-sm sm:text-base md:text-lg text-muted-foreground font-normal leading-relaxed max-w-xl mx-auto">
            Connect your knowledge sources, configure instructions, and deploy truthful AI assistants with verified citations.
          </p>

          {/* Action Buttons: High-Contrast Primary & Prominent Secondary */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5 w-full max-w-md mx-auto">
            <Link
              href={dashboardUrl || "/register"}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-xs hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <span>{dashboardUrl ? "Enter Workspace" : "Start Building Free"}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/pricing"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-border/90 bg-secondary/80 px-5 py-3 text-sm font-medium text-secondary-foreground hover:bg-secondary hover:border-border active:scale-[0.98] transition-all shadow-xs"
            >
              View Pricing
            </Link>
          </div>

          {/* Refined Quickstart & Monospace Terminal Block */}
          <div className="pt-6 sm:pt-8 w-full max-w-xl mx-auto">
            <div
              onClick={copyCommand}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") copyCommand();
              }}
              className="group flex items-center justify-between gap-3 rounded-xl border border-border/90 bg-card/90 px-4 py-2.5 font-mono text-xs text-foreground hover:border-primary/50 hover:bg-card transition-all cursor-pointer shadow-xs"
              title="Click to copy quickstart probe"
            >
              <div className="flex items-center gap-2.5 overflow-hidden text-left">
                <span className="text-primary font-bold select-none text-sm">$</span>
                <span className="truncate text-foreground/90 font-mono">
                  curl -s https://dev.weirwise.com/health/live
                </span>
              </div>
              <div className="shrink-0 flex items-center gap-1.5 pl-2 border-l border-border/60">
                {copied ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary font-sans">
                    <Check className="h-3.5 w-3.5" /> Copied
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-foreground font-sans transition-colors">
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </span>
                )}
              </div>
            </div>

            {/* Accessible Technical Feature Pills */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-medium">
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" /> Dense Vector Retrieval
              </span>
              <span className="text-border select-none">&bull;</span>
              <span className="inline-flex items-center gap-1">
                <Shield className="h-3 w-3 text-primary" /> Strict Multi-Tenant Isolation
              </span>
              <span className="text-border select-none">&bull;</span>
              <span className="inline-flex items-center gap-1">
                <Cpu className="h-3 w-3 text-primary" /> Model-Agnostic Engine
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* 3. Discreet Minimal Footer */}
      <footer className="w-full border-t border-border/80 py-6 px-4 sm:px-6 text-xs text-muted-foreground">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <WeirwiseSymbol className="h-4 w-4" />
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
