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
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminFinOpsPage() {
  const [finops, setFinops] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getFinOpsSummary();
      setFinops(data);
    } catch (err) {
      console.error(err);
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
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            FinOps &amp; Revenue Intelligence
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Persisted invoice revenue, AI compute expenditure, gross margin analysis, and provider unit economics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!finops}>
            <Download className="h-3.5 w-3.5" /> Export Financial CSV
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} isLoading={loading}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Financial Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-2">
          <span className="text-xs text-muted-foreground font-medium">Total Billed Revenue</span>
          <div className="text-2xl font-bold font-mono text-foreground">
            ${finops ? finops.total_revenue_usd.toFixed(2) : "0.00"}
          </div>
          <span className="text-[11px] text-muted-foreground">Invoiced customer subscriptions</span>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-2">
          <span className="text-xs text-muted-foreground font-medium">Total AI Compute Spend</span>
          <div className="text-2xl font-bold font-mono text-primary">
            ${finops ? finops.total_cost_usd.toFixed(4) : "0.0000"}
          </div>
          <span className="text-[11px] text-muted-foreground">Provider micro-billing ledger</span>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-2">
          <span className="text-xs text-muted-foreground font-medium">Gross Operating Profit</span>
          <div className="text-2xl font-bold font-mono text-emerald-500">
            ${finops ? finops.gross_profit_usd.toFixed(2) : "0.00"}
          </div>
          <span className="text-[11px] text-muted-foreground">Revenue minus AI compute cost</span>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-2">
          <span className="text-xs text-muted-foreground font-medium">Gross Margin</span>
          <div className="text-2xl font-bold font-mono text-emerald-500">
            {finops ? `${finops.gross_margin_pct}%` : "0%"}
          </div>
          <span className="text-[11px] text-muted-foreground">Unit economics efficiency</span>
        </div>
      </div>

      {/* Cost Breakdowns by Provider & Model */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" /> Cost by Provider
          </h3>
          {finops && Object.keys(finops.cost_by_provider).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(finops.cost_by_provider).map(([provider, cost]) => (
                <div key={provider} className="flex justify-between p-2.5 rounded-lg border border-border bg-secondary/20 text-xs font-mono">
                  <span className="capitalize text-foreground font-semibold">{provider}</span>
                  <span className="text-primary font-bold">${Number(cost).toFixed(4)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground p-4 text-center">No provider cost entries logged yet.</p>
          )}
        </div>

        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" /> Tokens by Provider
          </h3>
          {finops && Object.keys(finops.tokens_by_provider).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(finops.tokens_by_provider).map(([provider, tokens]) => (
                <div key={provider} className="flex justify-between p-2.5 rounded-lg border border-border bg-secondary/20 text-xs font-mono">
                  <span className="capitalize text-foreground font-semibold">{provider}</span>
                  <span className="text-foreground font-bold">{Number(tokens).toLocaleString()} tokens</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground p-4 text-center">No token consumption logged yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
