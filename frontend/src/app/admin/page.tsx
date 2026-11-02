"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import {
  Users,
  FileText,
  Activity,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  MessageSquare,
  HardDrive,
  Clock,
  ArrowRight,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, activityData] = await Promise.all([
        api.getAdminStats(),
        api.getAdminActivityLedger(25),
      ]);
      setStats(statsData);
      setActivity(activityData);
    } catch (err: any) {
      setError(err.message || "Failed to load command center data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            Mission Control
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live System
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Real-time infrastructure health, storage footprint, token burn, and global activity stream.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            isLoading={loading}
            className="rounded-xl h-9 px-3 text-xs font-semibold gap-1.5 bg-muted/40 hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh Telemetry
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4 Mission-Critical Metric Cards (Borderless, Soft Minimalism) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Active Users */}
        <div className="p-6 rounded-3xl bg-muted/20 border border-border/40 space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Active Users</span>
            <Users className="h-4 w-4 text-foreground" />
          </div>
          <div className="space-y-1">
            <span className="text-3xl font-extrabold tracking-tight text-foreground font-mono">
              {stats ? stats.active_users.toLocaleString() : "..."}
            </span>
            <p className="text-[11px] text-muted-foreground">
              {stats ? `${stats.total_users} registered platform accounts` : "Loading..."}
            </p>
          </div>
        </div>

        {/* Metric 2: Total Documents Vectorized */}
        <div className="p-6 rounded-3xl bg-muted/20 border border-border/40 space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Vectorized Documents</span>
            <HardDrive className="h-4 w-4 text-foreground" />
          </div>
          <div className="space-y-1">
            <span className="text-3xl font-extrabold tracking-tight text-foreground font-mono">
              {stats ? stats.total_documents_vectorized.toLocaleString() : "..."}
            </span>
            <p className="text-[11px] text-muted-foreground font-mono">
              {stats ? `${formatBytes(stats.total_storage_bytes || 0)} storage footprint` : "Loading..."}
            </p>
          </div>
        </div>

        {/* Metric 3: Total API Tokens Burned */}
        <div className="p-6 rounded-3xl bg-muted/20 border border-border/40 space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">API Tokens Burned</span>
            <Cpu className="h-4 w-4 text-foreground" />
          </div>
          <div className="space-y-1">
            <span className="text-3xl font-extrabold tracking-tight text-foreground font-mono">
              {stats ? stats.total_tokens_burned.toLocaleString() : "..."}
            </span>
            <p className="text-[11px] text-muted-foreground font-mono">
              {stats ? `$${stats.total_ai_spend_usd.toFixed(4)} total AI cost` : "Loading..."}
            </p>
          </div>
        </div>

        {/* Metric 4: Total Queries Answered */}
        <div className="p-6 rounded-3xl bg-muted/20 border border-border/40 space-y-3">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Queries Answered</span>
            <MessageSquare className="h-4 w-4 text-foreground" />
          </div>
          <div className="space-y-1">
            <span className="text-3xl font-extrabold tracking-tight text-foreground font-mono">
              {stats ? stats.total_queries_answered.toLocaleString() : "..."}
            </span>
            <p className="text-[11px] text-muted-foreground">
              Search &amp; AI answers delivered
            </p>
          </div>
        </div>
      </div>

      {/* Global Activity Ledger (Stripe-grade Data Density) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-base font-bold text-foreground">Global Activity Ledger</h2>
            <p className="text-xs text-muted-foreground">Real-time system events and tenant operational actions.</p>
          </div>
          <span className="text-xs font-mono text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            {activity.length} recent events
          </span>
        </div>

        {activity.length === 0 ? (
          <div className="rounded-3xl bg-muted/10 p-10 text-center text-xs text-muted-foreground">
            No system events recorded yet.
          </div>
        ) : (
          <div className="rounded-3xl bg-card border border-border/40 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/40 text-muted-foreground font-mono text-[10px] uppercase bg-muted/30">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Resource</th>
                    <th className="py-3 px-4">Event Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {activity.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(item.created_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-foreground whitespace-nowrap">
                        {item.actor_email}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-muted text-foreground">
                          {item.action}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-muted-foreground uppercase whitespace-nowrap">
                        {item.resource_type}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground truncate max-w-md">
                        {item.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
