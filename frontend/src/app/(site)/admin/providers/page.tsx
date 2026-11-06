"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, type AdminProviderAccount } from "@/lib/api";
import type {
  AdminControlSettings,
  AdminCredential,
  AdminCredentialUsage,
  AdminRoutingEvent,
  AdminRoutingExplanation,
  AdminRoutingOverview,
} from "@/lib/api";
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
  ChevronDown,
  ChevronRight,
  Activity,
  Route as RouteIcon,
  Pencil,
  X,
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
  const [credentials, setCredentials] = useState<AdminCredential[]>([]);
  const [providerAccount, setProviderAccount] = useState<AdminProviderAccount | null>(null);
  const [providerForm, setProviderForm] = useState({
    displayName: "Jina AI (Embeddings)",
    enabled: true,
    routingStrategy: "priority",
    monthlyBudget: "5000",
    supportedModels: "",
    accountRpm: "0",
    accountTpm: "0",
    accountConcurrency: "0",
  });
  const [validationResults, setValidationResults] = useState<Array<{ id: string; status: "active" | "error"; error?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);

  // Routing observability
  const [controlSettings, setControlSettings] = useState<AdminControlSettings | null>(null);
  const [explanation, setExplanation] = useState<AdminRoutingExplanation | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [routingEvents, setRoutingEvents] = useState<AdminRoutingEvent[]>([]);
  const [eventsFailuresOnly, setEventsFailuresOnly] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Per-credential drill-down
  const [expandedCredentialId, setExpandedCredentialId] = useState<string | null>(null);
  const [usage, setUsage] = useState<AdminCredentialUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null);
  const [credentialEditForm, setCredentialEditForm] = useState({
    label: "",
    priority: "1",
    routing_weight: "10",
    monthly_budget_usd: "1000",
    warning_threshold_pct: "85",
    rate_limit_rpm: "500",
    rate_limit_tpm: "100000",
    max_concurrency: "0",
  });
  const [savingCredential, setSavingCredential] = useState(false);

  // Pool-wide observability
  const [overview, setOverview] = useState<AdminRoutingOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthResults, setHealthResults] = useState<
    Array<{ credential_id: string; label: string; status: string; error: string | null }>
  >([]);
  
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
        accountRpm: String(current?.account_rate_limit_rpm ?? 0),
        accountTpm: String(current?.account_rate_limit_tpm ?? 0),
        accountConcurrency: String(current?.account_max_concurrency ?? 0),
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

  const loadObservability = useCallback(async () => {
    setEventsLoading(true);
    setOverviewLoading(true);
    try {
      const [settings, events, overviewData] = await Promise.all([
        api.getAdminControlSettings(),
        api.getAdminRoutingEvents({
          provider_name: activeTab,
          failures_only: eventsFailuresOnly,
          limit: 25,
        }),
        api.getAdminRoutingOverview(24),
      ]);
      setControlSettings(settings);
      setRoutingEvents(events);
      setOverview(overviewData);
    } catch (err: any) {
      toast({ message: err.message || "Failed to load routing observability.", type: "error" });
    } finally {
      setEventsLoading(false);
      setOverviewLoading(false);
    }
  }, [activeTab, eventsFailuresOnly, toast]);

  useEffect(() => {
    setExplanation(null);
    setExpandedCredentialId(null);
    setUsage(null);
    setEditingCredentialId(null);
    setHealthResults([]);
    void loadObservability();
  }, [loadObservability]);

  const handleExplainSelection = async () => {
    setExplaining(true);
    try {
      const firstModel = providerForm.supportedModels
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean)[0];
      setExplanation(await api.explainAdminRouting(activeTab, firstModel));
    } catch (err: any) {
      setExplanation(null);
      toast({ message: err.message || "Could not evaluate routing selection.", type: "error" });
    } finally {
      setExplaining(false);
    }
  };

  const handleHealthCheck = async () => {
    if (!providerAccount) {
      toast({ message: "Save the provider before running a health check.", type: "error" });
      return;
    }
    setHealthChecking(true);
    try {
      const result = await api.healthCheckAdminProvider(providerAccount.id);
      setHealthResults(result.results);
      const healthy = result.results.filter((item) => item.status === "healthy").length;
      toast({
        message: `Health check complete: ${healthy}/${result.results.length} tokens healthy.`,
        type: healthy === result.results.length ? "success" : "info",
      });
      await loadData();
      await loadObservability();
    } catch (err: any) {
      toast({ message: err.message || "Provider health check failed.", type: "error" });
    } finally {
      setHealthChecking(false);
    }
  };

  const handleExpandCredential = async (credential: AdminCredential) => {
    if (expandedCredentialId === credential.id) {
      setExpandedCredentialId(null);
      setUsage(null);
      setEditingCredentialId(null);
      return;
    }
    setExpandedCredentialId(credential.id);
    setEditingCredentialId(null);
    setUsage(null);
    setUsageLoading(true);
    try {
      setUsage(await api.getAdminCredentialUsage(credential.id, 30));
    } catch (err: any) {
      toast({ message: err.message || "Could not load credential usage.", type: "error" });
    } finally {
      setUsageLoading(false);
    }
  };

  const handleStartCredentialEdit = (credential: AdminCredential) => {
    setEditingCredentialId(credential.id);
    setCredentialEditForm({
      label: credential.label,
      priority: String(credential.priority),
      routing_weight: String(credential.routing_weight),
      monthly_budget_usd: String(credential.monthly_budget_usd),
      warning_threshold_pct: String(credential.warning_threshold_pct),
      rate_limit_rpm: String(credential.rate_limit_rpm),
      rate_limit_tpm: String(credential.rate_limit_tpm),
      max_concurrency: String(credential.max_concurrency ?? 0),
    });
  };

  const handleSaveCredentialEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingCredentialId) return;
    const numbers = {
      priority: Number(credentialEditForm.priority),
      routing_weight: Number(credentialEditForm.routing_weight),
      monthly_budget_usd: Number(credentialEditForm.monthly_budget_usd),
      warning_threshold_pct: Number(credentialEditForm.warning_threshold_pct),
      rate_limit_rpm: Number(credentialEditForm.rate_limit_rpm),
      rate_limit_tpm: Number(credentialEditForm.rate_limit_tpm),
      max_concurrency: Number(credentialEditForm.max_concurrency),
    };
    if (
      !credentialEditForm.label.trim() ||
      Object.values(numbers).some((value) => !Number.isFinite(value) || value < 0) ||
      numbers.priority < 1 ||
      numbers.routing_weight < 1 ||
      numbers.rate_limit_rpm < 1 ||
      numbers.rate_limit_tpm < 1 ||
      numbers.warning_threshold_pct < 1 ||
      numbers.warning_threshold_pct > 100
    ) {
      toast({ message: "Enter a label and valid positive routing limits.", type: "error" });
      return;
    }

    setSavingCredential(true);
    try {
      const updated = await api.updateAdminCredential(editingCredentialId, {
        label: credentialEditForm.label.trim(),
        ...numbers,
      });
      setCredentials((current) => current.map((credential) => (credential.id === updated.id ? updated : credential)));
      setEditingCredentialId(null);
      setUsage(await api.getAdminCredentialUsage(updated.id, 30));
      toast({ message: "Credential routing metadata updated.", type: "success" });
    } catch (err: any) {
      toast({ message: err.message || "Could not update credential metadata.", type: "error" });
    } finally {
      setSavingCredential(false);
    }
  };

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
    const accountRpm = Number(providerForm.accountRpm || 0);
    const accountTpm = Number(providerForm.accountTpm || 0);
    const accountConcurrency = Number(providerForm.accountConcurrency || 0);
    if (
      !providerForm.displayName.trim() ||
      [monthlyBudget, accountRpm, accountTpm, accountConcurrency].some(
        (value) => !Number.isFinite(value) || value < 0
      )
    ) {
      toast({ message: "Enter a provider name and valid non-negative budget and limit values.", type: "error" });
      return;
    }

    const payload = {
      display_name: providerForm.displayName.trim(),
      is_enabled: providerForm.enabled,
      default_routing_strategy: providerForm.routingStrategy,
      global_monthly_budget_usd: monthlyBudget,
      supported_models: providerForm.supportedModels.split(",").map((model) => model.trim()).filter(Boolean),
      account_rate_limit_rpm: accountRpm,
      account_rate_limit_tpm: accountTpm,
      account_max_concurrency: accountConcurrency,
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
            Encrypted keys, health checks and failover for every provider.
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

      {/* Routing policy summary + selection explainer */}
      <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <RouteIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Routing policy
            </span>
            <span className="flex items-center gap-1.5">
              Mode:{" "}
              <strong className="text-foreground">
                {controlSettings?.management_mode ?? "unknown"}
              </strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  controlSettings?.automatic_failover ? "bg-success" : "bg-muted-foreground/40"
                }`}
              />
              Auto failover:{" "}
              <strong className="text-foreground">
                {controlSettings ? (controlSettings.automatic_failover ? "on" : "off") : "unknown"}
              </strong>
            </span>
            {controlSettings?.emergency_stop && (
              <span className="font-semibold text-destructive uppercase">Emergency stop active</span>
            )}
            <a href="/admin/operations" className="underline underline-offset-2 hover:text-foreground">
              Manage policy
            </a>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExplainSelection}
            disabled={explaining}
            className="h-7 px-2.5 text-xs font-medium border-border/80 self-start sm:self-auto"
          >
            <Activity className={`h-3 w-3 mr-1 ${explaining ? "animate-pulse" : ""}`} />
            Explain next selection
          </Button>
        </div>

        {explanation && (
          <div role="status" className="border-t border-border/60 bg-muted/20 px-4 py-2.5 text-[11px]">
            {explanation.available ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span className="text-foreground font-medium">
                  {explanation.credential_label} ({explanation.key_prefix})
                </span>
                <span className="text-muted-foreground">
                  mode=<span className="font-mono">{explanation.mode}</span>
                </span>
                <span className="text-muted-foreground">
                  strategy=<span className="font-mono">{explanation.strategy}</span>
                </span>
                <span className="text-muted-foreground">
                  why=<span className="font-mono">{explanation.reason}</span>
                </span>
                <span className="text-muted-foreground">
                  eligible=<span className="font-mono">{explanation.eligible_count}</span>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>
                  No credential would be selected: <span className="font-mono">{explanation.reason}</span>
                </span>
              </div>
            )}
          </div>
        )}
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
                <option value="priority">Priority (highest priority first)</option>
                <option value="round_robin">Round Robin (even request distribution)</option>
                <option value="least_recently_used">Least Recently Used</option>
                <option value="least_loaded">Least Loaded (lowest in-flight)</option>
                <option value="weighted">Weighted Distribution</option>
                <option value="lowest_cost">Lowest Cost Utilization</option>
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

            <div className="space-y-2 sm:col-span-2 rounded-md border border-border/60 bg-muted/20 p-3">
              <div>
                <p className="text-xs font-semibold text-foreground">Account-wide shared limits</p>
                <p className="text-[11px] text-muted-foreground">
                  Enforced across every token in this pool so rotation never exceeds the provider&apos;s account quota.
                  Use 0 for &ldquo;not configured&rdquo;.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label htmlFor="provider-account-rpm" className="text-xs font-medium text-foreground">
                    Account RPM
                  </label>
                  <input
                    id="provider-account-rpm"
                    type="number"
                    min="0"
                    value={providerForm.accountRpm}
                    onChange={(event) => setProviderForm((current) => ({ ...current, accountRpm: event.target.value }))}
                    className="w-full rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="provider-account-tpm" className="text-xs font-medium text-foreground">
                    Account TPM
                  </label>
                  <input
                    id="provider-account-tpm"
                    type="number"
                    min="0"
                    value={providerForm.accountTpm}
                    onChange={(event) => setProviderForm((current) => ({ ...current, accountTpm: event.target.value }))}
                    className="w-full rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="provider-account-concurrency" className="text-xs font-medium text-foreground">
                    Account concurrency
                  </label>
                  <input
                    id="provider-account-concurrency"
                    type="number"
                    min="0"
                    value={providerForm.accountConcurrency}
                    onChange={(event) =>
                      setProviderForm((current) => ({ ...current, accountConcurrency: event.target.value }))
                    }
                    className="w-full rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>
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
            <CheckCircle2 className="h-4 w-4 text-success" />
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

      {/* Pool-wide routing overview */}
      <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
        <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground">Routing overview</h3>
            <span className="text-[10px] font-mono text-muted-foreground">last 24h</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadObservability()}
            disabled={overviewLoading}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${overviewLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        {(() => {
          const providerStats = overview?.providers.find((item) => item.provider_name === activeTab);
          const accountLive = overview?.account_utilization[activeTab];
          const providerCredentials =
            overview?.credentials.filter((item) => item.provider_name === activeTab) ?? [];
          const atRisk = providerCredentials.filter(
            (item) =>
              item.rpm_utilization_pct >= 80 ||
              item.tpm_utilization_pct >= 80 ||
              (item.max_concurrency > 0 && item.in_flight >= item.max_concurrency)
          );
          return (
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-[11px]">
                <Metric label="Attempts" value={String(providerStats?.requests ?? 0)} />
                <Metric label="Success rate" value={`${providerStats?.success_rate_pct ?? 0}%`} />
                <Metric label="Failovers" value={String(providerStats?.failovers ?? 0)} />
                <Metric label="429 events" value={String(providerStats?.rate_limit_events ?? 0)} />
                <Metric label="Avg latency" value={`${providerStats?.avg_latency_ms ?? 0} ms`} />
                <Metric label="Tokens" value={(providerStats?.total_tokens ?? 0).toLocaleString()} />
                <Metric label="Cost" value={`$${(providerStats?.cost_usd ?? 0).toFixed(4)}`} />
              </div>

              {accountLive &&
                (accountLive.account_rpm_limit > 0 ||
                  accountLive.account_tpm_limit > 0 ||
                  accountLive.account_max_concurrency > 0) && (
                  <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
                    <UtilizationBar
                      label="Account RPM"
                      used={accountLive.account_rpm_used}
                      limit={accountLive.account_rpm_limit}
                    />
                    <UtilizationBar
                      label="Account TPM"
                      used={accountLive.account_tpm_used}
                      limit={accountLive.account_tpm_limit}
                    />
                    <UtilizationBar
                      label="Account concurrency"
                      used={accountLive.in_flight}
                      limit={accountLive.account_max_concurrency}
                    />
                  </div>
                )}

              {atRisk.length > 0 && (
                <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Tokens near their configured limits
                  </div>
                  <ul className="mt-1 space-y-0.5 pl-5 list-disc font-mono">
                    {atRisk.map((item) => (
                      <li key={item.credential_id}>
                        {item.label}: RPM {item.rpm_used}/{item.rpm_limit || "—"} · TPM {item.tpm_used}/
                        {item.tpm_limit || "—"} · in-flight {item.in_flight}
                        {item.max_concurrency > 0 ? `/${item.max_concurrency}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!providerStats && !overviewLoading && (
                <p className="text-[11px] text-muted-foreground">
                  No routing attempts recorded for {activeTab} in the last 24 hours.
                </p>
              )}
            </div>
          );
        })()}
      </div>

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

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleHealthCheck()}
              disabled={healthChecking || credentials.length === 0}
              className="h-7 px-2 text-xs"
            >
              <ShieldCheck className={`h-3 w-3 mr-1 ${healthChecking ? "animate-pulse" : ""}`} />
              {healthChecking ? "Probing..." : "Health check"}
            </Button>
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
        </div>

        {healthResults.length > 0 && (
          <div role="status" className="border-b border-border/60 bg-muted/20 px-4 py-2 text-[11px]">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              Latest health probe
            </div>
            <ul className="mt-1 space-y-0.5 font-mono text-muted-foreground">
              {healthResults.map((item) => (
                <li key={item.credential_id} className="flex flex-wrap items-center gap-x-2">
                  <span className="text-foreground">{item.label}</span>
                  <span
                    className={
                      item.status === "healthy"
                        ? "text-success"
                        : item.status === "unknown" || item.status === "skipped"
                          ? "text-muted-foreground"
                          : "text-destructive"
                    }
                  >
                    {item.status}
                  </span>
                  {item.error && <span className="text-destructive/80">{item.error}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {credentials.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground space-y-1">
            <Key className="h-5 w-5 text-muted-foreground/40 mx-auto" />
            <p className="font-medium text-foreground">No active tokens in this pool</p>
            <p>Paste one or more API tokens above to configure credentials for {activeProvider.displayName}.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {credentials.map((c, idx) => {
              const isActive = c.is_active;
              const isCooling = c.cooling_down_until ? new Date(c.cooling_down_until) > new Date() : false;
              const isHealthy = isActive && !isCooling && (c.health_status === "healthy" || c.health_status === "degraded");
              const expanded = expandedCredentialId === c.id;
              const budgetPct =
                c.monthly_budget_usd > 0
                  ? Math.min(100, (Number(c.current_month_spend_usd) / Number(c.monthly_budget_usd)) * 100)
                  : 0;
              const dotClass = !isActive ? "bg-muted-foreground" : isHealthy ? "bg-success" : "bg-warning";

              return (
                <div key={c.id}>
                  <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotClass}`}
                        title={`Health: ${c.health_status}`}
                      />

                      <div className="min-w-0 space-y-0.5">
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
                          <span
                            className={`text-[10px] font-mono uppercase px-1.5 py-0.2 rounded border ${
                              isActive
                                ? isCooling
                                  ? "border-warning/40 text-warning bg-warning/10"
                                  : "border-success/30 text-success bg-success/5"
                                : "border-border/60 text-muted-foreground bg-muted"
                            }`}
                          >
                            {isActive ? (isCooling ? "rate limited" : c.health_status) : "disabled"}
                          </span>
                        </div>

                        <div className="flex items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground flex-wrap">
                          <span className="font-mono">
                            {c.total_requests_served || 0} reqs
                          </span>
                          <span>�</span>
                          <span className="font-mono">
                            ${Number(c.current_month_spend_usd || 0).toFixed(2)} / $
                            {Number(c.monthly_budget_usd || 0).toFixed(2)}
                          </span>
                          <span>�</span>
                          <span className="font-mono">
                            last ok: {c.last_success_at ? new Date(c.last_success_at).toLocaleTimeString() : "never"}
                          </span>
                          {c.last_failure_at && (
                            <>
                              <span>�</span>
                              <span className="font-mono text-warning">
                                last err: {new Date(c.last_failure_at).toLocaleTimeString()}
                              </span>
                            </>
                          )}
                          {c.last_error_reason && (
                            <>
                              <span>�</span>
                              <span className="text-destructive font-mono text-[10px] max-w-[22rem] truncate" title={c.last_error_reason}>
                                {c.last_error_reason}
                              </span>
                            </>
                          )}
                        </div>

                        {budgetPct >= 0 && c.monthly_budget_usd > 0 && (
                          <div className="flex items-center gap-2 pt-0.5">
                            <div className="h-1 w-36 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                              <div
                                className={`h-full ${budgetPct >= 100 ? "bg-destructive" : budgetPct >= 85 ? "bg-warning" : "bg-success"}`}
                                style={{ width: `${budgetPct}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {budgetPct.toFixed(0)}% budget
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleExpandCredential(c)}
                        className="h-7 px-2.5 text-xs font-medium border-border/80"
                        aria-expanded={expanded}
                      >
                        {expanded ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
                        Details
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStartCredentialEdit(c)}
                        className="h-7 px-2.5 text-xs font-medium border-border/80"
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleCredential(c.id, c.is_active)}
                        className={`h-7 px-2.5 text-xs font-medium border-border/80 ${
                          c.is_active
                            ? "hover:bg-warning/10 hover:text-warning"
                            : "hover:bg-success/10 hover:text-success"
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

                  {expanded && (
                    <div className="px-4 pb-4 space-y-3 bg-muted/20 border-t border-border/40">
                      {usageLoading ? (
                        <p className="pt-3 text-[11px] text-muted-foreground flex items-center gap-2">
                          <RefreshCw className="h-3 w-3 animate-spin" /> Loading usage from the cost ledger...
                        </p>
                      ) : usage ? (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-3 text-[11px]">
                            <Metric label="Attempts (30d)" value={String(usage.request_count)} />
                            <Metric label="Success rate" value={`${usage.success_rate_pct}%`} />
                            <Metric label="Tokens" value={usage.total_tokens.toLocaleString()} />
                            <Metric label="Avg latency" value={`${usage.avg_latency_ms} ms`} />
                            <Metric label="Estimated cost" value={`$${usage.estimated_cost_usd.toFixed(4)}`} />
                            <Metric label="Billed cost" value={`$${usage.provider_billed_cost_usd.toFixed(4)}`} />
                          </div>

                          <div className="text-[11px] text-muted-foreground">
                            Month-to-date spend{" "}
                            <span className="font-mono text-foreground">
                              ${usage.monthly_spend_usd.toFixed(4)}
                            </span>{" "}
                            of <span className="font-mono">${usage.monthly_budget_usd.toFixed(2)}</span> ({usage.budget_used_pct}%)
                            {" � "}health probe{" "}
                            <span className="font-mono">
                              {c.last_health_check_at ? new Date(c.last_health_check_at).toLocaleString() : "never"}
                            </span>
                          </div>

                          <div>
                            <h4 className="text-[11px] font-semibold text-foreground mb-1.5">Recent routing events</h4>
                            {usage.recent_events.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground">No routing events recorded for this credential yet.</p>
                            ) : (
                              <ul className="space-y-1">
                                {usage.recent_events.slice(0, 8).map((event) => (
                                  <li key={event.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-muted-foreground">
                                    <span className="text-foreground">{new Date(event.created_at).toLocaleTimeString()}</span>
                                    <OutcomeBadge outcome={event.outcome} />
                                    {event.is_failover && <span className="text-warning">failover#{event.attempt_number}</span>}
                                    <span>strategy={event.strategy}</span>
                                    {event.decision_reason && <span>why={event.decision_reason}</span>}
                                    {event.error_category && <span className="text-destructive">{event.error_category}</span>}
                                    {event.latency_ms > 0 && <span>{event.latency_ms}ms</span>}
                                    {event.error_message && (
                                      <span className="text-destructive/80 max-w-full truncate" title={event.error_message}>
                                        {event.error_message}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="pt-3 text-[11px] text-muted-foreground">No usage data available.</p>
                      )}

                      {editingCredentialId === c.id && (
                        <form onSubmit={handleSaveCredentialEdit} className="rounded-md border border-border/70 bg-card p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[11px] font-semibold text-foreground">Edit routing metadata</h4>
                            <button
                              type="button"
                              onClick={() => setEditingCredentialId(null)}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Cancel editing"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <EditField label="Label">
                              <input
                                required
                                minLength={2}
                                maxLength={100}
                                value={credentialEditForm.label}
                                onChange={(event) => setCredentialEditForm((current) => ({ ...current, label: event.target.value }))}
                                className="w-full rounded-md border border-border/70 bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </EditField>
                            <EditField label="Priority">
                              <input type="number" min={1} required value={credentialEditForm.priority}
                                onChange={(event) => setCredentialEditForm((current) => ({ ...current, priority: event.target.value }))}
                                className="w-full rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </EditField>
                            <EditField label="Routing weight">
                              <input type="number" min={1} required value={credentialEditForm.routing_weight}
                                onChange={(event) => setCredentialEditForm((current) => ({ ...current, routing_weight: event.target.value }))}
                                className="w-full rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </EditField>
                            <EditField label="Monthly budget (USD)">
                              <input type="number" min={0} step="0.01" required value={credentialEditForm.monthly_budget_usd}
                                onChange={(event) => setCredentialEditForm((current) => ({ ...current, monthly_budget_usd: event.target.value }))}
                                className="w-full rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </EditField>
                            <EditField label="Warning threshold (%)">
                              <input type="number" min={1} max={100} required value={credentialEditForm.warning_threshold_pct}
                                onChange={(event) => setCredentialEditForm((current) => ({ ...current, warning_threshold_pct: event.target.value }))}
                                className="w-full rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </EditField>
                            <EditField label="Rate limit (RPM)">
                              <input type="number" min={1} required value={credentialEditForm.rate_limit_rpm}
                                onChange={(event) => setCredentialEditForm((current) => ({ ...current, rate_limit_rpm: event.target.value }))}
                                className="w-full rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </EditField>
                            <EditField label="Rate limit (TPM)">
                              <input type="number" min={1} required value={credentialEditForm.rate_limit_tpm}
                                onChange={(event) => setCredentialEditForm((current) => ({ ...current, rate_limit_tpm: event.target.value }))}
                                className="w-full rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </EditField>
                            <EditField label="Max concurrency (0 = unlimited)">
                              <input type="number" min={0} required value={credentialEditForm.max_concurrency}
                                onChange={(event) => setCredentialEditForm((current) => ({ ...current, max_concurrency: event.target.value }))}
                                className="w-full rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </EditField>
                          </div>
                          <div className="flex justify-end">
                            <Button type="submit" size="sm" disabled={savingCredential} className="h-7 text-xs">
                              {savingCredential ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                              Save metadata
                            </Button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Provider-level routing decision log */}
      <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
        <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground">Routing decision log</h3>
            <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-muted border border-border/60 text-muted-foreground">
              {routingEvents.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={eventsFailuresOnly}
                onChange={(event) => setEventsFailuresOnly(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              Failures only
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadObservability}
              disabled={eventsLoading}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${eventsLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {routingEvents.length === 0 ? (
          <p className="px-4 py-5 text-[11px] text-muted-foreground">
            No routing decisions recorded for {activeProvider.displayName} yet. Events appear once the provider serves a request.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 max-h-80 overflow-y-auto">
            {routingEvents.map((event) => (
              <li key={event.id} className="px-4 py-2 text-[10px] font-mono flex flex-col sm:flex-row sm:items-center gap-x-2 gap-y-1 hover:bg-muted/20">
                <span className="text-muted-foreground shrink-0">{new Date(event.created_at).toLocaleString()}</span>
                <OutcomeBadge outcome={event.outcome} />
                <span className="text-foreground shrink-0">{event.model_name || "any model"}</span>
                <span className="text-muted-foreground shrink-0">
                  {event.credential_label || "�"} ({event.key_prefix || "n/a"})
                </span>
                <span className="text-muted-foreground">mode={event.routing_mode}</span>
                <span className="text-muted-foreground">strategy={event.strategy}</span>
                {event.is_failover && <span className="text-warning">failover#{event.attempt_number}</span>}
                {event.decision_reason && <span className="text-muted-foreground truncate">why={event.decision_reason}</span>}
                {event.error_category && <span className="text-destructive">{event.error_category}</span>}
                {event.retry_after_seconds != null && (
                  <span className="text-warning">retry-after={event.retry_after_seconds}s</span>
                )}
                {event.latency_ms > 0 && <span className="text-muted-foreground">{event.latency_ms}ms</span>}
              </li>
            ))}
          </ul>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-card px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-xs text-foreground mt-0.5">{value}</div>
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function UtilizationBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  if (limit <= 0) {
    return (
      <div className="rounded-md border border-border/60 bg-card px-2.5 py-1.5">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="font-mono text-xs text-foreground mt-0.5">{used.toLocaleString()} used · unlimited</div>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="rounded-md border border-border/60 bg-card px-2.5 py-1.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden" aria-hidden="true">
        <div
          className={`h-full ${pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-success"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
        {used.toLocaleString()} / {limit.toLocaleString()}
      </div>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const tone =
    outcome === "success"
      ? "text-success border-success/30"
      : outcome === "selected"
        ? "text-info border-info/30"
        : "text-destructive border-destructive/30";
  return <span className={`px-1 py-0.2 rounded border ${tone}`}>{outcome}</span>;
}
