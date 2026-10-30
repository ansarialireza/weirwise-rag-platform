"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { ArrowRight, Check, Copy } from "lucide-react";

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
    navigator.clipboard.writeText("curl -s https://dev.weirwise.com/api/v1/health/live");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between selection:bg-primary selection:text-primary-foreground font-sans transition-colors">
      {/* 1. Minimal Header */}
      <header className="w-full border-b border-border/60 bg-background/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <WeirwiseSymbol className="h-7 w-7" />
            <span className="font-semibold text-sm tracking-tight text-foreground">
              Weirwise
            </span>
          </Link>

          <nav className="flex items-center gap-3 sm:gap-4 text-xs">
            <Link
              href="/pricing"
              className="text-muted-foreground hover:text-foreground transition-colors font-medium px-1.5 py-1"
            >
              Pricing
            </Link>

            {dashboardUrl ? (
              <Link
                href={dashboardUrl}
                className="text-muted-foreground hover:text-foreground transition-colors font-medium px-1.5 py-1"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground transition-colors font-medium px-1.5 py-1"
              >
                Sign In
              </Link>
            )}

            <div className="pl-1">
              <ThemeSwitcher />
            </div>

            <Link
              href={dashboardUrl || "/register"}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:opacity-90 active:scale-[0.98] transition-all"
            >
              {dashboardUrl ? "Open Studio" : "Get Started"}
            </Link>
          </nav>
        </div>
      </header>

      {/* 2. Focused Hero Section with Generous Whitespace */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-16 sm:py-24 md:py-32 text-center max-w-4xl mx-auto w-full">
        <div className="space-y-6 sm:space-y-8 max-w-2xl mx-auto">
          {/* Restrained Accent Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span>Enterprise AI Assistant Studio</span>
          </div>

          {/* Clear, Memorable Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground leading-[1.1] sm:leading-[1.12]">
            Grounded AI assistants for your enterprise.
          </h1>

          {/* Short, Direct Supporting Description */}
          <p className="text-base sm:text-lg text-muted-foreground font-normal leading-relaxed max-w-xl mx-auto">
            Connect your knowledge sources, configure instructions, and deploy truthful AI assistants with verified citations.
          </p>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-sm mx-auto">
            <Link
              href={dashboardUrl || "/register"}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow hover:opacity-90 active:scale-[0.98] transition-all"
            >
              {dashboardUrl ? "Enter Workspace" : "Start Building Free"}
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/pricing"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium text-foreground hover:bg-secondary active:scale-[0.98] transition-all"
            >
              View Pricing
            </Link>
          </div>

          {/* Minimal 1-Line Quickstart / API Reference */}
          <div className="pt-8 sm:pt-12">
            <div
              onClick={copyCommand}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") copyCommand();
              }}
              className="inline-flex items-center gap-2.5 rounded-lg border border-border/80 bg-card/90 px-3.5 py-2 font-mono text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors cursor-pointer select-all shadow-xs"
              title="Click to copy quickstart probe"
            >
              <span className="text-primary font-bold select-none">$</span>
              <span className="truncate max-w-[260px] sm:max-w-md">
                curl -s https://dev.weirwise.com/api/v1/health/live
              </span>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-primary shrink-0 select-none" />
              ) : (
                <Copy className="h-3.5 w-3.5 shrink-0 opacity-60 hover:opacity-100 select-none" />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/80 mt-2 font-mono">
              Dense vector retrieval &bull; Strict multi-tenant isolation &bull; Model-agnostic
            </p>
          </div>
        </div>
      </main>

      {/* 3. Discreet Minimal Footer */}
      <footer className="w-full border-t border-border/60 py-6 px-4 sm:px-6 text-xs text-muted-foreground">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <WeirwiseSymbol className="h-4 w-4" />
            <span className="font-semibold text-foreground text-xs">Weirwise</span>
            <span>&copy; 2026 Weirwise Inc.</span>
          </div>

          <div className="flex items-center gap-6 text-xs">
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
