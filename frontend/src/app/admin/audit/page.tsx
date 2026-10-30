"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  History,
  Shield,
  Activity,
  User,
  Clock,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminAuditLogs(100);
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(searchFilter.toLowerCase()) ||
      l.actor_email.toLowerCase().includes(searchFilter.toLowerCase()) ||
      l.target_entity.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Security &amp; Operational Audit Trail
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Immutable, append-only administrative records, credential modifications, and tenant events.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadLogs} isLoading={loading}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh Log Stream
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by action, email, or entity..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full rounded-xl border border-border bg-input pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="p-6 rounded-xl border border-border bg-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> Recorded Events ({filteredLogs.length})
          </h3>
          <span className="text-[10px] font-mono text-muted-foreground uppercase">Tamper-Resistant</span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
            <Shield className="h-6 w-6 text-muted-foreground/50 mx-auto" />
            <p>No administrative audit records found matching query.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-muted-foreground font-mono text-[10px] uppercase">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Target Entity</th>
                  <th className="py-2.5 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="py-3 px-3 font-mono text-[11px] text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 font-semibold text-foreground">{log.actor_email}</td>
                    <td className="py-3 px-3">
                      <span className="inline-block px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-mono text-[11px]">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-muted-foreground uppercase text-[10px]">
                      {log.target_entity}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-muted-foreground truncate max-w-xs">
                      {JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
