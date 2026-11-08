"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { useI18n } from "@/lib/i18n/context";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { BillingPlanInfo, WorkspaceBillingStatus } from "@/types";
import { ArrowRight, Check, FileText, Globe2, Info, Lock, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function PricingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { dict } = useI18n();
  const p = dict.pricing;

  const [plans, setPlans] = useState<BillingPlanInfo[]>([]);
  const [billing, setBilling] = useState<WorkspaceBillingStatus | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(true);
  const [purchasingPlan, setPurchasingPlan] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      try {
        const publicPlans = await api.getPublicPlans();
        if (active) setPlans(publicPlans);

        if (user) {
          const workspaces = await api.getWorkspaces();
          if (workspaces && workspaces.length > 0) {
            const activeId = api.getWorkspaceId() || workspaces[0].id;
            try {
              const b = await api.getWorkspaceBilling(activeId);
              if (active) setBilling(b);
            } catch {
              // billing optional
            }
          }
        }
      } catch (err) {
        console.error("Failed to load plans:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchData();

    return () => {
      active = false;
    };
  }, [user]);

  const handleSelectPlan = async (plan: BillingPlanInfo) => {
    if (!user) {
      router.push(`/register?plan=${plan.code}`);
      return;
    }

    // Free plan selection
    if (plan.monthly_price === 0) {
      const workspaceId = api.getWorkspaceId();
      if (workspaceId) {
        try {
          setPurchasingPlan(plan.code);
          await api.changeWorkspacePlan(workspaceId, plan.code);
          router.push("/settings/billing");
        } catch (err) {
          console.error("Plan change failed:", err);
        } finally {
          setPurchasingPlan(null);
        }
      }
      return;
    }

    // Paid plan: initiate checkout
    const workspaceId = api.getWorkspaceId();
    if (!workspaceId) {
      router.push("/overview");
      return;
    }

    try {
      setPurchasingPlan(plan.code);
      const res = await api.initiateCheckout(workspaceId, {
        plan_code: plan.code,
        billing_cycle: billingCycle,
      });
      router.push(`/checkout?order_id=${res.order_id}`);
    } catch (err: any) {
      console.error("Checkout initiation error:", err);
      alert(err.message || "Failed to initiate payment. Please try again.");
    } finally {
      setPurchasingPlan(null);
    }
  };

  const assurances = [
    { icon: FileText, title: p.assurance1Title },
    { icon: Lock, title: p.assurance2Title },
    { icon: Globe2, title: p.assurance3Title },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground transition-colors">
      <SiteHeader />

      <main id="main-content" className="flex-1">
        {/* Hero Section */}
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

              {/* Billing Cycle Toggle */}
              <div className="mt-6 inline-flex items-center rounded-lg border border-border bg-card p-1 shadow-xs">
                <button
                  type="button"
                  onClick={() => setBillingCycle("monthly")}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
                    billingCycle === "monthly"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Monthly billing
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle("yearly")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
                    billingCycle === "yearly"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span>Yearly billing</span>
                  <span className="rounded-full bg-signal/20 px-1.5 py-0.2 text-[10px] font-bold text-signal">
                    Save 17%
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Dynamic Pricing Plans Grid */}
        <section>
          <div className="mx-auto w-full max-w-wide px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                {plans.map((plan) => {
                  const price =
                    billingCycle === "yearly"
                      ? Math.round(plan.yearly_price / 12)
                      : plan.monthly_price;
                  const currentPlanCode = (billing?.plan_code || billing?.plan_tier || "free").toLowerCase();
                  const isCurrent = currentPlanCode === plan.code.toLowerCase();

                  return (
                    <div
                      key={plan.id}
                      className={cn(
                        "relative flex flex-col rounded-xl border bg-card p-6 transition-all",
                        plan.is_recommended
                          ? "border-primary/50 shadow-lift ring-1 ring-primary/30"
                          : "border-border shadow-sm",
                        isCurrent && "border-signal/50 bg-signal/5"
                      )}
                    >
                      {plan.is_recommended && (
                        <div className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
                          <Sparkles className="h-3 w-3" />
                          Recommended
                        </div>
                      )}

                      {isCurrent && (
                        <div className="absolute -top-3 right-6 rounded-full bg-signal px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-signal-foreground">
                          Current Plan
                        </div>
                      )}

                      <h2 className="text-base font-semibold text-foreground">{plan.name}</h2>
                      <p className="mt-1 min-h-[32px] text-xs text-muted-foreground">
                        {plan.description || "Essential RAG capability and AI turn quota."}
                      </p>

                      <div className="mt-5 flex items-baseline gap-1.5">
                        <span className="text-4xl font-bold tracking-tight text-foreground font-mono">
                          ${price}
                        </span>
                        <span className="text-xs text-muted-foreground">/ month</span>
                      </div>
                      {billingCycle === "yearly" && plan.yearly_price > 0 && (
                        <span className="text-[11px] text-muted-foreground font-mono">
                          Billed ${plan.yearly_price} annually
                        </span>
                      )}

                      <div className="mt-6 border-t border-border/70 pt-5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Included Quotas & Capabilities
                        </p>
                        <ul className="mt-3 space-y-2.5">
                          <li className="flex items-start gap-2 text-xs text-foreground/90">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" strokeWidth={2.5} />
                            <span><strong>{plan.max_assistants}</strong> Custom Assistants</span>
                          </li>
                          <li className="flex items-start gap-2 text-xs text-foreground/90">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" strokeWidth={2.5} />
                            <span><strong>{plan.max_documents}</strong> Documents Indexed</span>
                          </li>
                          <li className="flex items-start gap-2 text-xs text-foreground/90">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" strokeWidth={2.5} />
                            <span><strong>{plan.max_chat_turns_monthly.toLocaleString()}</strong> Queries / mo</span>
                          </li>
                          <li className="flex items-start gap-2 text-xs text-foreground/90">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" strokeWidth={2.5} />
                            <span><strong>{plan.max_storage_mb} MB</strong> Document Storage</span>
                          </li>
                          {plan.features?.map((f, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-foreground/90">
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" strokeWidth={2.5} />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-auto pt-6">
                        <Button
                          type="button"
                          disabled={isCurrent || purchasingPlan === plan.code}
                          onClick={() => handleSelectPlan(plan)}
                          className={cn(
                            "w-full h-10 font-semibold gap-2",
                            plan.is_recommended && !isCurrent
                              ? "bg-primary text-primary-foreground hover:bg-primary/90"
                              : "border border-border bg-background text-foreground hover:bg-accent"
                          )}
                        >
                          {purchasingPlan === plan.code ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Processing...
                            </>
                          ) : isCurrent ? (
                            "Current Active Plan"
                          ) : plan.monthly_price === 0 ? (
                            "Downgrade to Free"
                          ) : (
                            <>
                              Upgrade to {plan.name}
                              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-8 flex items-start gap-3 rounded-xl border border-border bg-card/60 p-4 text-xs leading-relaxed text-muted-foreground shadow-xs">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <strong>Cryptocurrency & Gateway Settlements:</strong> We accept crypto payments (USDC, USDT, ETH, MATIC) and credit cards via Rampex. Instant confirmation activates your plan immediately upon blockchain receipt or card authorization.
              </div>
            </div>
          </div>
        </section>

        {/* Assurances */}
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
      </main>

      <SiteFooter />
    </div>
  );
}
