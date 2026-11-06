"use client";

import React from "react";
import Link from "next/link";
import { WeirwiseMark } from "@/components/ui/weirwise-mark";
import { PreferenceControls } from "@/components/ui/preference-controls";
import { FileText, Globe2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { ToastProvider } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/context";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthShell>{children}</AuthShell>
    </ToastProvider>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  const { dict } = useI18n();
  const rail = [
    { icon: FileText, label: dict.landing.path1Title },
    { icon: SlidersHorizontal, label: dict.landing.path2Title },
    { icon: Globe2, label: dict.landing.path4Title },
  ];

  return (
    <div className="flex min-h-screen w-full bg-background font-sans text-foreground">
      <div className="flex w-full flex-col px-5 py-6 sm:px-8 lg:w-[54%] lg:px-12 lg:py-8">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <WeirwiseMark className="h-7 w-auto" />
            <span className="text-[15px] font-semibold tracking-tight text-foreground">
              {dict.common.brand}
            </span>
          </Link>
          <PreferenceControls />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <p className="mx-auto flex max-w-sm items-center justify-center gap-1.5 text-center text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          {dict.auth.privacyNote}
        </p>
      </div>

      <aside className="on-onyx relative hidden overflow-hidden bg-onyx lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          aria-hidden="true"
          className="onyx-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -end-24 top-1/3 h-80 w-80 rounded-full bg-primary/[0.14] blur-3xl"
        />

        {/* One mark per page: the left column owns the lockup, so this panel
            carries only its status pill. */}
        <div className="relative flex items-center gap-2.5 text-sm font-semibold text-white">
          <span className="ms-1 inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-eyebrow text-white/60">
            <span className="h-1 w-1 rounded-full bg-volt" aria-hidden="true" />
            {dict.landing.heroEyebrow}
          </span>
        </div>

        <div className="relative my-auto max-w-md py-12">
          <h2 className="text-[2rem] font-semibold leading-hero tracking-hero text-white xl:text-4xl">
            {dict.auth.panelTitle}
          </h2>

          {/* The rail is the promise: it shows the three steps the signed-in
              product takes you through, so no sentence explains them twice. */}
          <ol className="mt-10 space-y-0">
            {rail.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.label} className="relative flex items-center gap-3.5 pb-4 last:pb-0">
                  {index < rail.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute start-[15px] top-8 h-[calc(100%-2rem)] w-px bg-gradient-to-b from-volt/40 to-white/10"
                    />
                  )}
                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-white/70">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="text-[13px] font-medium text-white/75">{step.label}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-white/55">
          <span className="h-1.5 w-1.5 rounded-full bg-volt" aria-hidden="true" />
          {dict.landing.footerStatus}
        </div>
      </aside>
    </div>
  );
}
