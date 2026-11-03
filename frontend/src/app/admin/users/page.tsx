"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FolderTree,
  Calendar,
  AlertTriangle,
  UserX,
  UserCheck,
  Shield,
  ShieldAlert,
  MoreHorizontal,
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

export default function AdminUsersPage() {
  const { user: currentAdmin } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAdminUsers(200, 0);
      setUsers(data);
    } catch (err: any) {
      toast({ message: err.message || "Failed to fetch users", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

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

  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    return (
      u.email.toLowerCase().includes(term) ||
      (u.full_name && u.full_name.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      {/* GitHub-style Header */}
      <div className="flex flex-col gap-3 pb-5 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Users
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-muted border border-border/70 text-muted-foreground font-semibold">
              {users.length}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Directory of registered member accounts, administrative roles, and access states.
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

      {/* GitHub-style Search Box */}
      <div className="flex items-center gap-2 max-w-sm">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-md border border-border/70 bg-card py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* GitHub-style Table Box */}
      <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
        <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>{filteredUsers.length} total members</span>
          <span className="font-mono text-[11px]">Role & Authorization</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
            <p>Loading users directory...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No accounts match your query.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filteredUsers.map((u) => {
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
                            User
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
      </div>
    </div>
  );
}
