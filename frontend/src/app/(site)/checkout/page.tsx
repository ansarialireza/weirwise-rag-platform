"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { CheckoutStatusInfo } from "@/types";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");
  const { user } = useAuth();
  const { toast } = useToast();

  const [statusInfo, setStatusInfo] = useState<CheckoutStatusInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setError("No checkout order ID provided.");
      setLoading(false);
      return;
    }

    let active = true;
    let pollInterval: NodeJS.Timeout | null = null;

    async function loadStatus() {
      try {
        const workspaceId = api.getWorkspaceId();
        if (!workspaceId) {
          setError("Workspace tenancy not selected.");
          setLoading(false);
          return;
        }

        const data = await api.getCheckoutStatus(workspaceId, orderId!);
        if (active) {
          setStatusInfo(data);
          setError(null);

          // Stop polling once terminal state reached
          if (data.is_subscription_active || data.status === "completed" || data.status === "failed" || data.status === "expired") {
            if (pollInterval) clearInterval(pollInterval);
          }
        }
      } catch (err: any) {
        if (active) setError(err.message || "Failed to load checkout status.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadStatus();

    // Start background status refresh interval
    pollInterval = setInterval(loadStatus, 4000);

    return () => {
      active = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [orderId]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ message: `${label} copied to clipboard.`, type: "success" });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
      case "paid":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success border border-success/30">
            <CheckCircle2 className="h-4 w-4" />
            Payment Completed
          </span>
        );
      case "confirming":
      case "processing":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary border border-primary/30">
            <Loader2 className="h-4 w-4 animate-spin" />
            Confirming On-Chain
          </span>
        );
      case "under_review":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning border border-warning/30">
            <Clock className="h-4 w-4" />
            Under Verification
          </span>
        );
      case "failed":
      case "expired":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-xs font-semibold text-destructive border border-destructive/30">
            <AlertTriangle className="h-4 w-4" />
            {status === "expired" ? "Payment Expired" : "Payment Failed"}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-signal/15 px-3 py-1 text-xs font-semibold text-signal border border-signal/30">
            <Clock className="h-4 w-4 animate-pulse" />
            Waiting for Payment
          </span>
        );
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <SiteHeader />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Preparing secure payment instructions...</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center space-y-4">
              <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
              <h2 className="text-base font-semibold text-destructive">Checkout Error</h2>
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => router.push("/pricing")}>
                Return to Pricing
              </Button>
            </div>
          ) : statusInfo?.is_subscription_active ? (
            <div className="rounded-xl border border-success/40 bg-card p-8 text-center space-y-6 shadow-lift">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/20 text-success">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Payment Successful!</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your subscription order <strong>{statusInfo.order_number}</strong> is fully verified and active.
                </p>
              </div>

              <div className="rounded-lg border border-border/80 bg-muted/40 p-4 text-xs font-mono space-y-2 text-left">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Paid:</span>
                  <span className="font-semibold text-foreground">${statusInfo.amount} {statusInfo.currency}</span>
                </div>
                {statusInfo.blockchain_txid && (
                  <div className="flex justify-between truncate">
                    <span className="text-muted-foreground">Tx Hash:</span>
                    <span className="font-semibold text-foreground truncate max-w-[200px]">{statusInfo.blockchain_txid}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => router.push("/settings/billing")} className="gap-2">
                  View Billing & Invoices
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => router.push("/overview")}>
                  Go to Dashboard
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 sm:p-8 space-y-6 shadow-lift">
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                  <h1 className="text-lg font-bold text-foreground">Complete Payment</h1>
                  <p className="text-xs text-muted-foreground">Order Ref: {statusInfo?.order_number}</p>
                </div>
                {statusInfo && getStatusBadge(statusInfo.status)}
              </div>

              {/* Order / Plan details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 space-y-1">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Subscription Plan
                  </span>
                  <div className="text-sm font-bold text-foreground">
                    {statusInfo?.plan_name || "Pro Subscription"}
                  </div>
                </div>

                <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 space-y-1">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Payment Method
                  </span>
                  <div className="text-sm font-bold text-foreground capitalize">
                    {statusInfo?.payment_method || "Cryptocurrency"}
                  </div>
                </div>
              </div>

              {/* Amount summary */}
              <div className="rounded-lg border border-border/80 bg-muted/30 p-4 text-center">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Amount Due
                </span>
                <div className="mt-1 text-3xl font-bold tracking-tight text-foreground font-mono">
                  ${statusInfo?.amount} {statusInfo?.currency}
                </div>
              </div>

              {/* QR Code and Address Instructions */}
              {statusInfo?.qr_code_svg && (
                <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-border bg-white text-black shadow-xs">
                  <div
                    className="w-48 h-48 flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: statusInfo.qr_code_svg }}
                  />
                  <span className="mt-2 text-[11px] font-mono text-zinc-600">
                    Scan with any compatible cryptocurrency wallet
                  </span>
                </div>
              )}

              {/* Payment Link / Destination Address */}
              <div className="space-y-3">
                {statusInfo?.payment_address && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Destination Deposit Address
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={statusInfo.payment_address}
                        className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-mono text-foreground"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(statusInfo.payment_address!, "Address")}
                        className="shrink-0"
                      >
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        Copy
                      </Button>
                    </div>
                  </div>
                )}

                {statusInfo?.payment_url && (
                  <div className="pt-2">
                    <a
                      href={statusInfo.payment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
                    >
                      Open Secure Hosted Checkout
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </div>

              {/* Real-time verification notice */}
              <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/20 p-3.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-signal shrink-0" />
                <div>
                  <strong>What happens after payment:</strong> Once your payment is confirmed by the network, your subscription activates automatically. You can safely keep or leave this page; your workspace status will update immediately.
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
