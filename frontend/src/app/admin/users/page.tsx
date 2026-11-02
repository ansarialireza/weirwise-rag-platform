"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  Users,
  Search,
  Shield,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FolderTree,
  Calendar,
  AlertTriangle,
  UserX,
  UserCheck,
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
      toast({ message: "You cannot suspend your own superuser account.", type: "error" });
      return;
    }
    setUpdatingId(user.id);
    const newStatus = !user.is_active;
    try {
      await api.toggleAdminUserStatus(user.id, newStatus);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: newStatus } : u))
      );
      toast({
        message: `User ${user.email} marked as ${newStatus ? "Active" : "Suspended"}.`,
        type: "success",
      });
    } catch (err: any) {
      toast({ message: err.message || "Failed to update user status", type: "error" });
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    const query = searchTerm.toLowerCase();
    return (
      u.email.toLowerCase().includes(query) ||
      (u.full_name && u.full_name.toLowerCase().includes(query))
    );
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            User Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Global directory of registered platform accounts, workspaces, and authorization status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsers}
            disabled={loading}
            className="rounded-xl border-border bg-card/60 hover:bg-accent text-xs h-9 px-3 gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search users by email or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-muted/20 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
          />
        </div>
        <div className="text-xs font-mono text-muted-foreground">
          Showing {filteredUsers.length} of {users.length} users
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/60 bg-muted/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                <th className="py-3.5 px-4">User</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Workspaces</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Joined</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-sm">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading platform users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    No users match your search criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSelf = u.id === currentAdmin?.id;
                  const isUpdating = updatingId === u.id;

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-muted/15 transition-colors font-mono text-xs"
                    >
                      {/* User Info */}
                      <td className="py-3 px-4 font-sans">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            {u.email}
                            {isSelf && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                                You
                              </span>
                            )}
                          </span>
                          {u.full_name && (
                            <span className="text-xs text-muted-foreground">
                              {u.full_name}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4">
                        {u.is_superuser ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/10 text-red-500 border border-red-500/20">
                            <ShieldAlert className="h-3 w-3" />
                            SUPER_ADMIN
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                            User
                          </span>
                        )}
                      </td>

                      {/* Workspaces */}
                      <td className="py-3 px-4 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <FolderTree className="h-3.5 w-3.5" />
                          <span>{u.workspaces_count}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold text-[11px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-400 font-semibold text-[11px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                            Suspended
                          </span>
                        )}
                      </td>

                      {/* Joined Date */}
                      <td className="py-3 px-4 text-muted-foreground">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isSelf || isUpdating}
                          onClick={() => handleToggleStatus(u)}
                          className={`h-7 px-2.5 text-xs rounded-lg border transition-all ${
                            u.is_active
                              ? "border-red-500/20 text-red-500 hover:bg-red-500/10"
                              : "border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10"
                          }`}
                        >
                          {isUpdating ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : u.is_active ? (
                            <span className="flex items-center gap-1">
                              <UserX className="h-3 w-3" /> Suspend
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <UserCheck className="h-3 w-3" /> Activate
                            </span>
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
