"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, type AdminProviderAccount } from "@/lib/api";
import {
  Key,
  Trash2,
  RefreshCw,
  Save,
  Power,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AlertDialog } from "@/components/ui/alert-dialog";

interface ProviderConfig {
  id: string;
  name: string;
  displayName: string;
  description: string;
  placeholder: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "jina",
    name: "jina",
    displayName: "Jina AI (Embeddings)",
    description: "Securely store and live-validate Jina API credentials. Validation sends one short test embedding.",
    placeholder: "jina_xxxxxx...\njina_yyyyyy... (Paste multiple keys, one per line)",
  },
  {
    id: "openai",
    name: "openai",
    displayName: "OpenAI / LLM Provider",
    description: "Securely store and live-validate OpenAI API credentials.",
    placeholder: "sk-proj-xxxxxx...\nsk-proj-yyyyyy... (One per line)",
  },
  {
    id: "anthropic",
    name: "anthropic",
    displayName: "Anthropic Claude",
    description: "Securely store and live-validate Anthropic API credentials.",
    placeholder: "sk-ant-api03-xxxxxx...",
  },
  {
    id: "gemini",
    name: "gemini",
    displayName: "Google Gemini",
    description: "Securely store and live-validate Google Gemini API credentials.",
    placeholder: "AIzaSy...",
  },
  {
    id: "deepgram",
    name: "deepgram",
    displayName: "Deepgram (Audio & Speech)",
    description: "Securely store and live-validate Deepgram API credentials.",
    placeholder: "deepgram_token_1\ndeepgram_token_2",
  },
  {
    id: "openrouter",
    name: "openrouter",
    displayName: "OpenRouter",
    description: "Securely store and live-validate OpenRouter API credentials.",
    placeholder: "sk-or-v1-...",
  },
  {
    id: "resend",
    name: "resend",
    displayName: "Resend Email",
    description: "Securely store and live-validate Resend API credentials.",
    placeholder: "re_xxxxxx...",
  },
];

