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
  XCircle,
  RefreshCw,
  Sliders,
  DollarSign,
  Save,
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
    description: "Powers 1536-dimensional dense vector embeddings for RAG document chunking & search.",
    placeholder: "jina_xxxxxx...\njina_yyyyyy... (Paste multiple keys, one per line)",
  },
  {
    id: "openai",
    name: "openai",
    displayName: "OpenAI / LLM Provider",
    description: "Powers generative answering, reasoning synthesis, and assistant chat turns.",
    placeholder: "sk-proj-xxxxxx...\nsk-proj-yyyyyy... (One per line)",
  },
  {
    id: "deepgram",
    name: "deepgram",
    displayName: "Deepgram (Audio & Speech)",
    description: "Powers voice-to-text transcription and audio document indexing.",
    placeholder: "deepgram_token_1\ndeepgram_token_2",
  },
];

export default function AdminProvidersPage() {
  const [activeTab, setActiveTab] = useState<string>("jina");
  const [tokensRaw, setTokensRaw] = useState<Record<string, string>>({
    jina: "",
    openai: "",
    deepgram: "",
  });
  const [credentials, setCredentials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const pList = await api.getAdminProviders();
      const current = pList.find((p: any) => p.provider_name.toLowerCase().includes(activeTab));
      if (current) {
        const cList = await api.getAdminCredentials(current.id);
        setCredentials(cList);
      } else {
        setCredentials([]);
      }
    } catch (err: any) {
      toast({ message: err.message || "Failed to load provider credentials.", type: "error" });
    } finally {
      setLoading(false);
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
      toast({
        message: `Validated & saved ${res.tokens?.length || 0} tokens for ${activeTab.toUpperCase()}.`,
        type: "success",
      });
      setTokensRaw((prev) => ({ ...prev, [activeTab]: "" }));
      await loadData();
    } catch (err: any) {
      toast({ message: err.message || "Failed to validate and save tokens.", type: "error" });
    } finally {
      setSaving(false);
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
          System AI Providers &amp; Token Failover
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Configure API keys with proactive live validation, remaining balance extraction, and automatic rate-limit failover.
        </p>
      </div>

      {/* Provider Tabs */}
      <div className="flex gap-2 border-b border-border/40 pb-2 overflow-x-auto">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveTab(p.id)}
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

      {/* Main Configuration Card: Simple Textarea input with live validation */}
      <div className="rounded-3xl bg-muted/20 p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-foreground">{activeProvider.displayName} Token Pool</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">{activeProvider.description}</p>
        </div>

        <form onSubmit={handleSaveTokens} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Add / Replace Tokens (Multi-line or comma-separated)</span>
              <span className="text-[11px] text-muted-foreground font-normal">
                Encrypted at rest with AES-CBC &bull; Automated failover priority
              </span>
            </label>
            <textarea
              rows={4}
              value={tokensRaw[activeTab]}
              onChange={(e) => setTokensRaw({ ...tokensRaw, [activeTab]: e.target.value })}
              placeholder={activeProvider.placeholder}
              className="w-full rounded-2xl bg-card border border-border/40 p-4 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 leading-relaxed resize-none shadow-xs"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-muted-foreground">
              Tokens are proactively pinged live before saving.
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
