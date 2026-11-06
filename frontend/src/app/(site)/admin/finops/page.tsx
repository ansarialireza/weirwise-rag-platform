"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import {
  DollarSign,
  TrendingUp,
  Cpu,
  Download,
  AlertTriangle,
  RefreshCw,
  Wallet,
  Coins,
  Layers,
  ArrowUpRight,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface FinOpsData {
  total_revenue_usd: number;
  total_cost_usd: number;
  gross_profit_usd: number;
  gross_margin_pct: number;
  cost_by_provider?: Record<string, number>;
  cost_by_model?: Record<string, number>;
  tokens_by_provider?: Record<string, number>;
}

export default function AdminFinOpsPage() {
  const [finops, setFinops] = useState<FinOpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getFinOpsSummary();
      setFinops(data);
    } catch (err) {
      setFinops(null);
      setError(err instanceof Error ? err.message : "Failed to load FinOps data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExportCSV = () => {
    if (!finops) return;
    const lines = [
      "Metric,Value",
      `Total Revenue USD,${finops.total_revenue_usd}`,
      `Total Inference Cost USD,${finops.total_cost_usd}`,
      `Gross Profit USD,${finops.gross_profit_usd}`,
      `Gross Margin Pct,${finops.gross_margin_pct}%`,
      "",
      "Provider,Cost USD,Tokens Burned",
    ];

    if (finops.cost_by_provider) {
      Object.entries(finops.cost_by_provider).forEach(([provider, cost]) => {
        const tokens = finops.tokens_by_provider?.[provider] || 0;
        lines.push(`${provider},${cost},${tokens}`);
      });
    }

    lines.push("");
    lines.push("Model,Cost USD");
    if (finops.cost_by_model) {
      Object.entries(finops.cost_by_model).forEach(([model, cost]) => {
        lines.push(`${model},${cost}`);
      });
    }

    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(lines.join("\n"));
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", `weirwise_finops_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const revenue = finops?.total_revenue_usd ?? 0;
  const cost = finops?.total_cost_usd ?? 0;
  const profit = finops?.gross_profit_usd ?? 0;
  const margin = finops?.gross_margin_pct ?? 0;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 pb-5 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              FinOps & Token Economics
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20 font-medium">
              Live Billing
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Revenue against inference spend, live.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 text-xs font-medium border-border/80 hover:bg-accent"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={!finops || loading}
            className="h-8 text-xs font-medium border-border/80 hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Revenue */}
        <div className="rounded-md border border-border/70 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Customer Revenue</span>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight font-mono text-foreground">
            {loading ? "..." : `$${revenue.toFixed(2)}`}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Billed customer subscriptions
          </p>
        </div>

        {/* Inference Expenditure */}
        <div className="rounded-md border border-border/70 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Inference Costs</span>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight font-mono text-destructive">
            {loading ? "..." : `$${cost.toFixed(4)}`}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Raw token inference spend
          </p>
        </div>

        {/* Gross Margin */}
        <div className="rounded-md border border-border/70 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Gross Margin</span>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className={`mt-2 text-2xl font-semibold tracking-tight font-mono ${margin >= 0 ? "text-success" : "text-destructive"}`}>
            {loading ? "..." : `${margin.toFixed(1)}%`}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Platform gross margin
          </p>
        </div>

        {/* Net Profit */}
        <div className="rounded-md border border-border/70 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Net AI Margin</span>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className={`mt-2 text-2xl font-semibold tracking-tight font-mono ${profit >= 0 ? "text-foreground" : "text-destructive"}`}>
            {loading ? "..." : `$${profit.toFixed(2)}`}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Revenue minus AI costs
          </p>
        </div>
      </div>

      {/* Breakdown Tables Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cost by Provider */}
        <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
          <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">
              Cost Breakdown by AI Provider
            </h3>
            <span className="text-[10px] font-mono text-muted-foreground uppercase">USD</span>
          </div>
          <div className="divide-y divide-border/60">
            {finops && Object.keys(finops.cost_by_provider || {}).length > 0 ? (
              Object.entries(finops.cost_by_provider || {}).map(([provider, providerCost]) => {
                const tokenCount = finops.tokens_by_provider?.[provider] || 0;
                return (
                  <div key={provider} className="px-4 py-3 flex items-center justify-between text-xs hover:bg-muted/30 transition-colors">
                    <div>
                      <span className="font-semibold text-foreground capitalize font-mono block">
                        {provider}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {tokenCount.toLocaleString()} tokens
                      </span>
                    </div>
                    <span className="font-mono text-foreground font-medium">
                      ${Number(providerCost).toFixed(4)}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">
                {loading ? "Loading provider breakdown..." : "No provider costs logged yet."}
              </p>
            )}
          </div>
        </div>

        {/* Cost by Model */}
        <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
          <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">
              Cost Breakdown by LLM Model
            </h3>
            <span className="text-[10px] font-mono text-muted-foreground uppercase">USD</span>
          </div>
          <div className="divide-y divide-border/60">
            {finops && Object.keys(finops.cost_by_model || {}).length > 0 ? (
              Object.entries(finops.cost_by_model || {}).map(([model, modelCost]) => (
                <div key={model} className="px-4 py-3 flex items-center justify-between text-xs hover:bg-muted/30 transition-colors">
                  <span className="font-mono text-foreground font-medium truncate pr-4">
                    {model}
                  </span>
                  <span className="font-mono text-foreground shrink-0 font-medium">
                    ${Number(modelCost).toFixed(4)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">
                {loading ? "Loading model breakdown..." : "No model expenditure logged yet."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