export default function AdminProvidersPage() {
  const [activeTab, setActiveTab] = useState<string>("jina");
  const [tokensRaw, setTokensRaw] = useState<Record<string, string>>({
    jina: "",
    openai: "",
    anthropic: "",
    gemini: "",
    deepgram: "",
    openrouter: "",
    resend: "",
  });
  const [credentials, setCredentials] = useState<any[]>([]);
  const [providerAccount, setProviderAccount] = useState<AdminProviderAccount | null>(null);
  const [providerForm, setProviderForm] = useState({
    displayName: "Jina AI (Embeddings)",
    enabled: true,
    routingStrategy: "priority",
    monthlyBudget: "5000",
    supportedModels: "",
  });
  const [validationResults, setValidationResults] = useState<Array<{ id: string; status: "active" | "error"; error?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  
  // Custom Alert dialog state for destructive token purge
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadRequestId = useRef(0);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    const providerName = activeTab;
    setLoading(true);
    try {
      const pList = await api.getAdminProviders();
      const current = pList.find((provider) => provider.provider_name.toLowerCase() === providerName);
      const cList = current ? await api.getAdminCredentials(current.id) : [];
      if (requestId !== loadRequestId.current) return;

      setProviderAccount(current ?? null);
      setCredentials(cList);
      const config = PROVIDERS.find((provider) => provider.id === providerName) ?? PROVIDERS[0];
      setProviderForm({
        displayName: current?.display_name ?? config.displayName,
        enabled: current?.is_enabled ?? true,
        routingStrategy: current?.default_routing_strategy ?? "priority",
        monthlyBudget: String(current?.global_monthly_budget_usd ?? 5000),
        supportedModels: current?.supported_models.join(", ") ?? "",
      });
    } catch (err: any) {
      if (requestId === loadRequestId.current) {
        toast({ message: err.message || "Failed to load provider credentials.", type: "error" });
      }
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [activeTab, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveTokens = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = tokensRaw[activeTab];
    if (!raw.trim()) {
      toast({ message: "Please paste at least one API token.", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const res = await api.saveProviderTokens(activeTab, raw);
      setValidationResults(res.tokens);
      const verifiedCount = res.tokens.filter((token) => token.status === "active").length;
      const rejectedCount = res.tokens.length - verifiedCount;
      toast({
        message: rejectedCount
          ? `Verified ${verifiedCount} token(s); ${rejectedCount} invalid token(s) stored inactive.`
          : `Verified and saved ${verifiedCount} token(s) for ${activeTab.toUpperCase()}.`,
        type: rejectedCount ? "info" : "success",
      });
      setTokensRaw((prev) => ({ ...prev, [activeTab]: "" }));
      await loadData();
    } catch (err: any) {
      toast({ message: err.message || "Failed to validate and save tokens.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    const monthlyBudget = Number(providerForm.monthlyBudget);
    if (!providerForm.displayName.trim() || !Number.isFinite(monthlyBudget) || monthlyBudget < 0) {
      toast({ message: "Enter a provider name and a valid non-negative monthly budget.", type: "error" });
      return;
    }

    const payload = {
      display_name: providerForm.displayName.trim(),
      is_enabled: providerForm.enabled,
      default_routing_strategy: providerForm.routingStrategy,
      global_monthly_budget_usd: monthlyBudget,
      supported_models: providerForm.supportedModels.split(",").map((model) => model.trim()).filter(Boolean),
    };

    setSavingProvider(true);
    try {
      if (providerAccount) {
        await api.updateAdminProvider(providerAccount.id, payload);
      } else {
        await api.createAdminProvider({ provider_name: activeTab, ...payload });
      }
      toast({ message: providerAccount ? "Provider settings updated." : "Provider account created.", type: "success" });
      await loadData();
    } catch (err: any) {
      toast({ message: err.message || "Failed to save provider settings.", type: "error" });
    } finally {
      setSavingProvider(false);
    }
  };

  const handleToggleCredential = async (id: string, isActive: boolean) => {
    try {
      const updated = await api.updateAdminCredentialStatus(id, !isActive);
      setCredentials((current) => current.map((credential) => credential.id === id ? updated : credential));
      toast({
        message: updated.is_active ? "Credential verified and enabled." : "Credential disabled.",
        type: "success",
      });
    } catch (err: any) {
      toast({ message: err.message || "Failed to update credential status.", type: "error" });
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.deleteAdminCredential(deleteTarget.id);
      toast({ message: "Token purged from vault.", type: "info" });
      setCredentials((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      toast({ message: err.message || "Failed to delete token.", type: "error" });
    } finally {
      setDeleteLoading(false);
    }
  };

  const activeProvider = PROVIDERS.find((p) => p.id === activeTab) || PROVIDERS[0];

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 pb-5 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              AI Providers & Vault Credentials
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted border border-border/70 text-muted-foreground uppercase font-semibold">
              Encrypted Vault
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Store, validate, and manage encrypted provider API keys with automated health checking and failover priority.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 text-xs font-medium border-border/80 hover:bg-accent self-start sm:self-auto"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Provider Selector Tabs */}
      <div className="flex gap-1.5 border-b border-border/70 pb-2 overflow-x-auto">
        {PROVIDERS.map((p) => {
          const isSelected = activeTab === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                loadRequestId.current += 1;
                setActiveTab(p.id);
                setValidationResults([]);
              }}
              aria-pressed={isSelected}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                isSelected
                  ? "bg-accent text-accent-foreground font-semibold shadow-xs border border-border/80"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground border border-transparent"
              }`}
            >
              {p.displayName}
            </button>
          );
        })}
      </div>

      {/* Provider Settings Card */}
      <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
        <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold text-foreground">
              {providerAccount ? "Provider Routing Settings" : "Initialize Provider Account"}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Configure failover strategy and budget allocation for {activeProvider.displayName}.
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-muted border border-border/60 text-muted-foreground uppercase">
            {activeTab}
          </span>
        </div>

        <form onSubmit={handleSaveProvider} className="p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="provider-display-name" className="text-xs font-medium text-foreground">
                Display Name
              </label>
              <input
                id="provider-display-name"
                required
                minLength={2}
                maxLength={100}
                value={providerForm.displayName}
                onChange={(event) => setProviderForm((current) => ({ ...current, displayName: event.target.value }))}
                className="w-full rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="provider-routing-strategy" className="text-xs font-medium text-foreground">
                Routing Strategy
              </label>
              <select
                id="provider-routing-strategy"
                value={providerForm.routingStrategy}
                onChange={(event) => setProviderForm((current) => ({ ...current, routingStrategy: event.target.value }))}
                className="w-full rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              >
                <option value="priority">Priority (Highest order first)</option>
                <option value="round_robin">Least Recently Used (Round-robin)</option>
                <option value="weighted">Weighted Distribution</option>
                <option value="lowest_cost">Lowest Cost Optimization</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="provider-monthly-budget" className="text-xs font-medium text-foreground">
                Monthly Budget (USD)
              </label>
              <input
                id="provider-monthly-budget"
                required
                type="number"
                min="0"
                step="0.01"
                value={providerForm.monthlyBudget}
                onChange={(event) => setProviderForm((current) => ({ ...current, monthlyBudget: event.target.value }))}
                className="w-full rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="provider-supported-models" className="text-xs font-medium text-foreground">
                Supported Models (Comma-separated)
              </label>
              <input
                id="provider-supported-models"
                value={providerForm.supportedModels}
                onChange={(event) => setProviderForm((current) => ({ ...current, supportedModels: event.target.value }))}
                placeholder="gpt-4o, gpt-4o-mini"
                className="w-full rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border/60">
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={providerForm.enabled}
                onChange={(event) => setProviderForm((current) => ({ ...current, enabled: event.target.checked }))}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              <span className="font-medium">Provider active for routing requests</span>
            </label>

            <Button type="submit" size="sm" disabled={savingProvider} className="h-8 text-xs font-medium">
              {savingProvider ? (
                <>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="mr-1.5 h-3.5 w-3.5" /> {providerAccount ? "Save Settings" : "Create Account"}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Add / Validate Tokens Input Section */}
      <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
        <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold text-foreground">{activeProvider.displayName} Vault Ingestion</h2>
            <p className="text-[11px] text-muted-foreground">{activeProvider.description}</p>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">AES-256</span>
        </div>

        <form onSubmit={handleSaveTokens} className="p-4 space-y-3">
          <div className="space-y-1">
            <label htmlFor="provider-tokens-raw" className="text-xs font-medium text-foreground flex items-center justify-between">
              <span>Add / Replace Tokens (Multi-line or comma-separated)</span>
              <span className="text-[11px] text-muted-foreground font-mono font-normal">
                Live provider endpoint probe
              </span>
            </label>
            <textarea
              id="provider-tokens-raw"
              rows={3}
              value={tokensRaw[activeTab]}
              onChange={(e) => setTokensRaw({ ...tokensRaw, [activeTab]: e.target.value })}
              placeholder={activeProvider.placeholder}
              className="w-full rounded-md bg-background border border-border/70 p-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none shadow-xs"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-muted-foreground">
              Tokens are probed and validated live before activation.
            </span>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !tokensRaw[activeTab]?.trim()}
              className="h-8 text-xs font-medium"
            >
              {saving ? (
                <>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Probing & Saving...
                </>
              ) : (
                <>
                  <Key className="mr-1.5 h-3.5 w-3.5" /> Validate & Save Tokens
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Validation status feedback */}
      {validationResults.length > 0 && (
        <div role="status" className="rounded-md border border-border/70 bg-card p-3 text-xs">
          <div className="font-semibold text-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>
              Validation Result: {validationResults.filter((item) => item.status === "active").length} valid,{" "}
              {validationResults.filter((item) => item.status === "error").length} inactive
            </span>
          </div>
          {validationResults.some((item) => item.error) && (
            <ul className="mt-2 space-y-1 text-muted-foreground pl-6 list-disc font-mono text-[11px]">
              {validationResults.filter((item) => item.error).map((item) => (
                <li key={item.id}>{item.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Configured Pool Credentials Table */}
      <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
        <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground">
              Configured Pool Credentials
            </h3>
            <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-muted border border-border/60 text-muted-foreground">
              {credentials.length}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {credentials.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground space-y-1">
            <Key className="h-5 w-5 text-muted-foreground/40 mx-auto" />
            <p className="font-medium text-foreground">No active tokens in this pool</p>
            <p>Paste one or more API tokens above to configure credentials for {activeProvider.displayName}.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {credentials.map((c, idx) => {
              const isHealthy = c.is_active && c.health_status === "healthy";
              return (
                <div
                  key={c.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                        isHealthy ? "bg-emerald-500" : "bg-rose-500"
                      }`}
                      title={isHealthy ? "Token Healthy" : "Token Inactive or Exhausted"}
                    />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">
                          {c.label || `Token #${idx + 1}`}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded border border-border/60">
                          {c.key_prefix}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          Priority #{c.priority || idx + 1}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                        <span className={isHealthy ? "text-emerald-400 font-mono font-medium" : "text-rose-400 font-mono font-medium"}>
                          {c.remaining_balance || (isHealthy ? "Active & Ready" : "Inactive / Exhausted")}
                        </span>
                        <span>•</span>
                        <span className="font-mono">{c.total_requests_served || 0} reqs served</span>
                        {c.last_error_reason && (
                          <>
                            <span>•</span>
                            <span className="text-rose-400 font-mono text-[10px]">
                              {c.last_error_reason}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleCredential(c.id, c.is_active)}
                      className={`h-7 px-2.5 text-xs font-medium border-border/80 ${
                        c.is_active
                          ? "hover:bg-amber-500/10 hover:text-amber-400"
                          : "hover:bg-emerald-500/10 hover:text-emerald-400"
                      }`}
                    >
                      <Power className="h-3 w-3 mr-1" />
                      {c.is_active ? "Disable" : "Enable"}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteTarget({ id: c.id, label: c.label || c.key_prefix })}
                      className="h-7 px-2.5 text-xs font-medium border-border/80 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Dialog for Deleting Token */}
      <AlertDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => {
          if (!deleteLoading) setDeleteTarget(null);
        }}
        onConfirm={executeDelete}
        isLoading={deleteLoading}
        title="Purge Credential from Vault?"
        description={
          <p>
            Are you sure you want to permanently delete credential <strong className="text-foreground">{deleteTarget?.label}</strong>? This cannot be undone.
          </p>
        }
        confirmText="Purge Credential"
        variant="destructive"
      />
    </div>
  );
}
