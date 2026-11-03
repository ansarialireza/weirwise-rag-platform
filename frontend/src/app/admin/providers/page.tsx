"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, type AdminProviderAccount } from "@/lib/api";
import {
  Key,
  Trash2,
  RefreshCw,
  Save,
  Power,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

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
    description: "Securely store and live-validate Jina API credentials. Validation sends one short test embedding and may incur provider usage charges.",
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
          ? `Verified ${verifiedCount} token(s); ${rejectedCount} invalid token(s) were stored inactive.`
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

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Purge credential "${label}" from vault?`)) return;
    try {
      await api.deleteAdminCredential(id);
      toast({ message: "Token purged from vault.", type: "info" });
      setCredentials(credentials.filter((c) => c.id !== id));
    } catch (err: any) {
      toast({ message: err.message || "Failed to delete token.", type: "error" });
    }
  };

  const activeProvider = PROVIDERS.find((p) => p.id === activeTab) || PROVIDERS[0];

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Provider credential management
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Validate and manage encrypted provider API credentials. Assistant chat does not currently send requests to this credential pool.
        </p>
      </div>

      {/* Provider Tabs */}
      <div className="flex gap-2 border-b border-border/40 pb-2 overflow-x-auto">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              loadRequestId.current += 1;
              setActiveTab(p.id);
              setValidationResults([]);
            }}
            aria-pressed={activeTab === p.id}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === p.id
                ? "bg-foreground text-background shadow-xs"
                : "bg-muted/30 text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.displayName}
          </button>
        ))}
      </div>

      <section aria-labelledby="provider-settings-title" className="rounded-3xl bg-muted/20 p-6 sm:p-8 space-y-5">
        <div className="space-y-1">
          <h2 id="provider-settings-title" className="text-base font-bold text-foreground">
            {providerAccount ? "Provider settings" : "Create provider account"}
          </h2>
          <p className="text-xs text-muted-foreground">
            Persist routing, availability, model, and budget settings for {activeProvider.displayName}.
          </p>
        </div>
        <form onSubmit={handleSaveProvider} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="provider-display-name" className="text-xs font-semibold text-foreground">Display name</label>
            <input
              id="provider-display-name"
              required
              minLength={2}
              maxLength={100}
              value={providerForm.displayName}
              onChange={(event) => setProviderForm((current) => ({ ...current, displayName: event.target.value }))}
              className="h-10 w-full rounded-xl border border-border/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="provider-routing-strategy" className="text-xs font-semibold text-foreground">Routing strategy</label>
            <select
              id="provider-routing-strategy"
              value={providerForm.routingStrategy}
              onChange={(event) => setProviderForm((current) => ({ ...current, routingStrategy: event.target.value }))}
              className="h-10 w-full rounded-xl border border-border/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
            >
              <option value="priority">Priority</option>
              <option value="round_robin">Least recently used</option>
              <option value="weighted">Weighted</option>
              <option value="lowest_cost">Lowest cost</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="provider-monthly-budget" className="text-xs font-semibold text-foreground">Monthly budget (USD)</label>
            <input
              id="provider-monthly-budget"
              required
              type="number"
              min="0"
              step="0.01"
              value={providerForm.monthlyBudget}
              onChange={(event) => setProviderForm((current) => ({ ...current, monthlyBudget: event.target.value }))}
              className="h-10 w-full rounded-xl border border-border/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="provider-supported-models" className="text-xs font-semibold text-foreground">Supported models (comma-separated, optional)</label>
            <input
              id="provider-supported-models"
              value={providerForm.supportedModels}
              onChange={(event) => setProviderForm((current) => ({ ...current, supportedModels: event.target.value }))}
              placeholder="model-a, model-b"
              className="h-10 w-full rounded-xl border border-border/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-foreground sm:col-span-2">
            <input
              type="checkbox"
              checked={providerForm.enabled}
              onChange={(event) => setProviderForm((current) => ({ ...current, enabled: event.target.checked }))}
              className="h-4 w-4 rounded border-border accent-cyan-600"
            />
            Provider available for routing
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" isLoading={savingProvider}>
              <Save className="h-4 w-4" />
              {providerAccount ? "Save provider settings" : "Create provider"}
            </Button>
          </div>
        </form>
      </section>

      {/* Main Configuration Card: Simple Textarea input with live validation */}
      <div className="rounded-3xl bg-muted/20 p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-foreground">{activeProvider.displayName} Token Pool</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">{activeProvider.description}</p>
        </div>

        <form onSubmit={handleSaveTokens} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="provider-tokens-raw" className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Add / Replace Tokens (Multi-line or comma-separated)</span>
              <span className="text-[11px] text-muted-foreground font-normal">
                Encrypted at rest &bull; Live provider validation
              </span>
            </label>
            <textarea
              id="provider-tokens-raw"
              rows={4}
              value={tokensRaw[activeTab]}
              onChange={(e) => setTokensRaw({ ...tokensRaw, [activeTab]: e.target.value })}
              placeholder={activeProvider.placeholder}
              className="w-full rounded-2xl bg-card border border-border/40 p-4 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 leading-relaxed resize-none shadow-xs"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-muted-foreground">
              Tokens are validated live before saving. Invalid tokens remain inactive.
            </span>
            <button
              type="submit"
              disabled={saving || !tokensRaw[activeTab]?.trim()}
              className="inline-flex items-center justify-center rounded-xl h-9 px-5 text-xs font-semibold gap-2 bg-foreground text-background hover:opacity-90 active:scale-[0.98] shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Validating...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" /> Save &amp; Validate Tokens
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {validationResults.length > 0 && (
        <div role="status" className="rounded-xl border border-border bg-card p-4 text-xs">
          <p className="font-semibold">
            Validation: {validationResults.filter((item) => item.status === "active").length} valid,{" "}
            {validationResults.filter((item) => item.status === "error").length} inactive
          </p>
          {validationResults.some((item) => item.error) && (
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {validationResults.filter((item) => item.error).map((item) => (
                <li key={item.id}>{item.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Active Pool Visual Health Indicators */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Configured Pool Credentials ({credentials.length})
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            isLoading={loading}
            className="h-8 px-2 text-xs font-medium text-muted-foreground hover:text-foreground gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh Status
          </Button>
        </div>

        {credentials.length === 0 ? (
          <div className="rounded-3xl bg-muted/10 p-8 text-center text-xs text-muted-foreground space-y-1">
            <Key className="h-6 w-6 text-muted-foreground/40 mx-auto" />
            <p className="font-medium text-foreground">No active tokens in this pool</p>
            <p>Paste one or more API tokens above to initialize automatic failover.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30 rounded-2xl bg-card overflow-hidden shadow-xs">
            {credentials.map((c, idx) => {
              const isHealthy = c.is_active && c.health_status === "healthy";
              return (
                <div
                  key={c.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-muted/20 transition-colors gap-3"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Visual Health Indicator: Solid Green (🟢) or Red (🔴) */}
                    <div
                      className={`h-3 w-3 rounded-full shrink-0 ${
                        isHealthy ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-rose-500 shadow-sm shadow-rose-500/50"
                      }`}
                      title={isHealthy ? "Token Healthy & Verified" : "Token Inactive / Failed"}
                    />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">
                          {c.label || `Token #${idx + 1}`}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                          {c.key_prefix}
                        </span>
                      </div>

                      {/* Explicitly Retrieved Balance & Operational Details */}
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                        <span className="font-mono">
                          Priority #{c.priority || idx + 1}
                        </span>
                        <span>&bull;</span>
                        <span className={isHealthy ? "text-emerald-500 font-semibold font-mono" : "text-rose-500 font-semibold"}>
                          {c.remaining_balance || (isHealthy ? "Status: Active" : "Status: Exhausted / Invalid")}
                        </span>
                        {c.last_error_reason && (
                          <span className="text-rose-500 font-mono text-[10px]">
                            ({c.last_error_reason})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/20">
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {c.total_requests_served || 0} reqs served
                    </span>
                    <button
                    type="button"
                    onClick={() => handleToggleCredential(c.id, c.is_active)}
                    className={`h-8 w-8 rounded-xl flex items-center justify-center transition-colors ${
                      c.is_active
                        ? "text-emerald-500 hover:bg-amber-500/10 hover:text-amber-600"
                        : "text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600"
                    }`}
                    title={c.is_active ? "Disable credential" : "Revalidate and enable credential"}
                    aria-label={c.is_active ? "Disable credential" : "Revalidate and enable credential"}
                    >
                    <Power className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id, c.label || c.key_prefix)}
                      className="h-8 w-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Delete Token"
                      aria-label="Delete Token"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
