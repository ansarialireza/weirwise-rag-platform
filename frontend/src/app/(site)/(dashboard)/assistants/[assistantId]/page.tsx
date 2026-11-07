"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  ApiCredential,
  Assistant,
  Deployment,
  KnowledgeSource,
  ConversationItem,
  ConversationMessage,
  KnowledgeGapAnalytics,
} from "@/types";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Globe,
  KeyRound,
  MessageCircle,
  MessageSquare,
  Save,
  Settings2,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { CustomSelect } from "@/components/ui/custom-select";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { SourcesToggle } from "@/components/assistant/sources-toggle";
import { EngineModeCards } from "@/components/assistant/engine-mode-cards";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { formatDate } from "@/lib/i18n/format";

export default function AssistantConfigurePage() {
  const params = useParams();
  const assistantId = params.assistantId as string;
  const { locale, dict } = useI18n();

  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [widgetKey, setWidgetKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("setup");

  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("Auto");
  const [engineMode, setEngineMode] = useState<"search_only" | "ai_answer">("ai_answer");
  // Only a Search Assistant can show sources, so this is invisible the rest of the time.
  const [showSources, setShowSources] = useState(true);
  const [temperature, setTemperature] = useState(0.2);
  const [scoreThreshold, setScoreThreshold] = useState(0.7);
  const [topK, setTopK] = useState(4);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [deployMode, setDeployMode] = useState<"bubble" | "inline" | "link">("bubble");
  const [copied, setCopied] = useState<string | null>(null);
  const [domainsText, setDomainsText] = useState("");
  const [savingDomains, setSavingDomains] = useState(false);
  const [domainsSaved, setDomainsSaved] = useState(false);

  const [apiKeys, setApiKeys] = useState<ApiCredential[]>([]);
  const [apiKeysError, setApiKeysError] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  const [readiness, setReadiness] = useState<{ ready: boolean; errors: string[] } | null>(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);

  // Conversations & History State
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationItem | null>(null);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Knowledge Gaps & Analytics State
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGapAnalytics | null>(null);
  const [loadingGaps, setLoadingGaps] = useState(false);

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const data = await api.getAssistantConversations(assistantId);
      setConversations(data);
      if (data.length > 0 && !selectedConversation) {
        loadMessages(data[0]);
      }
    } catch {
      // Ignored
    } finally {
      setLoadingConversations(false);
    }
  }, [assistantId, selectedConversation]);

  const loadMessages = async (conv: ConversationItem) => {
    setSelectedConversation(conv);
    setLoadingMessages(true);
    try {
      const msgs = await api.getConversationMessages(conv.id);
      setConversationMessages(msgs);
    } catch {
      // Ignored
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadKnowledgeGaps = useCallback(async () => {
    setLoadingGaps(true);
    try {
      const data = await api.getAssistantKnowledgeGaps(assistantId);
      setKnowledgeGaps(data);
    } catch {
      // Ignored
    } finally {
      setLoadingGaps(false);
    }
  }, [assistantId]);

  useEffect(() => {
    if (tab === "conversations") {
      loadConversations();
    } else if (tab === "analytics") {
      loadKnowledgeGaps();
    }
  }, [tab, loadConversations, loadKnowledgeGaps]);

  useEffect(() => {
    if (!assistantId) return;
    Promise.all([api.getAssistant(assistantId), api.getSources(), api.getDeployments(assistantId)])
      .then(([a, sList, deployments]) => {
        setAssistant(a);
        document.title = `${a.name} · Weirwise`;
        setName(a.name);
        setInstructions(a.system_instructions || "");
        setModel(a.model);
        setEngineMode((a.engine_mode as "search_only" | "ai_answer") || "ai_answer");
        setShowSources(a.show_sources !== false);
        setTemperature(a.temperature);
        setScoreThreshold(a.score_threshold);
        setTopK(a.top_k || 4);
        setSelectedSourceIds(a.knowledge_source_ids || []);
        setSources(sList);
        setDeployments(deployments);
        const active = deployments.find((d) => d.is_active);
        setWidgetKey(active?.public_key || null);
        setDomainsText((active?.allowed_domains || []).join(", "));
      })
      .catch((err: any) => {
        setErrorMessage(err.message || "We couldn't load this assistant. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [assistantId]);

  const loadReadiness = useCallback(async () => {
    setCheckingReadiness(true);
    try {
      const result = await api.checkPublishReadiness(assistantId);
      setReadiness(result);
    } catch {
      setReadiness(null);
    } finally {
      setCheckingReadiness(false);
    }
  }, [assistantId]);

  useEffect(() => {
    if (tab === "share") {
      loadReadiness();
    }
  }, [tab, loadReadiness]);

  const loadApiKeys = useCallback(async () => {
    try {
      const keys = await api.listApiCredentials();
      setApiKeys(keys);
      setApiKeysError(null);
    } catch (err: any) {
      setApiKeysError(err.message || "Only workspace owners and admins can manage API keys.");
    }
  }, []);

  useEffect(() => {
    if (tab === "share") loadApiKeys();
  }, [tab, loadApiKeys]);

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const updated = await api.updateAssistant(assistantId, {
        name: name.trim(),
        system_instructions: instructions.trim(),
        model,
        engine_mode: engineMode,
        show_sources: showSources,
        temperature,
        score_threshold: scoreThreshold,
        top_k: topK,
        knowledge_source_ids: selectedSourceIds,
      });
      setAssistant(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || "We couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setErrorMessage(null);
    try {
      await api.updateAssistant(assistantId, {
        name: name.trim(),
        system_instructions: instructions.trim(),
        model,
        engine_mode: engineMode,
        show_sources: showSources,
        temperature,
        score_threshold: scoreThreshold,
        top_k: topK,
        knowledge_source_ids: selectedSourceIds,
      });
      const updated = await api.publishAssistant(assistantId);
      setAssistant(updated);
      const deployments = await api.getDeployments(assistantId);
      setDeployments(deployments);
      const active = deployments.find((d) => d.is_active);
      setWidgetKey(active?.public_key || null);
      setDomainsText((active?.allowed_domains || []).join(", "));
      setPublishSuccess(true);
      setReadiness({ ready: true, errors: [] });
      setTimeout(() => setPublishSuccess(false), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || "Publishing failed.");
      loadReadiness();
    } finally {
      setPublishing(false);
    }
  };

  const activeDeployment = deployments.find((deployment) => deployment.is_active) || null;
  const [siteOrigin, setSiteOrigin] = useState("");
  useEffect(() => setSiteOrigin(window.location.origin), []);
  const origin = siteOrigin;
  const bubbleCode = `<script src="${origin}/widget.js" data-assistant-id="${assistantId}"${
    widgetKey ? ` data-key="${widgetKey}"` : ""
  } defer></script>`;
  const inlineCode = `<iframe
  src="${origin}/embed/${assistantId}${widgetKey ? `?key=${widgetKey}` : ""}"
  width="100%"
  height="600"
  style="border: 1px solid #c5c9ce; border-radius: 12px;"
  title="${name || "Weirwise assistant"}"
></iframe>`;
  const shareLink = `${origin}/embed/${assistantId}`;
  const apiExample = [
    `curl -X POST "${origin}/api/v1/public/assistants/${assistantId}/chat" \\`,
    '  -H "X-API-Key: wwp_live_..." \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"message":"How do I return an item?"}\'',
  ].join("\n");

  const handleSaveDomains = async () => {
    if (!activeDeployment) return;
    setSavingDomains(true);
    setErrorMessage(null);
    setDomainsSaved(false);
    const allowed = domainsText
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    try {
      const updated = await api.updateDeployment(assistantId, activeDeployment.id, {
        allowed_domains: allowed,
      });
      setDeployments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setDomainsSaved(true);
      setTimeout(() => setDomainsSaved(false), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || "We couldn't update the allowed websites.");
    } finally {
      setSavingDomains(false);
    }
  };

  const handleCreateKey = async () => {
    if (!keyName.trim()) return;
    setCreatingKey(true);
    setApiKeysError(null);
    setNewRawKey(null);
    try {
      const credential = await api.createApiCredential({
        name: keyName.trim(),
        scopes: ["assistants:read", "assistants:chat"],
      });
      setNewRawKey(credential.raw_api_key || null);
      setKeyName("");
      await loadApiKeys();
    } catch (err: any) {
      setApiKeysError(err.message || "We couldn't create an API key.");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (credentialId: string) => {
    setRevokingKeyId(credentialId);
    setApiKeysError(null);
    try {
      await api.revokeApiCredential(credentialId);
      setNewRawKey(null);
      await loadApiKeys();
    } catch (err: any) {
      setApiKeysError(err.message || "We couldn't revoke that key.");
    } finally {
      setRevokingKeyId(null);
    }
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleSource = (sourceId: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(sourceId) ? prev.filter((id) => id !== sourceId) : [...prev, sourceId]
    );
  };

  const confidenceLabel =
    scoreThreshold >= 0.85 ? "Very strict" : scoreThreshold >= 0.7 ? "Balanced" : "Flexible";
  const contextLabel = topK <= 3 ? "Focused" : topK <= 6 ? "Balanced" : "Broad";

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-64" />
        </div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/assistants"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
        All assistants
      </Link>

      <PageHeader
        title={name || "Assistant"}
        badge={
          <div className="flex items-center gap-2">
            <StatusPill status={assistant?.status || "draft"} />
            <span className="text-xs text-muted-foreground">v{assistant?.version || 1}</span>
          </div>
        }
        description="Shape how it answers, choose what it knows, then share it."
        actions={
          <>
            <Link
              href={`/playground?assistantId=${assistantId}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Test
            </Link>
            <Button onClick={() => handleSave()} isLoading={saving} className="gap-2">
              <Save className="h-4 w-4" />
              Save
            </Button>
          </>
        }
      />

      {saveSuccess && (
        <Alert
          type="success"
          title="Changes saved"
          message={
            assistant?.status === "published"
              ? "Saved as a draft. Publish again to update the live version."
              : "Your assistant settings are up to date."
          }
        />
      )}

      {publishSuccess && (
        <Alert
          type="success"
          title="Published"
          message={`Version ${assistant?.version} is now live and ready to share.`}
        />
      )}

      {errorMessage && <Alert type="destructive" title="Something went wrong" message={errorMessage} />}

      <Tabs
        tabs={[
          { id: "setup", label: "Setup", icon: Settings2 },
          { id: "share", label: "Deploy", icon: Share2 },
          { id: "conversations", label: "Conversations", icon: MessageSquare },
          { id: "analytics", label: "Knowledge Gaps", icon: TrendingUp },
        ]}
        activeTab={tab}
        onChange={setTab}
        className="w-full sm:w-fit"
      />

      {tab === "setup" && (
        <form onSubmit={handleSave} className="space-y-5">
          {/* Identity */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Identity</h2>
            </div>

            <div className="mt-4 space-y-4">
              <Input
                label="Name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Assistant name"
              />

              <fieldset className="space-y-1.5">
                <legend className="mb-1.5 block text-[13px] font-medium text-foreground">
                  How should it respond?
                </legend>
                {/* The switch lives inside the card it belongs to, and the drawing in
                    that card is its preview: flip it and the passages the reader gets
                    appear or collapse. An AI Assistant never renders it at all. */}
                <EngineModeCards
                  value={engineMode}
                  onChange={setEngineMode}
                  searchControlOn={showSources}
                  searchControl={
                    <SourcesToggle
                      enabled={showSources}
                      onChange={setShowSources}
                      label={dict.common.sources}
                      showLabel={false}
                    />
                  }
                />
              </fieldset>

              {engineMode === "ai_answer" && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="assistant-instructions"
                    className="block text-[13px] font-medium text-foreground"
                  >
                    Personality and rules
                  </label>
                  <textarea
                    id="assistant-instructions"
                    rows={4}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="e.g. Be concise and friendly. Always mention the policy name."
                    className="w-full resize-none rounded-lg border border-border bg-input p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </div>
              )}
            </div>
          </section>

          {/* Knowledge */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Knowledge</h2>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {selectedSourceIds.length} attached
              </span>
            </div>

            {sources.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-8 text-center">
                <FileText className="mx-auto h-5 w-5 text-muted-foreground/70" />
                <p className="mt-2 text-sm font-medium text-foreground">No knowledge yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add documents first, then choose them here.
                </p>
                <Link
                  href="/sources"
                  className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground"
                >
                  Add knowledge
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {sources.map((source) => {
                  const attached = selectedSourceIds.includes(source.id);
                  return (
                    <button
                      key={source.id}
                      type="button"
                      role="checkbox"
                      aria-checked={attached}
                      onClick={() => toggleSource(source.id)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border p-3 text-start transition-colors",
                        attached
                          ? "border-accent/40 bg-accent-soft"
                          : "border-border bg-background hover:bg-muted/50"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                          attached
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border bg-card text-transparent"
                        )}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-foreground">
                          {source.name}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {source.document_count ?? 0} document
                          {(source.document_count ?? 0) === 1 ? "" : "s"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Behaviour / advanced */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Answer behaviour</h2>
            </div>

            <div className="mt-4 space-y-5">
              {engineMode === "ai_answer" && (
                <CustomSelect
                  label="Answer style"
                  value={model}
                  onChange={setModel}
                  options={[
                    { value: "Auto", label: "Auto (recommended)", description: "Balanced speed and depth" },
                    { value: "Fast", label: "Fast", description: "Lowest latency" },
                    {
                      value: "Deep Thinking",
                      label: "Deep thinking",
                      description: "For complex, multi-step questions",
                    },
                  ]}
                />
              )}

              <details className="group rounded-xl border border-border bg-background/60 px-3.5 py-3">
                <summary className="cursor-pointer list-none text-[13px] font-medium text-foreground">
                  Advanced tuning
                  <span className="ms-1 font-normal text-muted-foreground">
                    — only if you need finer control
                  </span>
                </summary>

                <div className="mt-4 space-y-5 border-t border-border/60 pt-4">
                  {engineMode === "ai_answer" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="font-medium text-foreground">Creativity</span>
                        <span className="text-muted-foreground">
                          {temperature <= 0.25
                            ? "Precise"
                            : temperature <= 0.6
                              ? "Balanced"
                              : "Expressive"}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        aria-label="Creativity"
                        className="w-full cursor-pointer accent-accent"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Lower keeps wording close to the source.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="font-medium text-foreground">Answer confidence</span>
                      <span className="text-muted-foreground">{confidenceLabel}</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="0.95"
                      step="0.05"
                      value={scoreThreshold}
                      onChange={(e) => setScoreThreshold(parseFloat(e.target.value))}
                      aria-label="Answer confidence threshold"
                      className="w-full cursor-pointer accent-accent"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Higher values make the assistant say “I don’t know” more often.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="font-medium text-foreground">Context depth</span>
                      <span className="text-muted-foreground">{contextLabel}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      value={topK}
                      onChange={(e) => setTopK(parseInt(e.target.value))}
                      aria-label="Context depth"
                      className="w-full cursor-pointer accent-accent"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      How much material the assistant reads before answering.
                    </p>
                  </div>
                </div>
              </details>
            </div>
          </section>
        </form>
      )}

      {tab === "share" && (
        <div className="space-y-5">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Publish and share</h2>
                </div>
                <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                  Publishing creates a live version from your current setup. You can keep editing and
                  publish again whenever you&apos;re ready.
                </p>
              </div>
              {assistant?.status === "published" && (
                <StatusPill status="published" label={`Live · v${assistant.version}`} />
              )}
            </div>

            <div className="mt-5 rounded-xl border border-border bg-background/60 p-4">
              <div className="flex items-start gap-2.5">
                {checkingReadiness ? (
                  <span className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                ) : readiness?.ready ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground">
                    {checkingReadiness
                      ? "Checking readiness…"
                      : readiness?.ready
                        ? "Ready to publish"
                        : "A few things to finish first"}
                  </p>
                  {!checkingReadiness && readiness && readiness.errors.length > 0 && (
                    <ul className="mt-1.5 list-inside list-disc space-y-1 text-[12px] text-muted-foreground">
                      {readiness.errors.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  {!checkingReadiness && readiness?.ready && (
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      Name, knowledge, and sharing look good.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                onClick={handlePublish}
                isLoading={publishing}
                disabled={checkingReadiness || (readiness ? !readiness.ready : false)}
                variant="signal"
                className="gap-2"
              >
                <ArrowUpRight className="h-4 w-4" />
                {assistant?.status === "published" ? "Publish new version" : "Publish"}
              </Button>
              {assistant?.status === "published" && (
                <a
                  href={shareLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open live preview
                </a>
              )}
              <button
                type="button"
                onClick={loadReadiness}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Check again
              </button>
            </div>
          </section>

          {assistant?.status === "published" ? (
            <div className="space-y-5">
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Add it to your website</h2>
                </div>
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                  Pick how it should appear. Every option uses the same live version, so publishing
                  again updates them all.
                </p>

                <div
                  role="tablist"
                  aria-label="Deployment method"
                  className="mt-4 inline-flex flex-wrap gap-1 rounded-xl border border-border bg-background p-1"
                >
                  {[
                    { id: "bubble" as const, label: "Chat bubble", icon: MessageCircle },
                    { id: "inline" as const, label: "Inline frame", icon: Code2 },
                    { id: "link" as const, label: "Share link", icon: ExternalLink },
                  ].map((option) => {
                    const Icon = option.icon;
                    const selected = deployMode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setDeployMode(option.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                          selected
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {deployMode === "bubble" && (
                  <div className="mt-4">
                    <p className="text-[13px] text-muted-foreground">
                      Adds a floating chat button to every page. Paste this before{" "}
                      <code className="rounded bg-muted px-1 py-0.5 text-[12px]">&lt;/body&gt;</code>.
                    </p>
                    <div className="relative mt-3">
                      <pre className="overflow-x-auto rounded-xl border border-border bg-onyx p-4 pe-24 text-[12px] leading-relaxed text-white/80">
                        <code>{bubbleCode}</code>
                      </pre>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyText(bubbleCode, "bubble")}
                        className="absolute end-2 top-2 gap-1.5"
                      >
                        {copied === "bubble" ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-success" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {deployMode === "inline" && (
                  <div className="mt-4">
                    <p className="text-[13px] text-muted-foreground">
                      Embeds the conversation directly in a page, post, or help center article.
                    </p>
                    <div className="relative mt-3">
                      <pre className="overflow-x-auto rounded-xl border border-border bg-onyx p-4 pe-24 text-[12px] leading-relaxed text-white/80">
                        <code>{inlineCode}</code>
                      </pre>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyText(inlineCode, "inline")}
                        className="absolute end-2 top-2 gap-1.5"
                      >
                        {copied === "inline" ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-success" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {deployMode === "link" && (
                  <div className="mt-4">
                    <p className="text-[13px] text-muted-foreground">
                      Send this link to anyone who should use the assistant outside a website.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2.5 text-[12px] text-foreground">
                        {shareLink}
                      </code>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => copyText(shareLink, "link")}
                          className="gap-1.5"
                        >
                          {copied === "link" ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-success" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              Copy
                            </>
                          )}
                        </Button>
                        <a
                          href={shareLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/70"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal" />
                  The snippet contains a public key. It only works on the websites you allow below.
                </div>
              </section>

              {activeDeployment && (
                <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">Allowed websites</h2>
                  </div>
                  <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                    Stop other sites from using your public key. Leave this empty to accept every
                    website, or list the domains that should work.
                  </p>
                  <label htmlFor="allowed-domains" className="mt-4 block text-[13px] font-medium text-foreground">
                    Domains
                  </label>
                  <textarea
                    id="allowed-domains"
                    rows={2}
                    value={domainsText}
                    onChange={(event) => setDomainsText(event.target.value)}
                    placeholder="acme.com, www.acme.com, *.acme.com"
                    className="mt-1.5 w-full resize-none rounded-lg border border-border bg-input p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Separate entries with commas or new lines. Use *.example.com for every
                      subdomain.
                    </p>
                    <div className="flex items-center gap-3">
                      {domainsSaved && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Saved
                        </span>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveDomains}
                        isLoading={savingDomains}
                      >
                        Save websites
                      </Button>
                    </div>
                  </div>
                </section>
              )}

              <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">API access</h2>
                </div>
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                  Connect a backend, mobile app, or support tool. Keys are workspace-wide and can be
                  revoked at any time.
                </p>

                {apiKeysError ? (
                  <div className="mt-4 rounded-xl border border-border bg-background/60 p-4 text-[13px] text-muted-foreground">
                    {apiKeysError}
                  </div>
                ) : (
                  <>
                    {newRawKey && (
                      <div className="mt-4 space-y-2">
                        <Alert
                          type="success"
                          title="Copy your key now"
                          message="For security, this key won't be shown again."
                        />
                        <div className="flex items-center gap-2">
                          <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2.5 text-[12px] text-foreground">
                            {newRawKey}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => copyText(newRawKey, "new-key")}
                            className="gap-1.5"
                          >
                            {copied === "new-key" ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-success" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                Copy
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}

                    <form
                      className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
                      onSubmit={(event) => {
                        event.preventDefault();
                        handleCreateKey();
                      }}
                    >
                      <div className="flex-1">
                        <Input
                          label="Key name"
                          value={keyName}
                          onChange={(event) => setKeyName(event.target.value)}
                          placeholder="e.g. Support backend"
                          maxLength={255}
                        />
                      </div>
                      <Button type="submit" isLoading={creatingKey} disabled={!keyName.trim()}>
                        Create key
                      </Button>
                    </form>

                    {apiKeys.length > 0 && (
                      <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
                        {apiKeys.map((credential) => (
                          <li
                            key={credential.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-foreground">
                                {credential.name}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {credential.key_prefix}… ·{" "}
                                {formatDate(credential.created_at, locale)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                  credential.is_active
                                    ? "bg-success/10 text-success"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                {credential.is_active ? "Active" : "Revoked"}
                              </span>
                              {credential.is_active && (
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  isLoading={revokingKeyId === credential.id}
                                  onClick={() => handleRevokeKey(credential.id)}
                                  className="gap-1.5"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Revoke
                                </Button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-4">
                      <p className="text-[13px] font-medium text-foreground">Example request</p>
                      <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-onyx p-4 text-[12px] leading-relaxed text-white/80">
                        <code>{apiExample}</code>
                      </pre>
                    </div>
                  </>
                )}
              </section>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
              <Share2 className="mx-auto h-5 w-5 text-muted-foreground/70" />
              <p className="mt-2 text-sm font-medium text-foreground">Nothing shared yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Publish this assistant to get a link you can share or add to your website.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "conversations" && (
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between border-b border-border/70 pb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Customer Conversations</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  History of inquiries, customer interactions, and escalations.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={loadConversations} isLoading={loadingConversations}>
                Refresh
              </Button>
            </div>

            {loadingConversations ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading conversations…</div>
            ) : conversations.length === 0 ? (
              <div className="py-12 text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm font-medium text-foreground">No conversations yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  When visitors talk to this assistant in Playground or via your published widget, chats appear here.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-12">
                <div className="space-y-2 lg:col-span-4 max-h-[500px] overflow-y-auto">
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => loadMessages(conv)}
                      className={cn(
                        "w-full text-start p-3 rounded-lg border transition-colors text-xs",
                        selectedConversation?.id === conv.id
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border bg-card text-foreground hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-center justify-between font-medium">
                        <span className="truncate max-w-[70%]">{conv.title || "Customer Inquiry"}</span>
                        {conv.is_escalated && (
                          <span className="bg-destructive/10 text-destructive text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">
                            ESCALATED
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{conv.message_count} messages</span>
                        <span>{formatDate(conv.created_at, locale)}</span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="rounded-lg border border-border bg-background p-4 lg:col-span-8 min-h-[350px] max-h-[500px] overflow-y-auto flex flex-col justify-between">
                  {loadingMessages ? (
                    <div className="m-auto text-xs text-muted-foreground">Loading messages…</div>
                  ) : !selectedConversation ? (
                    <div className="m-auto text-xs text-muted-foreground">Select a conversation to inspect messages.</div>
                  ) : (
                    <div className="space-y-3">
                      {conversationMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "p-3 rounded-lg text-xs leading-relaxed max-w-[85%]",
                            msg.role === "user"
                              ? "ms-auto bg-primary text-primary-foreground"
                              : "bg-muted/60 text-foreground border border-border/60"
                          )}
                        >
                          <div className="text-[10px] font-mono opacity-70 mb-1 uppercase tracking-wider">
                            {msg.role}
                          </div>
                          <p>{msg.content}</p>
                          {msg.citations && msg.citations.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
                              {msg.citations.length} cited source{msg.citations.length === 1 ? "" : "s"}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "analytics" && (
        <div className="space-y-5">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between border-b border-border/70 pb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Knowledge Gap Detection & Analytics</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Identifies unanswered inquiries and topics lacking reliable grounding evidence.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={loadKnowledgeGaps} isLoading={loadingGaps}>
                Refresh
              </Button>
            </div>

            {loadingGaps ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading gap intelligence…</div>
            ) : !knowledgeGaps ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No analytics recorded yet.</div>
            ) : (
              <div className="mt-5 space-y-6">
                {/* Metric Cards */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <span className="text-[11px] font-mono uppercase text-muted-foreground">Unanswered Queries</span>
                    <div className="mt-1 text-2xl font-bold font-mono text-foreground">
                      {knowledgeGaps.total_unanswered}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <span className="text-[11px] font-mono uppercase text-muted-foreground">Satisfaction Rate</span>
                    <div className="mt-1 text-2xl font-bold font-mono text-[#CCFF00]">
                      {knowledgeGaps.satisfaction_rate_pct}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <span className="text-[11px] font-mono uppercase text-muted-foreground">Visitor Feedback</span>
                    <div className="mt-1 text-2xl font-bold font-mono text-foreground">
                      +{knowledgeGaps.positive_feedback_count} / -{knowledgeGaps.negative_feedback_count}
                    </div>
                  </div>
                </div>

                {/* Top Unanswered Questions */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground mb-3">
                    Unanswered Customer Questions
                  </h3>
                  {knowledgeGaps.top_unanswered_questions.length === 0 ? (
                    <div className="rounded-lg border border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
                      No unresolved questions recorded. Your knowledge base is adequately covering inquiries!
                    </div>
                  ) : (
                    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                      {knowledgeGaps.top_unanswered_questions.map((q) => (
                        <div key={q.id} className="p-3 text-xs flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-foreground block truncate">{q.query}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              Reason: {q.reason} · {formatDate(q.date, locale)}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono uppercase bg-accent-soft text-accent px-2 py-0.5 rounded font-bold shrink-0">
                            NEEDS KNOWLEDGE
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
