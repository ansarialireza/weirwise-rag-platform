"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  workspaces_count: number;
  created_at: string;
}

const PAGE_SIZE = 50;

export default function AdminUsersPage() {
  const { user: currentAdmin } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Debounce search input to avoid spamming the backend
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset to page 1 on search
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      // Fetch PAGE_SIZE + 1 to know if there's a next page
      const data = await api.getAdminUsers(PAGE_SIZE + 1, offset, debouncedSearch);
      if (data.length > PAGE_SIZE) {
        setHasMore(true);
        setUsers(data.slice(0, PAGE_SIZE));
      } else {
        setHasMore(false);
        setUsers(data);
      }
    } catch (err: any) {
      toast({ message: err.message || "Failed to fetch users", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleStatus = async (user: AdminUser) => {
    if (user.id === currentAdmin?.id) {
      toast({
        message: "You cannot change the status of your own account.",
        type: "error",
      });
      return;
    }

    const action = user.is_active ? "suspend" : "activate";
    if (!window.confirm(`Are you sure you want to ${action} user "${user.email}"?`)) {
      return;
    }

    setUpdatingId(user.id);
    try {
      const updated = await api.toggleAdminUserStatus(user.id, !user.is_active);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: updated.is_active } : u))
      );
      toast({
        message: `User ${user.email} successfully ${action}d.`,
        type: "success",
      });
    } catch (err: any) {
      toast({ message: err.message || `Failed to ${action} user`, type: "error" });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* GitHub-style Header */}
      <div className="flex flex-col gap-3 pb-5 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Users Directory
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-muted border border-border/70 text-muted-foreground font-semibold">
              Page {page}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Browse, search and manage all platform member accounts across all workspaces.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchUsers}
          disabled={loading}
          className="h-8 text-xs font-medium border-border/80 hover:bg-accent self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* GitHub-style Search & Filter Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search across all users (email, name)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-md border border-border/70 bg-card py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
          />
        </div>

        {/* Top Pagination controls */}
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

      {/* GitHub-style Table Box */}
      <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
        <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>
            {debouncedSearch ? `Search results for "${debouncedSearch}"` : `Showing ${(page - 1) * PAGE_SIZE + 1} - ${(page - 1) * PAGE_SIZE + users.length}`}
          </span>
          <span className="font-mono text-[11px]">Status & Actions</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
            <p>Querying users from database...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No accounts found matching your search.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {users.map((u) => {
              const isSelf = u.id === currentAdmin?.id;
              const isUpdating = updatingId === u.id;

              return (
                <div
                  key={u.id}
                  className="px-4 py-3 flex items-center justify-between gap-4 text-xs hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-muted border border-border/80 flex items-center justify-center font-mono font-medium text-xs text-foreground shrink-0 uppercase">
                      {u.email.substring(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground truncate">
                          {u.full_name || u.email.split("@")[0]}
                        </span>
                        {isSelf && (
                          <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 text-[10px] font-mono">
                            You
                          </span>
                        )}
                        {u.is_superuser ? (
                          <span className="px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-mono font-medium">
                            Staff Admin
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border/60 text-[10px] font-mono">
                            Member
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                        <span className="font-mono">{u.email}</span>
                        <span>•</span>
                        <span>{u.workspaces_count} {u.workspaces_count === 1 ? "workspace" : "workspaces"}</span>
                        <span>•</span>
                        <span>Joined {new Date(u.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium font-mono">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          u.is_active ? "bg-emerald-500" : "bg-rose-500"
                        }`}
                      />
                      <span className={u.is_active ? "text-emerald-500" : "text-rose-500"}>
                        {u.is_active ? "Active" : "Suspended"}
                      </span>
                    </span>

                    {!isSelf && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleStatus(u)}
                        disabled={isUpdating}
                        className={`h-7 px-2.5 text-xs font-medium border-border/80 ${
                          u.is_active
                            ? "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                            : "hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/30"
                        }`}
                      >
                        {isUpdating ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : u.is_active ? (
                          "Suspend"
                        ) : (
                          "Activate"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Pagination Bar */}
        <div className="bg-muted/30 px-4 py-2.5 border-t border-border/70 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Showing up to {PAGE_SIZE} users per page
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
