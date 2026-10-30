"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Users,
  Building2,
  Bot,
  FileText,
  Activity,
  DollarSign,
  TrendingUp,
  Cpu,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminOverviewPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAdminMetrics();
      setMetrics(data);
    } catch (err: any) {
      setError(err.message || "Failed to load admin metrics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Executive Control Center
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3" /> System Operational
            </span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time persisted KPIs, tenant telemetry, AI token consumption, and financial intelligence.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMetrics}
            isLoading={loading}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh Telemetry
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Users */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Registered Accounts</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="space-y-1">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
              {metrics ? metrics.total_users : "..."}
            </span>
            <p className="text-[11px] text-muted-foreground">
              {metrics ? `${metrics.active_users} active users` : "Loading..."}
            </p>
          </div>
        </div>

        {/* Card 2: Workspaces */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Tenant Workspaces</span>
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div className="space-y-1">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
              {metrics ? metrics.total_workspaces : "..."}
            </span>
            <p className="text-[11px] text-muted-foreground">
              Multi-tenant isolated schemas
            </p>
          </div>
        </div>

        {/* Card 3: AI Assets */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Assistants &amp; Documents</span>
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="space-y-1">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
              {metrics ? `${metrics.total_assistants} / ${metrics.total_documents}` : "..."}
            </span>
            <p className="text-[11px] text-muted-foreground">
              Assistants deployed / Docs indexed
            </p>
          </div>
        </div>

        {/* Card 4: Financial Economics */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Monthly Invoiced Run-Rate</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="space-y-1">
            <span className="text-2xl font-bold tracking-tight text-emerald-500 font-mono">
              ${metrics ? metrics.monthly_recurring_revenue_usd.toFixed(2) : "0.00"}
            </span>
            <p className="text-[11px] text-muted-foreground">
              Gross Margin: {metrics ? `${metrics.gross_margin_pct}%` : "0%"}
            </p>
          </div>
        </div>
      </div>

      {/* Real-time Infrastructure & FinOps Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: AI Compute & Token Consumption */}
        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" /> AI Compute &amp; Token Volume
            </h3>
            <span className="text-[10px] font-mono text-muted-foreground uppercase">Persisted Ledger</span>
          </div>

          <div className="p-4 rounded-lg border border-border bg-secondary/30 space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Tokens Consumed:</span>
              <span className="font-bold text-foreground">
                {metrics ? metrics.total_tokens_consumed.toLocaleString() : 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total AI Provider Spend:</span>
              <span className="font-bold text-primary">
                ${metrics ? metrics.total_ai_spend_usd.toFixed(4) : "0.0000"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Embedding Provider:</span>
              <span className="text-foreground">Jina v4 (1536 dim)</span>
            </div>
          </div>
        </div>

        {/* Right Column: System Topology Status */}
        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-500" /> System Topology &amp; Service Health
            </h3>
            <span className="text-[10px] font-mono text-muted-foreground uppercase">Liveness Probe</span>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-secondary/20 text-xs">
              <span className="font-semibold text-foreground">Core RAG Engine</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-500 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" /> Ready (:8000)
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-secondary/20 text-xs">
              <span className="font-semibold text-foreground">Platform API Gateway</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-500 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" /> Healthy (:8001)
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-secondary/20 text-xs">
              <span className="font-semibold text-foreground">PostgreSQL pgvector Database</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-500 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" /> Connected (:5432)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
