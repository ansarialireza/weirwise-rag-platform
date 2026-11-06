"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ArrowUpDown,
  Filter,
  Eye,
  X,
  Copy,
  Check,
  Shield,
  Key,
  Users,
  Cpu,
  SlidersHorizontal,
  FileCode,
  FileText,
  Clock,
  Laptop,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface AuditLog {
  id: string;
  action: string;
  actor_email: string;
  target_entity: string;
  target_id?: string | null;
  ip_address?: string | null;
  created_at: string;
  details?: Record<string, any>;
}

const PAGE_SIZE = 30;

type ActionCategory = "all" | "user" | "security" | "provider" | "operations";
type SortDirection = "desc" | "asc";

/**
 * Humanizes raw action identifier strings into clear titles and badges.
 */
function getActionMeta(action: string) {
  const lower = action.toLowerCase();
  if (lower.startsWith("user.activate")) {
    return {
      title: "Activate User Account",
      category: "user" as ActionCategory,
      badgeColor: "bg-success/10 text-success border-success/20",
      icon: Users,
    };
  }
  if (lower.startsWith("user.suspend")) {
    return {
      title: "Suspend User Account",
      category: "user" as ActionCategory,
      badgeColor: "bg-destructive/10 text-destructive border-destructive/20",
      icon: Users,
    };
  }
  if (lower.startsWith("credential.delete") || lower.startsWith("credential.purge")) {
    return {
      title: "Delete Vault Credential",
      category: "security" as ActionCategory,
      badgeColor: "bg-destructive/10 text-destructive border-destructive/20",
      icon: Key,
    };
  }
  if (lower.startsWith("credential.add") || lower.startsWith("credential.create")) {
    return {
      title: "Add Vault Credential",
      category: "security" as ActionCategory,
      badgeColor: "bg-info/10 text-info border-info/20",
      icon: Key,
    };
  }
  if (lower.startsWith("provider.tokens_updated") || lower.startsWith("provider.create")) {
    return {
      title: "Update Provider Credentials",
      category: "provider" as ActionCategory,
      badgeColor: "bg-info/10 text-info border-info/20",
      icon: Cpu,
    };
  }
  if (lower.includes("operations.settings") || lower.startsWith("operations.")) {
    return {
      title: "Update Operations Policy",
      category: "operations" as ActionCategory,
      badgeColor: "bg-warning/10 text-warning border-warning/20",
      icon: SlidersHorizontal,
    };
  }
  if (lower.startsWith("member.")) {
    return {
      title: lower.replace(".", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      category: "user" as ActionCategory,
      badgeColor: "bg-muted text-foreground border-border/70",
      icon: Users,
    };
  }

  return {
    title: action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    category: "operations" as ActionCategory,
    badgeColor: "bg-muted text-muted-foreground border-border/60",
    icon: Shield,
  };
}

/**
 * Summarizes the event payload into a single human-readable line for fast scanning.
 */
function getEventSummary(log: AuditLog): string {
  const d = log.details || {};
  const action = log.action.toLowerCase();

  if (action === "user.suspend" || action === "user.activate") {
    return `${d.email || log.target_id || "Account"} set to ${d.is_active ? "Active" : "Suspended"}`;
  }
  if (action === "admin.operations.settings_updated") {
    const changes: string[] = [];
    if (d.after?.emergency_stop !== d.before?.emergency_stop) {
      changes.push(`Emergency stop: ${d.after?.emergency_stop ? "ENABLED" : "Disabled"}`);
    }
    if (d.after?.management_mode !== d.before?.management_mode) {
      changes.push(`Mode: ${d.after?.management_mode}`);
    }
    if (changes.length > 0) return changes.join(" • ");
    return "Operations threshold & recovery rules updated";
  }
  if (action === "provider.tokens_updated") {
    return `${d.provider ? d.provider.toUpperCase() : "Provider"}: ${d.token_count ?? 1} token(s) validated`;
  }
  if (action === "credential.delete") {
    return `Purged token "${d.label || log.target_id || "credential"}" from vault`;
  }
  if (d.description) {
    return String(d.description);
  }

  // Fallback: extract primary scalar key-values
  const keys = Object.keys(d);
  if (keys.length === 0) return "No payload parameters logged";
  const preview = keys
    .slice(0, 2)
    .filter((k) => typeof d[k] !== "object")
    .map((k) => `${k}: ${d[k]}`)
    .join(", ");
  return preview || `${keys.length} parameter(s) recorded`;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ActionCategory>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  // Pagination
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Modal Inspector
  const [inspectLog, setInspectLog] = useState<AuditLog | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"structured" | "raw">("structured");
  const [copiedRaw, setCopiedRaw] = useState(false);

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

  // Extract unique entities for filter dropdown
  const availableEntities = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((log) => {
      if (log.target_entity) set.add(log.target_entity);
    });
    return Array.from(set);
  }, [logs]);

  // Filtered & Sorted logs for the current table view
  const processedLogs = useMemo(() => {
    let result = [...logs];

    // Filter by category
    if (categoryFilter !== "all") {
      result = result.filter((l) => getActionMeta(l.action).category === categoryFilter);
    }

    // Filter by target entity
    if (entityFilter !== "all") {
      result = result.filter((l) => l.target_entity === entityFilter);
    }

    // Sort by timestamp
    result.sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === "asc" ? diff : -diff;
    });

    return result;
  }, [logs, categoryFilter, entityFilter, sortDir]);

  const handleCopyRawJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  const isFiltered = categoryFilter !== "all" || entityFilter !== "all" || debouncedSearch !== "";

  const resetFilters = () => {
    setCategoryFilter("all");
    setEntityFilter("all");
    setSearchTerm("");
    setDebouncedSearch("");
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 pb-5 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Security Audit Trail
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted border border-border/70 text-muted-foreground uppercase font-semibold">
              Immutable Ledger
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Every administrative and security action.
          </p>
        </div>

        <div className="flex items-center gap-2">
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
      </div>

      {/* Structured Filter, Search & Navigation Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Left Side: Search + Category Pills + Entity Select */}
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search action, actor email, or entity..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-border/70 bg-card py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
          </div>

          {/* Action Category Segmented Control */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase font-mono mr-1">Scope:</span>
            <div className="inline-flex rounded-md border border-border/70 bg-card p-0.5 text-xs">
              {(
                [
                  ["all", "All Events"],
                  ["user", "Users"],
                  ["security", "Credentials"],
                  ["provider", "AI Providers"],
                  ["operations", "Operations"],
                ] as const
              ).map(([cat, label]) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    categoryFilter === cat
                      ? "bg-muted text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Target Entity Dropdown */}
          {availableEntities.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground uppercase font-mono">Entity:</span>
              <select
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                className="h-7 rounded-md border border-border/70 bg-card px-2 text-[11px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              >
                <option value="all">All Entities</option>
                {availableEntities.map((ent) => (
                  <option key={ent} value={ent}>
                    {ent}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reset Filters button if active */}
          {isFiltered && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] font-mono text-muted-foreground hover:text-destructive flex items-center gap-1 px-1.5 py-1 rounded transition-colors"
            >
              <X className="h-3 w-3" />
              Reset Filters
            </button>
          )}
        </div>

        {/* Right Side: Sorting Toggle + Top Pagination */}
        <div className="flex items-center justify-between lg:justify-end gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            className="hover:text-foreground inline-flex items-center gap-1.5 font-mono text-[11px] px-2 py-1 rounded border border-border/70 bg-card"
            title="Toggle timestamp sorting direction"
          >
            <span>{sortDir === "desc" ? "Newest First" : "Oldest First"}</span>
            <ArrowUpDown className="h-3 w-3 text-primary" />
          </button>

          <div className="flex items-center gap-1.5">
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
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Professional Audit Table Container */}
      <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
        {/* Table Column Header */}
        <div className="bg-muted/50 px-4 py-2.5 border-b border-border/70 hidden md:grid grid-cols-12 gap-3 text-[11px] font-semibold text-muted-foreground">
          <div className="col-span-3">Event</div>
          <div className="col-span-3">Details</div>
          <div className="col-span-2">Actor</div>
          <div className="col-span-2">Resource</div>
          <div className="col-span-2 text-right">When</div>
        </div>

        {/* Table body: fixed-height scroll region so loading rows and data rows
            occupy the same space and the pagination bar never jumps. */}
        <div className="min-h-[360px] max-h-[calc(100vh-320px)] overflow-y-auto">
          {loading ? (
            <div className="divide-y divide-border/60" aria-hidden="true">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="px-4 py-3">
                  <div className="hidden md:grid grid-cols-12 gap-3 items-center h-8">
                    <div className="col-span-3 space-y-2">
                      <div className="h-3 w-32 rounded bg-muted animate-pulse" />
                      <div className="h-2.5 w-20 rounded bg-muted/70 animate-pulse" />
                    </div>
                    <div className="col-span-3 space-y-2">
                      <div className="h-3 w-40 rounded bg-muted animate-pulse" />
                      <div className="h-2.5 w-24 rounded bg-muted/70 animate-pulse" />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <div className="h-3 w-28 rounded bg-muted animate-pulse" />
                      <div className="h-2.5 w-20 rounded bg-muted/70 animate-pulse" />
                    </div>
                    <div className="col-span-2">
                      <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                    </div>
                  </div>
                  <div className="md:hidden space-y-2 py-1">
                    <div className="h-3 w-40 rounded bg-muted animate-pulse" />
                    <div className="h-2.5 w-56 rounded bg-muted/70 animate-pulse" />
                    <div className="h-2.5 w-32 rounded bg-muted/70 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : processedLogs.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
              <Shield className="h-6 w-6 text-muted-foreground/40 mx-auto" />
              <p className="font-medium text-foreground">No audit records found matching your filters.</p>
              {isFiltered && (
                <Button variant="outline" size="sm" onClick={resetFilters} className="text-xs h-7">
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
          <div className="divide-y divide-border/60">
            {processedLogs.map((log) => {
              const meta = getActionMeta(log.action);
              const summary = getEventSummary(log);
              const Icon = meta.icon;

              return (
                <div
                  key={log.id}
                  className="px-4 py-3 hover:bg-muted/30 transition-colors text-xs"
                >
                  {/* Desktop Grid Layout */}
                  <div className="hidden md:grid grid-cols-12 gap-3 items-center">
                    {/* Event & Action */}
                    <div className="col-span-3 min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono font-medium ${meta.badgeColor}`}>
                          <Icon className="h-3 w-3" />
                          <span>{meta.title}</span>
                        </span>
                      </div>
                      <span className="block font-mono text-[11px] text-muted-foreground mt-1 truncate">
                        {log.action}
                      </span>
                    </div>

                    {/* Summary / Changes */}
                    <div className="col-span-3 min-w-0 pr-2">
                      <span className="text-foreground font-medium block truncate text-xs" title={summary}>
                        {summary}
                      </span>
                      {log.target_id && (
                        <span className="text-[10px] font-mono text-muted-foreground truncate block mt-0.5">
                          ID: #{log.target_id.slice(0, 16)}
                        </span>
                      )}
                    </div>

                    {/* Actor */}
                    <div className="col-span-2 min-w-0 pr-2">
                      <span className="font-mono text-foreground font-medium block truncate text-xs">
                        {log.actor_email}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono block mt-0.5">
                        {log.ip_address || "Internal System"}
                      </span>
                    </div>

                    {/* Target Entity */}
                    <div className="col-span-2 min-w-0 pr-2">
                      <span className="inline-block px-1.5 py-0.2 rounded bg-muted/60 text-muted-foreground border border-border/70 text-[10px] font-mono uppercase font-medium">
                        {log.target_entity}
                      </span>
                    </div>

                    {/* Timestamp & Inspect CTA */}
                    <div className="col-span-2 flex items-center justify-end gap-3 text-right">
                      <div className="min-w-0">
                        <div className="font-mono text-[11px] text-foreground font-medium">
                          {new Date(log.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                          {new Date(log.created_at).toLocaleDateString()}
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setInspectLog(log);
                          setInspectorTab("structured");
                        }}
                        className="h-7 px-2 text-xs border-border/80 hover:bg-accent shrink-0 text-muted-foreground hover:text-foreground"
                        title="Inspect full audit record"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Inspect
                      </Button>
                    </div>
                  </div>

                  {/* Mobile & Small Screen Card Layout (Smart Adaptation) */}
                  <div className="md:hidden space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono font-medium ${meta.badgeColor}`}>
                          <Icon className="h-3 w-3" />
                          <span>{meta.title}</span>
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.2 rounded bg-muted border border-border/60">
                          {log.target_entity}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    <p className="text-foreground font-medium text-xs break-words">
                      {summary}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                      <span className="font-mono truncate max-w-[200px]">{log.actor_email}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setInspectLog(log);
                          setInspectorTab("structured");
                        }}
                        className="h-6 px-1.5 text-[11px] font-mono text-accent-strong hover:text-accent-strong/90"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Inspect
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>

        {/* Bottom Pagination Bar */}
        <div className="bg-muted/30 px-4 py-2.5 border-t border-border/70 flex items-center justify-between text-xs text-muted-foreground">
          <span className="text-[11px]">
            {processedLogs.length} of {logs.length}
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

      {/* Redesigned Structured Security Event Inspector Modal */}
      {inspectLog && (
        <Modal
          isOpen={Boolean(inspectLog)}
          onClose={() => setInspectLog(null)}
          title="Security Event Inspector"
          description="Detailed forensic metadata recorded for this immutable audit ledger entry."
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            {/* Event Header Banner */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/70 bg-muted/20 flex-wrap gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`p-1.5 rounded border ${getActionMeta(inspectLog.action).badgeColor}`}>
                  <Shield className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-foreground text-sm truncate">
                    {getActionMeta(inspectLog.action).title}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground truncate">
                    {inspectLog.action}
                  </div>
                </div>
              </div>

              {/* Inspector Mode Switcher */}
              <div className="inline-flex rounded-md border border-border/70 bg-card p-0.5 text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setInspectorTab("structured")}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    inspectorTab === "structured"
                      ? "bg-muted text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Structured View
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab("raw")}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    inspectorTab === "raw"
                      ? "bg-muted text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Raw Technical JSON
                </button>
              </div>
            </div>

            {/* Structured Tab Content */}
            {inspectorTab === "structured" && (
              <div className="space-y-4">
                {/* Core Event Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border border-border/70 bg-card">
                    <span className="text-muted-foreground text-[10px] uppercase font-mono block">Actor (Administrator)</span>
                    <span className="font-mono font-medium text-foreground text-xs block mt-1 truncate">
                      {inspectLog.actor_email}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-border/70 bg-card">
                    <span className="text-muted-foreground text-[10px] uppercase font-mono block">Target Resource</span>
                    <span className="font-mono text-foreground text-xs block mt-1 truncate">
                      {inspectLog.target_entity} {inspectLog.target_id ? `(#${inspectLog.target_id})` : ""}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-border/70 bg-card">
                    <span className="text-muted-foreground text-[10px] uppercase font-mono block">Recorded Timestamp</span>
                    <span className="font-mono text-foreground text-xs block mt-1">
                      {new Date(inspectLog.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-border/70 bg-card">
                    <span className="text-muted-foreground text-[10px] uppercase font-mono block">Origin IP Address</span>
                    <span className="font-mono text-foreground text-xs block mt-1">
                      {inspectLog.ip_address || "127.0.0.1 (Local / Container Gateway)"}
                    </span>
                  </div>
                </div>

                {/* State Transition / Details Inspector */}
                <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
                  <div className="bg-muted/40 px-3.5 py-2 border-b border-border/70 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground uppercase font-mono">
                      Event Payload & Parameters
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {Object.keys(inspectLog.details || {}).length} parameter(s)
                    </span>
                  </div>

                  <div className="p-3.5 space-y-3">
                    {/* Check if state before/after exists */}
                    {inspectLog.details?.before && inspectLog.details?.after ? (
                      <div className="space-y-3">
                        <div className="text-[11px] text-muted-foreground">
                          State mutation comparison before and after event execution:
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[11px]">
                          <div className="p-2.5 rounded bg-muted/20 border border-border/60 space-y-1">
                            <span className="text-destructive font-semibold block text-[10px] uppercase">State Before</span>
                            <pre className="text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(inspectLog.details.before, null, 2)}
                            </pre>
                          </div>
                          <div className="p-2.5 rounded bg-muted/20 border border-border/60 space-y-1">
                            <span className="text-success font-semibold block text-[10px] uppercase">State After</span>
                            <pre className="text-foreground overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(inspectLog.details.after, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {Object.entries(inspectLog.details || {}).map(([key, val]) => (
                          <div key={key} className="p-2.5 rounded-md border border-border/60 bg-muted/20 font-mono">
                            <span className="text-muted-foreground text-[10px] uppercase block">{key}</span>
                            <span className="text-foreground text-xs font-medium block mt-0.5 break-all">
                              {typeof val === "boolean"
                                ? val ? "true (Enabled)" : "false (Disabled)"
                                : typeof val === "object"
                                ? JSON.stringify(val)
                                : String(val)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Raw JSON Technical Inspector */}
            {inspectorTab === "raw" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Cryptographically signed event ledger representation</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyRawJson(inspectLog)}
                    className="h-6 px-2 text-[10px] font-mono border-border/70"
                  >
                    {copiedRaw ? (
                      <>
                        <Check className="h-3 w-3 mr-1 text-success" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 mr-1" /> Copy JSON
                      </>
                    )}
                  </Button>
                </div>
                <pre className="p-3.5 rounded-lg bg-background border border-border/70 font-mono text-[11px] text-foreground overflow-x-auto max-h-80 leading-relaxed select-all">
                  {JSON.stringify(inspectLog, null, 2)}
                </pre>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-border/70">
              <span className="text-[10px] font-mono text-muted-foreground">
                Ledger ID: {inspectLog.id}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInspectLog(null)}
                className="text-xs"
              >
                Close Inspector
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
