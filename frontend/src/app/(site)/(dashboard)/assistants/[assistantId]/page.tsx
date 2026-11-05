"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Assistant, KnowledgeSource } from "@/types";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Save,
  Search,
  Settings2,
  Share2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { CustomSelect } from "@/components/ui/custom-select";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export default function AssistantConfigurePage() {
  const params = useParams();
  const assistantId = params.assistantId as string;

  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [widgetKey, setWidgetKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("setup");

  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("Auto");
  const [engineMode, setEngineMode] = useState<"search_only" | "ai_answer">("ai_answer");
  const [temperature, setTemperature] = useState(0.2);
  const [scoreThreshold, setScoreThreshold] = useState(0.7);
  const [topK, setTopK] = useState(4);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  const [readiness, setReadiness] = useState<{ ready: boolean; errors: string[] } | null>(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);

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
        setTemperature(a.temperature);
        setScoreThreshold(a.score_threshold);
        setTopK(a.top_k || 4);
        setSelectedSourceIds(a.knowledge_source_ids || []);
        setSources(sList);
        setWidgetKey(deployments.find((d) => d.is_active)?.public_key || null);
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
        temperature,
        score_threshold: scoreThreshold,
        top_k: topK,
        knowledge_source_ids: selectedSourceIds,
      });
      const updated = await api.publishAssistant(assistantId);
      setAssistant(updated);
      const deployments = await api.getDeployments(assistantId);
      setWidgetKey(deployments.find((d) => d.is_active)?.public_key || null);
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

  const handleCopyEmbed = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedEmbed(true);
    setTimeout(() => setCopiedEmbed(false), 2000);
  };

  const toggleSource = (sourceId: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(sourceId) ? prev.filter((id) => id !== sourceId) : [...prev, sourceId]
    );
  };

  const embedSrc = `${typeof window !== "undefined" ? window.location.origin : ""}/embed/${assistantId}${
    widgetKey ? `?key=${encodeURIComponent(widgetKey)}` : ""
  }`;
  const embedCode = `<iframe
  src="${embedSrc}"
  width="100%"
  height="600"
  style="border: 1px solid #c5c9ce; border-radius: 12px;"
  title="${name || "Weirwise assistant"}"
></iframe>`;

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
          { id: "share", label: "Share", icon: Share2 },
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
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    {
                      value: "ai_answer" as const,
                      title: "AI answers",
                      description: "A written answer with its sources attached.",
                      icon: Sparkles,
                    },
                    {
                      value: "search_only" as const,
                      title: "Search only",
                      description: "Matching passages, without a written answer.",
                      icon: Search,
                    },
                  ].map((option) => {
                    const Icon = option.icon;
                    const selected = engineMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setEngineMode(option.value)}
                        aria-pressed={selected}
                        className={cn(
                          "rounded-xl border p-3.5 text-start transition-colors",
                          selected
                            ? "border-accent/50 bg-accent-soft"
                            : "border-border bg-background hover:bg-muted/50"
                        )}
                      >
                        <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                          <Icon
                            className={cn(
                              "h-4 w-4",
                              selected ? "text-accent" : "text-muted-foreground"
                            )}
                          />
                          {option.title}
                        </span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
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
                  href={embedSrc}
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
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Embed on your website</h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Paste this snippet where the assistant should appear.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyEmbed(embedCode)}
                  className="gap-1.5"
                >
                  {copiedEmbed ? (
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

              <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-onyx p-4 text-[12px] leading-relaxed text-white/80">
                <code>{embedCode}</code>
              </pre>

              <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-signal" />
                Share this link with anyone who should use the assistant.
              </div>
            </section>
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
    </div>
  );
}
