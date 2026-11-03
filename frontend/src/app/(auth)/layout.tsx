import React from "react";
import Link from "next/link";
import { WeirwiseWordmark } from "@/components/ui/weirwise-wordmark";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { Shield, Sparkles } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full flex bg-background text-foreground selection:bg-[#46C7D6] selection:text-black font-sans transition-colors overflow-hidden">
      {/* Desktop Branding Panel */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 xl:p-16 border-r border-zinc-800 bg-zinc-950/20 select-none overflow-hidden">
        {/* Top Header: Logo */}
        <div className="relative z-10 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center">
            <WeirwiseWordmark className="w-36" priority />
          </Link>
          <div className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-800 bg-zinc-900/40 px-2.5 py-1 text-xs font-mono text-zinc-400">
            <Sparkles className="h-3.5 w-3.5 text-[#46C7D6]" />
            <span>STUDIO</span>
          </div>
        </div>

        {/* Centerpiece Showcase */}
        <div className="relative z-10 max-w-md space-y-6 my-auto py-10">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-sm border border-zinc-800 bg-zinc-900/40 text-xs font-mono text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-none bg-[#46C7D6]" />
            <span>STRICT GROUNDING ARCHITECTURE</span>
          </div>

          <h2 className="text-3xl xl:text-4xl font-semibold tracking-tight text-white leading-tight">
            Autonomous assistants. <br />
            <span className="text-zinc-500 font-normal">Grounded in verified data.</span>
          </h2>

          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
            Synthesize corporate documentation into precise, attributed answers with zero hallucination and strict cryptographic isolation.
          </p>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 rounded-md border border-zinc-800 bg-zinc-900/20">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">INDEXING</span>
              <p className="text-xs font-medium text-white mt-1">1536-dim vector recall</p>
            </div>
            <div className="p-3.5 rounded-md border border-zinc-800 bg-zinc-900/20">
              <span className="text-[10px] font-mono text-[#46C7D6] uppercase">SECURITY</span>
              <p className="text-xs font-medium text-white mt-1">Row-level isolation</p>
            </div>
          </div>
        </div>

        {/* Bottom Compliance Bar */}
        <div className="relative z-10 flex items-center justify-between pt-6 border-t border-zinc-800 text-xs text-zinc-500 font-mono">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            <span>End-to-end encrypted</span>
          </div>
          <span>v0.1.0</span>
        </div>
      </div>

      {/* Form Panel */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-6 sm:p-10 lg:p-12 relative overflow-y-auto">
        {/* Mobile Header: Logo & Theme Switcher */}
        <div className="flex items-center justify-between w-full max-w-sm mx-auto mb-6">
          <Link href="/" className="lg:hidden inline-flex items-center">
            <WeirwiseWordmark className="w-28" priority />
          </Link>
          <div className="ml-auto">
            <ThemeSwitcher />
          </div>
        </div>

        {/* Centered Auth Card Container */}
        <div className="w-full max-w-sm mx-auto my-auto py-4">
          {children}
        </div>

        {/* Legal Notice */}
        <div className="w-full max-w-sm mx-auto pt-6 text-center text-xs text-zinc-500">
          <p>
            By continuing, you agree to our{" "}
            <Link href="/" className="text-zinc-400 hover:text-white underline underline-offset-4 transition-colors">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/" className="text-zinc-400 hover:text-white underline underline-offset-4 transition-colors">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
