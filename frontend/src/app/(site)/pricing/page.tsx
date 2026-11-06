"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { useI18n } from "@/lib/i18n/context";
import { ArrowRight, Check, FileText, Globe2, Info, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PricingPage() {
  const { dict } = useI18n();
  const p = dict.pricing;

  const plans = [
    {
      id: "free",
      name: p.freeName,
      price: p.freePrice,
      tagline: p.freeTagline,
      limits: p.freeLimits,
      cta: p.startFree,
      featured: false,
    },
    {
      id: "starter",
      name: p.starterName,
      price: p.starterPrice,
      tagline: p.starterTagline,
      limits: p.starterLimits,
      cta: p.startOnFree,
      featured: false,
    },
    {
      id: "pro",
      name: p.proName,
      price: p.proPrice,
      tagline: p.proTagline,
      limits: p.proLimits,
      cta: p.startOnFree,
      featured: true,
    },
    {
      id: "business",
      name: p.businessName,
      price: p.businessPrice,
      tagline: p.businessTagline,
      limits: p.businessLimits,
      cta: p.startOnFree,
      featured: false,
    },
  ];

  const assurances = [
    // Title only: an icon and a short label carry each claim, and the sentences
    // that used to sit under them repeated the landing page.
    { icon: FileText, title: p.assurance1Title },
    { icon: Lock, title: p.assurance2Title },
    { icon: Globe2, title: p.assurance3Title },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground transition-colors">
      <SiteHeader />

      <main id="main-content" className="flex-1">
        <section className="border-b border-border/60">
          <div className="mx-auto grid w-full max-w-wide gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-16 lg:px-10">
            <div>
              <p className="eyebrow">{p.eyebrow}</p>
              <h1 className="hero-display mt-3 max-w-xl font-semibold text-foreground">
                {p.title}
              </h1>
            </div>
            <div className="max-w-md">
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                {p.subtitle}
              </p>
              <p className="mt-4 text-xs text-muted-foreground">{p.disclaimer}</p>
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto w-full max-w-wide px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={cn(
                    "flex flex-col rounded-xl border bg-card p-6",
                    plan.featured
                      ? "border-primary/40 shadow-lift ring-1 ring-primary/20"
                      : "border-border shadow-sm"
                  )}
                >
                  <h2 className="text-sm font-semibold text-foreground">{plan.name}</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">{plan.tagline}</p>

                  <div className="mt-5 flex items-baseline gap-1.5">
                    <span className="text-4xl font-semibold tracking-tight text-foreground">
                      {plan.price}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{p.perMonth}</span>
                  </div>

                  <div className="mt-5 border-t border-border/70 pt-5">
                    <p className="text-[10px] font-medium uppercase tracking-eyebrow text-muted-foreground">
                      {p.included}
                    </p>
                    <ul className="mt-3 space-y-2.5">
                      {plan.limits.map((limit) => (
                        <li key={limit} className="flex items-start gap-2 text-[12.5px] text-foreground/85">
                          <Check
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                            strokeWidth={2.5}
                            aria-hidden="true"
                          />
                          {limit}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-auto pt-6">
                    <Link
                      href="/register"
                      className={cn(
                        "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors",
                        plan.featured
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "border border-border bg-background text-foreground hover:bg-muted/70"
                      )}
                    >
                      {plan.cta}
                      <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-border bg-card/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {p.billingNote}
            </div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-card/40">
          <div className="mx-auto grid w-full max-w-wide gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6 lg:px-10">
            {assurances.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-center gap-3 px-1 sm:px-6">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 className="text-[13px] font-semibold text-foreground">{item.title}</h2>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mx-auto flex w-full max-w-wide flex-col items-start justify-between gap-4 px-4 py-12 sm:flex-row sm:items-center sm:px-6 lg:px-10">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {dict.landing.ctaHeadline}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{dict.landing.ctaSubtitle}</p>
            </div>
            <Link
              href="/register"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {p.startFree}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      {/* The sticky header already carries the mark, the navigation and Sign in,
          so the footer states the copyright and nothing else. */}
      <footer className="border-t border-border/60">
        <div className="mx-auto w-full max-w-wide px-4 py-6 text-[11px] text-muted-foreground sm:px-6 lg:px-10">
          {dict.landing.copyright}
        </div>
      </footer>
    </div>
  );
}
