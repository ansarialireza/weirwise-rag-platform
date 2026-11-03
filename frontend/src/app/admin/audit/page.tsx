"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import {
  History,
  Search,
  Shield,
  Activity,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuditLog {
  id: string;
  action: string;
  actor_email: string;
  target_entity: string;
  ip_address: string;
  created_at: string;
  details?: any;
}

const PAGE_SIZE = 30;

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const data = await api.getAdminAuditLogs(PAGE_SIZE + 1, offset, debouncedSearch);
      if (data.length > PAGE_SIZE) {
        setHasMore(true);
        setLogs(data.slice(0, PAGE_SIZE));
      } else {
        setHasMore(false);
        setLogs(data);
      }
    } catch (err: any) {
      setLogs([]);
      setError(err instanceof Error ? err.message : "Failed to load audit records.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-6">
      {/* GitHub-style Header */}
      <div className="flex flex-col gap-3 pb-5 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Security Audit Trail
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted border border-border/70 text-muted-foreground uppercase font-semibold">
              Append-Only
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Immutable log stream of administrative access, security events, and configuration updates.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadLogs}
          disabled={loading}
          className="h-8 text-xs font-medium border-border/80 hover:bg-accent self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Stream
        </Button>
      </div>

      {/* GitHub-style Search & Filter Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search action, actor email, or entity..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-md border border-border/70 bg-card py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
          />
        </div>

        {/* Pagination controls */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="h-7 px-2 text-xs border-border/80"
          >
            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
            Previous
          </Button>
          <span className="px-2 font-mono text-[11px]">
            Page {page}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore || loading}
            className="h-7 px-2 text-xs border-border/80"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* GitHub-style Box Table */}
      <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
        <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>
            {debouncedSearch ? `Search results for "${debouncedSearch}"` : `Showing ${(page - 1) * PAGE_SIZE + 1} - ${(page - 1) * PAGE_SIZE + logs.length}`}
          </span>
          <span className="font-mono text-[11px]">Audit Timestamp & IP</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
            <p>Streaming security records...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No audit records found matching your filter.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {logs.map((log) => (
              <div
                key={log.id}
                className="px-4 py-3 flex items-start justify-between gap-4 text-xs hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-2.5 min-w-0 pr-4">
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary/70 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">
                        {log.actor_email}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {log.action}
                      </span>
                      {log.target_entity && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-mono border border-border/60">
                          {log.target_entity}
                        </span>
                      )}
                    </div>
                    {log.details && (
                      <div className="mt-1 text-[11px] text-muted-foreground font-mono bg-muted/40 p-2 rounded border border-border/50 max-w-2xl overflow-x-auto">
                        {typeof log.details === "object" ? JSON.stringify(log.details) : log.details}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono text-[11px] text-foreground">
                    {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                    {log.ip_address || "127.0.0.1"} • {new Date(log.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bottom Pagination */}
        <div className="bg-muted/30 px-4 py-2.5 border-t border-border/70 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Audit logs are tamper-proof and retained permanently
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="h-7 px-2.5 text-xs border-border/80"
            >
              Previous
            </Button>
            <span className="text-xs font-mono px-2">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore || loading}
              className="h-7 px-2.5 text-xs border-border/80"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
