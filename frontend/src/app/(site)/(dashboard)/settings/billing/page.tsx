"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { InvoiceItem, WorkspaceBillingStatus } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  CreditCard,
  Download,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ExternalLink,
  Receipt,
  Sparkles,
} from "lucide-react";

export default function BillingSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [billing, setBilling] = useState<WorkspaceBillingStatus | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadBilling() {
      try {
        const [b, inv] = await Promise.all([
          api.getUserBilling().catch(() => null),
          api.getWorkspaceInvoices().catch(() => []),
        ]);
        if (active) {
          setBilling(b);
          setInvoices(inv);
        }
      } catch (err) {
        console.error("Failed to load billing details:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadBilling();

    return () => {
      active = false;
    };
  }, []);

  const handleDownloadInvoice = async (invoiceNumber: string) => {
    try {
      const res = await api.downloadInvoice(null, invoiceNumber);
      const blob = new Blob([JSON.stringify(res, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Invoice-${invoiceNumber}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ message: "Invoice receipt downloaded.", type: "success" });
    } catch (err: any) {
      toast({ message: err.message || "Failed to download invoice.", type: "error" });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <PageHeader title="Billing & Subscriptions" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const planName = (billing?.plan_name || billing?.plan_tier || "Free Trial").toUpperCase();
  const queriesUsed = billing?.chat_turns_used ?? 0;
  const queriesLimit = billing?.chat_turns_limit ?? 100;
  const docsUsed = billing?.documents_indexed ?? 0;
  const docsLimit = billing?.documents_limit ?? 10;
  const isFree = (billing?.monthly_price ?? 0) === 0;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Billing & Subscriptions</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your account plan tier, payment details, and downloadable invoice history.
          </p>
        </div>
        <Link href="/pricing">
          <Button size="sm" className="gap-1.5 font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            Upgrade Plan
          </Button>
        </Link>
      </div>

      {/* Plan Card */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-signal" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Current Plan
              </h2>
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {planName}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success border border-success/30">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Active Subscription
            </span>
          </div>
        </div>

        {/* Quota gauges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-border">
          <div className="rounded-lg border border-border/80 bg-muted/30 p-4 space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Monthly Queries
            </span>
            <div className="text-lg font-bold font-mono text-foreground">
              {queriesUsed.toLocaleString()} / {queriesLimit.toLocaleString()}
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.round((queriesUsed / Math.max(queriesLimit, 1)) * 100))}%` }}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/80 bg-muted/30 p-4 space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Documents Indexed
            </span>
            <div className="text-lg font-bold font-mono text-foreground">
              {docsUsed.toLocaleString()} / {docsLimit.toLocaleString()}
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.round((docsUsed / Math.max(docsLimit, 1)) * 100))}%` }}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/80 bg-muted/30 p-4 space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Renewal Date
            </span>
            <div className="text-sm font-semibold font-mono text-foreground flex items-center gap-1.5 mt-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {billing?.period_end ? new Date(billing.period_end).toLocaleDateString() : "Rolling Monthly"}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {isFree ? "Free tier never expires" : "Manual renewal / on-chain confirmation"}
            </p>
          </div>
        </div>
      </section>

      {/* Invoice History */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <Receipt className="h-5 w-5 text-signal" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            Billing History & Receipts
          </h2>
        </div>

        {invoices.length === 0 ? (
          <div className="text-center py-10 text-xs text-muted-foreground space-y-2">
            <p>No invoices generated yet for your account.</p>
            <p>Once you upgrade to a paid subscription, receipts and tax records will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-muted/30 px-2 rounded-lg transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground font-mono">{inv.invoice_number}</span>
                    <span className="rounded bg-success/10 text-success text-[10px] px-2 py-0.5 font-bold uppercase">
                      {inv.status}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(inv.created_at).toLocaleDateString()} • {inv.line_items?.[0]?.description || "Subscription"}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <span className="font-mono font-bold text-foreground text-sm">
                    ${inv.amount} {inv.currency}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadInvoice(inv.invoice_number)}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Receipt
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
