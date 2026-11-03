"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  DollarSign,
  TrendingUp,
  PieChart,
  Layers,
  Cpu,
  Download,
  AlertTriangle,
  RefreshCw,
  Wallet,
  Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminFinOpsPage() {
  const [finops, setFinops] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
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
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExportCSV = () => {
    if (!finops) return;
    const csvContent =
      "data:text/csv;charset=utf-8," +
      "Metric,Value\n" +
      `Total Revenue USD,${finops.total_revenue_usd}\n` +
      `Total Cost USD,${finops.total_cost_usd}\n` +
      `Gross Profit USD,${finops.gross_profit_usd}\n` +
      `Gross Margin Pct,${finops.gross_margin_pct}%\n`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `weirwise_finops_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* GitHub-style Header */}
      <div className="flex flex-col gap-3 pb-5 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              FinOps & Token Economics
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">
              Live Billing
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time tracking of platform subscription revenue, underlying AI model inference costs, and profit margins.
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

      {/* GitHub-style Financial Overview Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-border/70 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Total Revenue</span>
            <DollarSign className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight font-mono">
            ${finops ? finops.total_revenue_usd.toFixed(2) : "0.00"}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Billed customer subscriptions
          </p>
        </div>

        <div className="rounded-md border border-border/70 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Inference Costs</span>
            <Cpu className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight font-mono text-rose-500">
            ${finops ? finops.total_cost_usd.toFixed(4) : "0.0000"}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Provider token expenditure
          </p>
        </div>

        <div className="rounded-md border border-border/70 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Net Margin</span>
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight font-mono text-emerald-500">
            {finops ? `${finops.gross_margin_pct}%` : "0.0%"}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Platform gross margin
          </p>
        </div>

        <div className="rounded-md border border-border/70 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Net Profit</span>
            <Wallet className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight font-mono">
            ${finops ? finops.gross_profit_usd.toFixed(2) : "0.00"}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Revenue minus AI costs
          </p>
        </div>
      </div>

      {/* Breakdown Tables in GitHub Box Style */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cost by Provider */}
        <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
          <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">
              Cost Breakdown by AI Provider
            </h3>
            <span className="text-[10px] font-mono text-muted-foreground uppercase">USD</span>
          </div>
          <div className="p-4">
            {finops && Object.keys(finops.cost_by_provider || {}).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(finops.cost_by_provider).map(([provider, cost]: [string, any]) => (
                  <div key={provider} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground capitalize font-mono">{provider}</span>
                    <span className="font-mono text-muted-foreground">${Number(cost).toFixed(4)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No provider costs logged yet.</p>
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
          <div className="p-4">
            {finops && Object.keys(finops.cost_by_model || {}).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(finops.cost_by_model).map(([model, cost]: [string, any]) => (
                  <div key={model} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground font-mono">{model}</span>
                    <span className="font-mono text-muted-foreground">${Number(cost).toFixed(4)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No model expenditure logged yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
