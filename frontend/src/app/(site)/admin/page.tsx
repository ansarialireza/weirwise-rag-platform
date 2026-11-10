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
  ShieldCheck,
  Server,
  Layers,
  Zap,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface AdminStats {
  active_users?: number;
  total_users?: number;
  users_count?: number;
  total_documents_vectorized?: number;
  documents_count?: number;
  total_storage_bytes?: number;
  storage_used_bytes?: number;
  assistants_count?: number;
  total_tokens_burned?: number;
  total_ai_spend_usd?: number;
  total_queries_answered?: number;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, activityData] = await Promise.all([
        api.getAdminStats(),
        api.getAdminActivityLedger(20),
      ]);
      setStats(statsData);
      setActivity(activityData);
    } catch (err: any) {
      setError(err.message || "We couldn't load platform data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalUsers = stats?.total_users ?? stats?.users_count ?? 0;
  const activeUsers = stats?.active_users ?? totalUsers;
  const totalDocs = stats?.total_documents_vectorized ?? stats?.documents_count ?? 0;
  const storageBytes = stats?.total_storage_bytes ?? stats?.storage_used_bytes ?? 0;
  const totalTokens = stats?.total_tokens_burned ?? 0;
  const totalQueries = stats?.total_queries_answered ?? 0;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 pb-5 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Overview
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-success/10 text-success border border-success/20 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Operational
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Usage, storage and activity across the platform.
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
          <Link
            href="/admin/operations"
            className="inline-flex items-center justify-center h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
          >
            Platform settings
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Accounts */}
        <div className="rounded-md border border-border/70 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Users</span>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight font-mono text-foreground">
            {loading ? "..." : totalUsers.toLocaleString()}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {loading ? "Loading..." : `${activeUsers.toLocaleString()} active`}
          </p>
        </div>

        {/* Vectorized Documents */}
        <div className="rounded-md border border-border/70 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Documents</span>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight font-mono text-foreground">
            {loading ? "..." : totalDocs.toLocaleString()}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Ready to answer questions
          </p>
        </div>

        {/* Storage Used */}
        <div className="rounded-md border border-border/70 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Storage</span>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight font-mono text-foreground">
            {loading ? "..." : formatBytes(storageBytes)}
          </div>
        </div>

        {/* Inference Queries Served */}
        <div className="rounded-md border border-border/70 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Queries</span>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight font-mono text-foreground">
            {loading ? "..." : totalQueries.toLocaleString()}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground font-mono">
            {totalTokens.toLocaleString()} tokens
          </p>
        </div>
      </div>

      {/* Activity Feed Container */}
      <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
        <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-foreground tracking-tight">
              Recent System Activity
            </h2>
            <span className="text-[11px] font-mono text-muted-foreground px-1.5 py-0.2 rounded-full bg-muted border border-border/60">
              {activity.length}
            </span>
          </div>
          <Link
            href="/admin/audit"
            className="text-xs text-accent-strong hover:underline flex items-center gap-1 font-medium"
          >
            <span>View audit logs</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Activity Feed Table/Rows */}
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
            <p>Loading activity logs...</p>
          </div>
        ) : activity.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No system activity recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {activity.map((item, idx) => (
              <div
                key={item.id || idx}
                className="px-4 py-3 flex items-start justify-between text-xs hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-2.5 min-w-0 pr-4">
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary/70 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">
                        {item.actor_email || "System"}
                      </span>
                      <span className="text-muted-foreground font-mono text-[11px]">
                        {item.action}
                      </span>
                      {item.resource_type && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-mono border border-border/60">
                          {item.resource_type}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-xl font-mono">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground/80 shrink-0 font-mono">
                  {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
