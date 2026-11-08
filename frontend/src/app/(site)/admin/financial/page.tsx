"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { BillingPlanInfo } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  Users,
  Shield,
  Layers,
  Search,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Sliders,
  Wallet,
  Settings,
} from "lucide-react";

export default function AdminFinancialCenter() {
  const { toast } = useToast();

  const [tab, setTab] = useState<"overview" | "plans" | "subscriptions" | "transactions" | "provider">("overview");
  const [loading, setLoading] = useState(true);

  // Data states
  const [analytics, setAnalytics] = useState<any>(null);
  const [plans, setPlans] = useState<BillingPlanInfo[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [rampexSettings, setRampexSettings] = useState<any>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connTestResult, setConnTestResult] = useState<any>(null);

  // Plan Edit / Create state
  const [editingPlan, setEditingPlan] = useState<BillingPlanInfo | null>(null);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [planForm, setPlanForm] = useState<Partial<BillingPlanInfo>>({});

  // Transaction Review state
  const [reviewingTx, setReviewingTx] = useState<any | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [reviewNotes, setReviewNotes] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [an, pl, sub, tx, rx] = await Promise.all([
        api.getAdminFinancialAnalytics().catch(() => null),
        api.getAdminPlans().catch(() => []),
        api.getAdminSubscriptions().catch(() => []),
        api.getAdminTransactions().catch(() => []),
        api.getAdminRampexSettings().catch(() => null),
      ]);
      setAnalytics(an);
      setPlans(pl);
      setSubscriptions(sub);
      setTransactions(tx);
      setRampexSettings(rx);
    } catch (err) {
      console.error("Failed to load financial data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTestRampex = async () => {
    setTestingConnection(true);
    setConnTestResult(null);
    try {
      const res = await api.testAdminRampexConnection();
      setConnTestResult(res);
      if (res.valid) {
        toast({ message: "Rampex API key validated successfully!", type: "success" });
      } else {
        toast({ message: res.error || "Validation failed.", type: "error" });
      }
    } catch (err: any) {
      setConnTestResult({ valid: false, error: err.message });
      toast({ message: err.message || "Failed to reach Rampex.", type: "error" });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (creatingPlan) {
        await api.createAdminPlan(planForm);
        toast({ message: "New plan created.", type: "success" });
      } else if (editingPlan) {
        await api.updateAdminPlan(editingPlan.id, planForm);
        toast({ message: "Plan updated.", type: "success" });
      }
      setCreatingPlan(false);
      setEditingPlan(null);
      loadData();
    } catch (err: any) {
      toast({ message: err.message || "Plan operation failed.", type: "error" });
    }
  };

  const handleReviewTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingTx) return;
    try {
      await api.reviewAdminTransaction(reviewingTx.id, {
        action: reviewAction,
        notes: reviewNotes,
      });
      toast({ message: `Transaction marked as ${reviewAction}d.`, type: "success" });
      setReviewingTx(null);
      loadData();
    } catch (err: any) {
      toast({ message: err.message || "Review submission failed.", type: "error" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 pb-5 border-b border-border sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Financial Control Center
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-signal/15 text-signal border border-signal/30 font-semibold">
              Rampex Engine Live
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Real SaaS revenue tracking, dynamic plan limits, blockchain settlement logs, and provider credentials.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 text-xs font-semibold"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {(
          [
            { id: "overview", label: "Financial Overview", icon: TrendingUp },
            { id: "plans", label: "Plan Management", icon: Layers },
            { id: "subscriptions", label: "Subscriptions", icon: Users },
            { id: "transactions", label: "Transactions", icon: DollarSign },
            { id: "provider", label: "Rampex Provider", icon: Settings },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground">Total SaaS Revenue</span>
              <div className="text-2xl font-bold font-mono text-foreground mt-1">
                ${analytics?.total_revenue_usd?.toFixed(2) ?? "0.00"}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">From verified paid invoices</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground">Successful Payments</span>
              <div className="text-2xl font-bold font-mono text-success mt-1">
                {analytics?.successful_payments ?? 0}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Settled on-chain & card</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground">Active Subscriptions</span>
              <div className="text-2xl font-bold font-mono text-foreground mt-1">
                {analytics?.active_subscriptions ?? 0}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Workspace commercial tenants</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground">Under Review / Disputes</span>
              <div className="text-2xl font-bold font-mono text-warning mt-1">
                {analytics?.under_review_payments ?? 0}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Requires manual audit approval</p>
            </div>
          </div>

          {/* Revenue Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
              <div className="bg-muted/40 px-4 py-3 border-b border-border font-semibold text-xs text-foreground">
                Revenue by Commercial Plan
              </div>
              <div className="p-4 space-y-3">
                {analytics && Object.keys(analytics.revenue_by_plan || {}).length > 0 ? (
                  Object.entries(analytics.revenue_by_plan).map(([name, rev]: any) => (
                    <div key={name} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-foreground">{name}</span>
                      <span className="font-mono text-foreground font-bold">${Number(rev).toFixed(2)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">No plan revenue logged yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
              <div className="bg-muted/40 px-4 py-3 border-b border-border font-semibold text-xs text-foreground">
                Revenue by Settlement Currency
              </div>
              <div className="p-4 space-y-3">
                {analytics && Object.keys(analytics.revenue_by_currency || {}).length > 0 ? (
                  Object.entries(analytics.revenue_by_currency).map(([curr, rev]: any) => (
                    <div key={curr} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-foreground">{curr}</span>
                      <span className="font-mono text-foreground font-bold">${Number(rev).toFixed(2)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">No currency revenue logged yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PLAN MANAGEMENT */}
      {tab === "plans" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-foreground">Configured Billing Plans</h2>
            <Button
              size="sm"
              onClick={() => {
                setPlanForm({
                  code: "",
                  name: "",
                  monthly_price: 29,
                  yearly_price: 290,
                  max_assistants: 5,
                  max_documents: 100,
                  max_chat_turns_monthly: 2500,
                  max_storage_mb: 500,
                  is_active: true,
                  is_public: true,
                });
                setCreatingPlan(true);
                setEditingPlan(null);
              }}
              className="gap-1.5 text-xs font-semibold"
            >
              <Plus className="h-4 w-4" />
              Add Plan
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-foreground text-sm">{p.name}</h3>
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">{p.code}</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${p.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                    {p.is_active ? "Active" : "Archived"}
                  </span>
                </div>

                <div className="text-xl font-bold font-mono text-foreground">
                  ${p.monthly_price} <span className="text-xs font-normal text-muted-foreground">/mo</span>
                </div>

                <div className="text-xs space-y-1 text-muted-foreground border-t border-border pt-3">
                  <div>Assistants: <strong>{p.max_assistants}</strong></div>
                  <div>Documents: <strong>{p.max_documents}</strong></div>
                  <div>Queries: <strong>{p.max_chat_turns_monthly.toLocaleString()}</strong></div>
                  <div>Storage: <strong>{p.max_storage_mb} MB</strong></div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPlanForm(p);
                    setEditingPlan(p);
                    setCreatingPlan(false);
                  }}
                  className="w-full text-xs font-semibold"
                >
                  Configure Limits
                </Button>
              </div>
            ))}
          </div>

          {/* Modal / Form for Editing / Creating Plan */}
          {(creatingPlan || editingPlan) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="rounded-xl border border-border bg-card p-6 w-full max-w-lg space-y-4 shadow-lift max-h-[90vh] overflow-y-auto">
                <h3 className="font-bold text-foreground text-sm">
                  {creatingPlan ? "Create Dynamic Plan" : `Configure Plan: ${editingPlan?.name}`}
                </h3>
                <form onSubmit={handleSavePlan} className="space-y-4 text-xs">
                  {creatingPlan && (
                    <div className="space-y-1">
                      <label className="font-semibold text-foreground">Plan Code (slug)</label>
                      <Input
                        required
                        value={planForm.code || ""}
                        onChange={(e) => setPlanForm({ ...planForm, code: e.target.value.toLowerCase().trim() })}
                        placeholder="e.g. enterprise_plus"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Display Name</label>
                    <Input
                      required
                      value={planForm.name || ""}
                      onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                      placeholder="e.g. Enterprise Plus"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-semibold text-foreground">Monthly Price ($)</label>
                      <Input
                        type="number"
                        step="0.01"
                        required
                        value={planForm.monthly_price ?? 0}
                        onChange={(e) => setPlanForm({ ...planForm, monthly_price: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-foreground">Yearly Price ($)</label>
                      <Input
                        type="number"
                        step="0.01"
                        required
                        value={planForm.yearly_price ?? 0}
                        onChange={(e) => setPlanForm({ ...planForm, yearly_price: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-semibold text-foreground">Max Assistants</label>
                      <Input
                        type="number"
                        required
                        value={planForm.max_assistants ?? 2}
                        onChange={(e) => setPlanForm({ ...planForm, max_assistants: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-foreground">Max Documents</label>
                      <Input
                        type="number"
                        required
                        value={planForm.max_documents ?? 10}
                        onChange={(e) => setPlanForm({ ...planForm, max_documents: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-semibold text-foreground">Monthly Queries Limit</label>
                      <Input
                        type="number"
                        required
                        value={planForm.max_chat_turns_monthly ?? 100}
                        onChange={(e) => setPlanForm({ ...planForm, max_chat_turns_monthly: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-foreground">Max Storage (MB)</label>
                      <Input
                        type="number"
                        required
                        value={planForm.max_storage_mb ?? 50}
                        onChange={(e) => setPlanForm({ ...planForm, max_storage_mb: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setCreatingPlan(false);
                        setEditingPlan(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">
                      Save Plan
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SUBSCRIPTIONS */}
      {tab === "subscriptions" && (
        <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-muted/40 px-4 py-3 border-b border-border flex justify-between items-center text-xs font-semibold">
            <span>Customer Subscriptions</span>
            <span className="font-mono text-muted-foreground">Total: {subscriptions.length}</span>
          </div>
          <div className="divide-y divide-border/60">
            {subscriptions.length > 0 ? (
              subscriptions.map((s) => (
                <div key={s.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground text-sm">{s.user_email || "Customer"}</span>
                      <span className="rounded bg-primary/10 text-primary px-2 py-0.5 font-bold uppercase text-[10px]">
                        {s.plan_name}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-[11px] mt-0.5">
                      Period: {new Date(s.current_period_start).toLocaleDateString()} — {new Date(s.current_period_end).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${s.status === "active" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                      {s.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">No subscriptions registered.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: TRANSACTIONS & REVIEW */}
      {tab === "transactions" && (
        <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-muted/40 px-4 py-3 border-b border-border flex justify-between items-center text-xs font-semibold">
            <span>Payment Transactions & Blockchain Settlement</span>
            <span className="font-mono text-muted-foreground">Total: {transactions.length}</span>
          </div>

          <div className="divide-y divide-border/60">
            {transactions.length > 0 ? (
              transactions.map((tx) => (
                <div key={tx.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono text-foreground">{tx.order_number}</span>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">{tx.provider}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                        tx.status === "completed"
                          ? "bg-success/15 text-success"
                          : tx.status === "under_review"
                          ? "bg-warning/15 text-warning"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {tx.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      User: <strong>{tx.user_email || "Customer"}</strong> • Plan: {tx.plan_name}
                    </div>
                    {tx.blockchain_txid && (
                      <div className="text-[10px] font-mono text-signal truncate max-w-sm">
                        Tx Hash: {tx.blockchain_txid}
                      </div>
                    )}
                    {tx.review_reason && (
                      <div className="text-[11px] text-destructive">
                        Flag: {tx.review_reason}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-mono font-bold text-foreground text-sm">
                        ${tx.amount} {tx.currency}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString()}
                      </div>
                    </div>

                    {tx.status === "under_review" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setReviewingTx(tx);
                          setReviewAction("approve");
                          setReviewNotes("");
                        }}
                        className="text-xs font-semibold text-warning"
                      >
                        Audit Review
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">No payment transactions recorded.</p>
            )}
          </div>

          {/* Audit Review Modal */}
          {reviewingTx && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="rounded-xl border border-border bg-card p-6 w-full max-w-md space-y-4 shadow-lift">
                <h3 className="font-bold text-foreground text-sm">
                  Manual Transaction Review: {reviewingTx.order_number}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Reason for review: <strong>{reviewingTx.review_reason || "Flagged payment"}</strong>
                </p>

                <form onSubmit={handleReviewTransaction} className="space-y-4 text-xs">
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Action</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="action"
                          checked={reviewAction === "approve"}
                          onChange={() => setReviewAction("approve")}
                        />
                        <span className="font-bold text-success">Approve & Unlock Entitlements</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="action"
                          checked={reviewAction === "reject"}
                          onChange={() => setReviewAction("reject")}
                        />
                        <span className="font-bold text-destructive">Reject Payment</span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Audit Reason & Notes</label>
                    <Input
                      required
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="e.g. Verified customer txid manually on Polygon explorer"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setReviewingTx(null)}>
                      Cancel
                    </Button>
                    <Button type="submit">Submit Resolution</Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: RAMPEX PROVIDER CONFIG */}
      {tab === "provider" && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-6 shadow-xs max-w-2xl">
          <div className="flex justify-between items-center pb-4 border-b border-border">
            <div className="space-y-1">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Rampex Payment Gateway Settings
              </h2>
              <p className="text-xs text-muted-foreground">
                Server-side credential status and live endpoint health test.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success border border-success/30">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Provider Registered
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-border/50">
              <span className="text-muted-foreground">API Base URL</span>
              <span className="font-mono text-foreground">{rampexSettings?.api_base_url || "https://api.rampex.io"}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/50">
              <span className="text-muted-foreground">Configured Key Prefix</span>
              <span className="font-mono text-foreground">{rampexSettings?.key_prefix || "Configured in Environment"}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/50">
              <span className="text-muted-foreground">Webhook Verification Endpoint</span>
              <span className="font-mono text-foreground">POST /api/v1/webhooks/rampex</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Supported Fiat & Crypto</span>
              <span className="font-mono text-foreground">USD, EUR, GBP, USDC, USDT</span>
            </div>
          </div>

          {/* Test Connectivity */}
          <div className="pt-4 border-t border-border space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground text-xs">Live API Connectivity Test</h3>
                <p className="text-[11px] text-muted-foreground">
                  Validates the server-side API key against Rampex /api-validate-key
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleTestRampex}
                disabled={testingConnection}
                className="gap-1.5 text-xs font-semibold"
              >
                {testingConnection ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                Test Connection
              </Button>
            </div>

            {connTestResult && (
              <div className={`p-4 rounded-lg border text-xs ${connTestResult.valid ? "bg-success/10 border-success/30 text-success" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
                <div className="font-bold">
                  {connTestResult.valid ? "Connection Successful!" : "Connection Failed"}
                </div>
                <div className="mt-1 font-mono text-[11px]">
                  {connTestResult.message || connTestResult.error}
                </div>
                {connTestResult.business_name && (
                  <div className="mt-1 text-muted-foreground">
                    Merchant: {connTestResult.business_name} ({connTestResult.key_name})
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
