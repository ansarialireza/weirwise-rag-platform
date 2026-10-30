"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import {
  Cpu,
  Key,
  Plus,
  Trash2,
  Shield,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RotateCw,
  Sliders,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export default function AdminProvidersPage() {
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<any | null>(null);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingCred, setAddingCred] = useState(false);
  const { toast } = useToast();

  // New Credential Form
  const [newLabel, setNewLabel] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [newPriority, setNewPriority] = useState(1);
  const [newBudget, setNewBudget] = useState(1000);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const pList = await api.getAdminProviders();
      setProviders(pList);
      if (pList.length > 0) {
        const active = selectedProvider || pList[0];
        setSelectedProvider(active);
        const cList = await api.getAdminCredentials(active.id);
        setCredentials(cList);
      }
    } catch (err: any) {
      toast({ message: err.message || "Failed to load providers.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [selectedProvider, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectProvider = async (p: any) => {
    setSelectedProvider(p);
    try {
      const cList = await api.getAdminCredentials(p.id);
      setCredentials(cList);
    } catch (err: any) {
      toast({ message: err.message || "Failed to load credentials.", type: "error" });
    }
  };

  const handleAddCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider || !newSecret.trim()) return;

    try {
      await api.createAdminCredential(selectedProvider.id, {
        label: newLabel,
        secret: newSecret,
        priority: Number(newPriority),
        monthly_budget_usd: Number(newBudget),
      });
      toast({ message: `Credential "${newLabel}" encrypted and added to pool.`, type: "success" });
      setNewLabel("");
      setNewSecret("");
      setAddingCred(false);
      const cList = await api.getAdminCredentials(selectedProvider.id);
      setCredentials(cList);
    } catch (err: any) {
      toast({ message: err.message || "Failed to register credential.", type: "error" });
    }
  };

  const handleDeleteCredential = async (id: string, label: string) => {
    if (!confirm(`Purge credential "${label}" from vault?`)) return;
    try {
      await api.deleteAdminCredential(id);
      toast({ message: "Credential purged from vault.", type: "info" });
      setCredentials(credentials.filter((c) => c.id !== id));
    } catch (err: any) {
      toast({ message: err.message || "Failed to delete credential.", type: "error" });
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            AI Provider Vault &amp; Routing Engine
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Zero-plaintext encrypted credential pool, automated failover, rate-limit cooldown, and budget orchestration.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setAddingCred(!addingCred)}
            disabled={!selectedProvider}
          >
            <Plus className="h-4 w-4" /> Add Credential to Pool
          </Button>
        </div>
      </div>

      {/* Provider Selector Tabs */}
      <div className="flex gap-2 border-b border-border pb-2 overflow-x-auto">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleSelectProvider(p)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedProvider?.id === p.id
                ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.display_name}
          </button>
        ))}
      </div>

      {/* Add Credential Modal / Form Drawer */}
      {addingCred && (
        <div className="p-6 rounded-xl border border-primary/30 bg-card shadow-sm space-y-4 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Shield className="h-4 w-4" /> New Encrypted Secret Key
            </h3>
            <span className="text-[11px] text-muted-foreground">
              Encrypted at rest with AES-CBC &amp; HMAC-SHA256
            </span>
          </div>

          <form onSubmit={handleAddCredential} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              label="Key Label"
              placeholder="e.g. Cluster Primary 1"
              required
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <Input
              label="API Secret Key"
              type="password"
              placeholder="sk-proj-..."
              required
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value)}
            />
            <Input
              label="Priority Weight"
              type="number"
              min={1}
              max={100}
              required
              value={newPriority}
              onChange={(e) => setNewPriority(Number(e.target.value))}
            />
            <Input
              label="Monthly Budget ($ USD)"
              type="number"
              min={10}
              required
              value={newBudget}
              onChange={(e) => setNewBudget(Number(e.target.value))}
            />
            <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" type="button" onClick={() => setAddingCred(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit">
                Encrypt &amp; Register Credential
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Credential Vault Pool Table */}
      <div className="p-6 rounded-xl border border-border bg-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" /> Active Pool Credentials ({credentials.length})
          </h3>
          <span className="text-[10px] font-mono text-muted-foreground uppercase">Masked Vault View</span>
        </div>

        {credentials.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
            <Shield className="h-6 w-6 text-muted-foreground/50 mx-auto" />
            <p>No credentials configured in this provider pool yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-muted-foreground font-mono text-[10px] uppercase">
                <tr>
                  <th className="py-2.5 px-3">Label</th>
                  <th className="py-2.5 px-3">Masked Prefix</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Monthly Spend / Budget</th>
                  <th className="py-2.5 px-3">Requests Served</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {credentials.map((c) => (
                  <tr key={c.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="py-3 px-3 font-semibold text-foreground">{c.label}</td>
                    <td className="py-3 px-3 font-mono text-[11px] text-muted-foreground">{c.key_prefix}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          c.health_status === "healthy"
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : c.health_status === "rate_limited"
                            ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                            : "bg-red-500/10 text-red-500 border border-red-500/20"
                        }`}
                      >
                        {c.health_status}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono">{c.priority}</td>
                    <td className="py-3 px-3 font-mono">
                      ${c.current_month_spend_usd.toFixed(2)} / ${c.monthly_budget_usd.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 font-mono">{c.total_requests_served.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteCredential(c.id, c.label)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete Credential"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
