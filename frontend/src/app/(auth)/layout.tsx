import React from "react";
import Link from "next/link";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { Shield, Sparkles, CheckCircle2, Lock, ArrowUpRight } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full flex bg-background text-foreground selection:bg-primary selection:text-primary-foreground transition-colors overflow-hidden">
      {/* LEFT/RIGHT BRANDING PANEL (Desktop only: hidden lg:flex) */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 xl:p-16 bg-card border-r border-border select-none overflow-hidden">
        {/* Subtle Ambient Background Gradients */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#2563FF]/10 rounded-full blur-3xl pointer-events-none" />
        
        {/* Geometric Background Grid Pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
          style={{
            backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "24px 24px"
          }} 
        />

        {/* Top Header: Logo & Product Tag */}
        <div className="relative z-10 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <WeirwiseSymbol className="h-8 w-auto transition-transform group-hover:scale-105" priority />
            <span className="font-bold text-xl tracking-tight text-foreground flex items-center gap-1.5 font-sans">
              Weirwise
              <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
            </span>
          </Link>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-mono text-muted-foreground backdrop-blur-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>AI Assistant Studio</span>
          </div>
        </div>

        {/* Centerpiece Showcase: Value Proposition & Visual Elements */}
        <div className="relative z-10 max-w-lg space-y-8 my-auto py-10">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
              Enterprise Grounded RAG Platform
            </div>
            <h2 className="text-3xl xl:text-4xl font-extrabold tracking-tight text-foreground leading-[1.15]">
              Autonomous AI Assistants Grounded in Truth.
            </h2>
            <p className="text-sm xl:text-base text-muted-foreground leading-relaxed">
              Synthesize fragmented corporate manuals, policy documentation, and customer databases into precise, attributed answers with strict zero-data-leakage architecture.
            </p>
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl border border-border/80 bg-background/50 backdrop-blur-xs space-y-1.5">
              <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                <CheckCircle2 className="h-4 w-4" />
                <span>Deterministic Recall</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-normal">
                1536-dimensional vector indexing eliminates hallucinations with exact citation backing.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-border/80 bg-background/50 backdrop-blur-xs space-y-1.5">
              <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                <Lock className="h-4 w-4" />
                <span>Tenant Isolation</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-normal">
                Multi-tenant cryptographic data segregation, audit logging, and row-level authorization.
              </p>
            </div>
          </div>

          {/* Testimonial / Social Proof Snippet */}
          <div className="p-4 rounded-xl border border-border/60 bg-secondary/30 backdrop-blur-xs">
            <p className="text-xs italic text-foreground/90">
              &ldquo;Weirwise transformed our 800-page internal standard operating procedure into an instant, verified conversational copilot in under ten minutes.&rdquo;
            </p>
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground font-medium">
              <span>Enterprise Knowledge Lead</span>
              <span className="font-mono text-primary flex items-center gap-0.5">
                SOC-2 Type II Ready <ArrowUpRight className="h-3 w-3" />
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Compliance & Security Bar */}
        <div className="relative z-10 flex items-center justify-between pt-6 border-t border-border/80 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-medium">
            <Shield className="h-4 w-4 text-primary shrink-0" />
            <span>End-to-End Encrypted &bull; ISO 27001 Aligned</span>
          </div>
          <span className="font-mono text-[11px]">v0.1.0-prod</span>
        </div>
      </div>

      {/* FORM PANEL (Centrally aligned container for desktop & full screen on mobile) */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-6 sm:p-10 lg:p-12 relative overflow-y-auto">
        {/* Mobile Header: Logo & Theme Switcher */}
        <div className="flex items-center justify-between w-full max-w-md mx-auto mb-6">
          <Link href="/" className="lg:hidden inline-flex items-center gap-2.5 group">
            <WeirwiseSymbol className="h-7 w-auto" priority />
            <span className="font-bold text-base tracking-tight text-foreground flex items-center gap-1.5">
              Weirwise
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ThemeSwitcher />
          </div>
        </div>

        {/* Centered Auth Card Container */}
        <div className="w-full max-w-md mx-auto my-auto py-4">
          {children}
        </div>

        {/* Mobile & Desktop Bottom Legal Notice */}
        <div className="w-full max-w-md mx-auto pt-6 text-center text-xs text-muted-foreground">
          <p>
            By continuing, you agree to our{" "}
            <Link href="/" className="hover:text-foreground underline underline-offset-4 transition-colors">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/" className="hover:text-foreground underline underline-offset-4 transition-colors">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
