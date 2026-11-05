"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  ArrowUpDown,
  Filter,
  Eye,
  X,
  ExternalLink,
  Layers,
  Calendar,
  Mail,
  UserCheck,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Modal } from "@/components/ui/modal";

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

type StatusFilter = "all" | "active" | "suspended";
type RoleFilter = "all" | "staff" | "member";
type SortField = "created_at" | "email" | "workspaces_count";
type SortDirection = "asc" | "desc";

export default function AdminUsersPage() {
  const { user: currentAdmin } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Modal & Confirmation state
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AdminUser | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Debounce search input to avoid spamming the backend
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
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

  // Client-side filtering & sorting for the current page view
  const processedUsers = useMemo(() => {
    let result = [...users];

    if (statusFilter === "active") {
      result = result.filter((u) => u.is_active);
    } else if (statusFilter === "suspended") {
      result = result.filter((u) => !u.is_active);
    }

    if (roleFilter === "staff") {
      result = result.filter((u) => u.is_superuser);
    } else if (roleFilter === "member") {
      result = result.filter((u) => !u.is_superuser);
    }

    result.sort((a, b) => {
      let comp = 0;
      if (sortField === "created_at") {
        comp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortField === "email") {
        comp = a.email.localeCompare(b.email);
      } else if (sortField === "workspaces_count") {
        comp = a.workspaces_count - b.workspaces_count;
      }
      return sortDir === "asc" ? comp : -comp;
    });

    return result;
  }, [users, statusFilter, roleFilter, sortField, sortDir]);

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const executeStatusChange = async () => {
    if (!confirmTarget) return;
    const targetUser = confirmTarget;

    if (targetUser.id === currentAdmin?.id) {
      toast({
        message: "You cannot change the status of your own account.",
        type: "error",
      });
      setConfirmTarget(null);
      return;
    }

    const action = targetUser.is_active ? "suspend" : "activate";
    setConfirmLoading(true);
    setUpdatingId(targetUser.id);
    try {
      const updated = await api.toggleAdminUserStatus(targetUser.id, !targetUser.is_active);
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, is_active: updated.is_active } : u))
      );
      if (selectedUser?.id === targetUser.id) {
        setSelectedUser((prev) => (prev ? { ...prev, is_active: updated.is_active } : null));
      }
      toast({
        message: `User ${targetUser.email} successfully ${action}d.`,
        type: "success",
      });
      setConfirmTarget(null);
    } catch (err: any) {
      toast({ message: err.message || `Failed to ${action} user`, type: "error" });
    } finally {
      setConfirmLoading(false);
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 pb-5 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Users Directory
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-muted border border-border/70 text-muted-foreground font-semibold">
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

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by email, name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-border/70 bg-card py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase font-mono">Status:</span>
            <div className="inline-flex rounded-md border border-border/70 bg-card p-0.5 text-xs">
              {(["all", "active", "suspended"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`px-2 py-1 rounded text-[11px] font-medium capitalize transition-colors ${
                    statusFilter === s
                      ? "bg-muted text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase font-mono">Role:</span>
            <div className="inline-flex rounded-md border border-border/70 bg-card p-0.5 text-xs">
              {(["all", "staff", "member"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`px-2 py-1 rounded text-[11px] font-medium capitalize transition-colors ${
                    roleFilter === r
                      ? "bg-muted text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Top Pagination Controls */}
        <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
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

      {/* Main Table Container */}
      <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
        {/* Table Top Header with Sort Controls */}
        <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              {debouncedSearch
                ? `Results for "${debouncedSearch}"`
                : `Users ${(page - 1) * PAGE_SIZE + 1} - ${(page - 1) * PAGE_SIZE + processedUsers.length}`}
            </span>
            {(statusFilter !== "all" || roleFilter !== "all") && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-foreground border border-border/60">
                Filtered: {processedUsers.length} shown
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px]">
            <button
              type="button"
              onClick={() => handleToggleSort("email")}
              className={`hover:text-foreground inline-flex items-center gap-1 ${
                sortField === "email" ? "text-accent-strong font-semibold" : ""
              }`}
            >
              <span>Email</span>
              <ArrowUpDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => handleToggleSort("workspaces_count")}
              className={`hover:text-foreground hidden sm:inline-flex items-center gap-1 ${
                sortField === "workspaces_count" ? "text-accent-strong font-semibold" : ""
              }`}
            >
              <span>Workspaces</span>
              <ArrowUpDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => handleToggleSort("created_at")}
              className={`hover:text-foreground inline-flex items-center gap-1 ${
                sortField === "created_at" ? "text-accent-strong font-semibold" : ""
              }`}
            >
              <span>Joined</span>
              <ArrowUpDown className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* User Rows */}
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
            <p>Querying users from database...</p>
          </div>
        ) : processedUsers.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No accounts found matching your filters.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {processedUsers.map((u) => {
              const isSelf = u.id === currentAdmin?.id;
              const isUpdating = updatingId === u.id;

              return (
                <div
                  key={u.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-muted/30 transition-colors"
                >
                  {/* User Primary Meta */}
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
                          <span className="px-1.5 py-0.2 rounded bg-primary/10 text-accent-strong border border-primary/20 text-[10px] font-mono">
                            You
                          </span>
                        )}
                        {u.is_superuser ? (
                          <span className="px-1.5 py-0.2 rounded bg-info/10 text-info border border-info/20 text-[10px] font-mono font-medium">
                            Staff Admin
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border/60 text-[10px] font-mono">
                            Member
                          </span>
                        )}
                        {u.is_verified && (
                          <span className="px-1.5 py-0.2 rounded bg-success/10 text-success border border-success/20 text-[10px] font-mono">
                            Verified
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                        <span className="font-mono">{u.email}</span>
                        <span>•</span>
                        <span>{u.workspaces_count} {u.workspaces_count === 1 ? "workspace" : "workspaces"}</span>
                        <span>•</span>
                        <span>Joined {new Date(u.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator & Action Buttons */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium font-mono">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          u.is_active ? "bg-success" : "bg-destructive"
                        }`}
                      />
                      <span className={u.is_active ? "text-success" : "text-destructive"}>
                        {u.is_active ? "Active" : "Suspended"}
                      </span>
                    </span>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedUser(u)}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        title="View details"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Details
                      </Button>

                      {!isSelf && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmTarget(u)}
                          disabled={isUpdating}
                          className={`h-7 px-2.5 text-xs font-medium border-border/80 ${
                            u.is_active
                              ? "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                              : "hover:bg-success/10 hover:text-success hover:border-success/30"
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
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Pagination Bar */}
        <div className="bg-muted/30 px-4 py-2.5 border-t border-border/70 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Showing {processedUsers.length} of {users.length} retrieved records on page {page}
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

      {/* User Details Modal */}
      {selectedUser && (
        <Modal
          isOpen={Boolean(selectedUser)}
          onClose={() => setSelectedUser(null)}
          title="User Account Details"
          description="Comprehensive platform identity and workspace tenancy metadata."
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/70 bg-muted/20">
              <div className="h-10 w-10 rounded-full bg-muted border border-border/80 flex items-center justify-center font-mono font-semibold text-sm text-foreground uppercase">
                {selectedUser.email.substring(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm text-foreground truncate">
                  {selectedUser.full_name || "No display name configured"}
                </div>
                <div className="font-mono text-muted-foreground truncate">
                  {selectedUser.email}
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-full border border-border/60 bg-card">
                <span className={`h-1.5 w-1.5 rounded-full ${selectedUser.is_active ? "bg-success" : "bg-destructive"}`} />
                {selectedUser.is_active ? "Active" : "Suspended"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-border/70 bg-card">
                <span className="text-muted-foreground text-[10px] uppercase font-mono block">Account ID</span>
                <span className="font-mono text-[11px] text-foreground select-all break-all block mt-1">
                  {selectedUser.id}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-border/70 bg-card">
                <span className="text-muted-foreground text-[10px] uppercase font-mono block">Role & Permissions</span>
                <span className="font-semibold text-foreground block mt-1">
                  {selectedUser.is_superuser ? "Platform Super Admin" : "Standard Platform Member"}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-border/70 bg-card">
                <span className="text-muted-foreground text-[10px] uppercase font-mono block">Workspaces</span>
                <span className="font-semibold text-foreground block mt-1">
                  {selectedUser.workspaces_count} {selectedUser.workspaces_count === 1 ? "workspace tenancy" : "workspace tenancies"}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-border/70 bg-card">
                <span className="text-muted-foreground text-[10px] uppercase font-mono block">Email Verification</span>
                <span className="font-semibold text-foreground block mt-1">
                  {selectedUser.is_verified ? "Verified Email Address" : "Pending Verification"}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border/70 bg-card">
              <span className="text-muted-foreground text-[10px] uppercase font-mono block">Registered Timestamp</span>
              <span className="font-mono text-[11px] text-foreground block mt-1">
                {new Date(selectedUser.created_at).toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/70">
              {selectedUser.id !== currentAdmin?.id ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const u = selectedUser;
                    setSelectedUser(null);
                    setConfirmTarget(u);
                  }}
                  className={`text-xs ${
                    selectedUser.is_active
                      ? "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                      : "hover:bg-success/10 hover:text-success hover:border-success/30"
                  }`}
                >
                  {selectedUser.is_active ? "Suspend Account" : "Activate Account"}
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground italic">Current session account</span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedUser(null)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Dialog for Status Changes */}
      <AlertDialog
        isOpen={Boolean(confirmTarget)}
        onClose={() => {
          if (!confirmLoading) setConfirmTarget(null);
        }}
        onConfirm={executeStatusChange}
        isLoading={confirmLoading}
        title={confirmTarget?.is_active ? "Suspend User Account" : "Activate User Account"}
        description={
          confirmTarget?.is_active ? (
            <p>
              Are you sure you want to suspend <strong className="text-foreground">{confirmTarget?.email}</strong>? Suspended users will immediately lose authentication and API access across all workspaces until reactivated.
            </p>
          ) : (
            <p>
              Are you sure you want to activate <strong className="text-foreground">{confirmTarget?.email}</strong>? This user will regain access to their assigned workspaces and assistants.
            </p>
          )
        }
        confirmText={confirmTarget?.is_active ? "Suspend Account" : "Activate Account"}
        variant={confirmTarget?.is_active ? "destructive" : "primary"}
      />
    </div>
  );
}
