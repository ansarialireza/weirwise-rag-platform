"use client";

import React from "react";
import Link from "next/link";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { SignalFlow } from "@/components/brand/signal-flow";
import { Check } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { dict } = useI18n();
  const points = [dict.auth.point1, dict.auth.point2, dict.auth.point3];

  return (
    <div className="flex min-h-screen w-full bg-background font-sans text-foreground">
      <div className="flex w-full flex-col px-5 py-6 sm:px-8 lg:w-[54%] lg:px-12 lg:py-8">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <WeirwiseSymbol className="h-7 w-auto" priority />
            <span className="text-[15px] font-semibold tracking-tight text-foreground">
              {dict.common.brand}
            </span>
          </Link>
          <ThemeSwitcher />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <p className="mx-auto max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
          {dict.auth.agreePrefix}{" "}
          <Link href="/" className="text-foreground underline underline-offset-4">
            {dict.auth.terms}
          </Link>{" "}
          {dict.auth.and}{" "}
          <Link href="/" className="text-foreground underline underline-offset-4">
            {dict.auth.privacy}
          </Link>
          .
        </p>
      </div>

      <aside className="relative hidden overflow-hidden bg-onyx lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 dot-grid opacity-[0.15]"
        />

        <div className="relative flex items-center gap-2.5 text-sm font-semibold tracking-tight text-white">
          <WeirwiseSymbol className="h-7 w-auto" priority />
          {dict.common.brand}
          <span className="ms-1 inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            <span className="h-1 w-1 rounded-full bg-signal" />
            Studio
          </span>
        </div>

        <div className="relative my-auto max-w-md py-12">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-signal">
            {dict.auth.panelEyebrow}
          </p>
          <h2 className="mt-4 text-[2rem] font-semibold leading-[1.15] tracking-tight text-white xl:text-4xl">
            {dict.auth.panelTitle}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">
            {dict.auth.panelSubtitle}
          </p>

          <ul className="mt-8 space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-zinc-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal/15 text-signal">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>

          <SignalFlow className="mt-12 max-w-sm opacity-60" variant="compact" />
        </div>

        <div className="relative flex items-center gap-2 text-xs text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-signal" />
          Private workspaces · Your data stays yours
        </div>
      </aside>
    </div>
  );
}
