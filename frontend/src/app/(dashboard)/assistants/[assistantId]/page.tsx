"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Assistant, KnowledgeSource } from "@/types";
import {
  Bot,
  Sliders,
  CheckCircle2,
  ArrowUpRight,
  Save,
  ArrowLeft,
  FileText,
  AlertCircle,
  Copy,
  Check,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Alert } from "@/components/ui/alert";
import { CustomSelect } from "@/components/ui/custom-select";
import { BrutalistLoader } from "@/components/ui/brutalist-loader";

export default function AssistantConfigurePage() {
  const params = useParams();
  const router = useRouter();

  const assistantId = params.assistantId as string;

  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [widgetKey, setWidgetKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form State
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("Auto");
  const [engineMode, setEngineMode] = useState<"search_only" | "ai_answer">("ai_answer");
  const [temperature, setTemperature] = useState(0.2);
  const [scoreThreshold, setScoreThreshold] = useState(0.7);
  const [topK, setTopK] = useState(4);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

  // Action states
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  useEffect(() => {
    if (assistantId) {
      Promise.all([
        api.getAssistant(assistantId),
        api.getSources(),
        api.getDeployments(assistantId),
      ])
        .then(([a, sList, deployments]) => {
          setAssistant(a);
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
          setErrorMessage(err.message || "Failed to load assistant configuration.");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [assistantId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setErrorMessage(err.message || "Failed to save assistant changes.");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setErrorMessage(null);
    try {
      const updated = await api.publishAssistant(assistantId);
      setAssistant(updated);
      const deployments = await api.getDeployments(assistantId);
      setWidgetKey(deployments.find((d) => d.is_active)?.public_key || null);
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || "Publishing failed.");
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
    if (selectedSourceIds.includes(sourceId)) {
      setSelectedSourceIds(selectedSourceIds.filter((id) => id !== sourceId));
    } else {
      setSelectedSourceIds([...selectedSourceIds, sourceId]);
    }
  };

  const embedSrc = `${typeof window !== "undefined" ? window.location.origin : ""}/embed/${assistantId}${
    widgetKey ? `?key=${encodeURIComponent(widgetKey)}` : ""
  }`;

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <BrutalistLoader label="RETRIEVING ASSISTANT" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-200 w-full overflow-hidden">
      {/* Breadcrumb / Top Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-center gap-3.5 min-w-0">
          <Link
            href={`/assistants`}
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                {name || "Configure Assistant"}
              </h1>
              <Badge variant={assistant?.status === "published" ? "success" : "outline"} className="text-xs px-2.5 py-0.5 shrink-0 rounded-sm">
                v{assistant?.version || 1} • {assistant?.status || "draft"}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Link
            href={`/playground?assistantId=${assistantId}`}
            className="flex-1 sm:flex-initial"
          >
            <Button variant="outline" size="sm" className="w-full sm:w-auto h-9 px-3 text-xs font-semibold gap-1.5 rounded-md border-zinc-800 hover:border-zinc-700">
              <Sliders className="h-4 w-4" /> Playground
            </Button>
          </Link>

          <Button
            variant="secondary"
            size="sm"
            onClick={handlePublish}
            isLoading={publishing}
            className="flex-1 sm:flex-initial h-9 px-3 text-xs font-semibold gap-1.5 rounded-md"
          >
            <ArrowUpRight className="h-4 w-4" /> Publish Snapshot
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={saving}
            className="flex-1 sm:flex-initial h-9 px-3.5 text-xs font-bold gap-1.5 rounded-md"
          >
            <Save className="h-4 w-4" /> Save
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <Alert
          type="success"
          title="Configuration Saved"
          message="Assistant settings updated successfully."
        />
      )}

      {publishSuccess && (
        <Alert
          type="success"
          title="Snapshot Published"
          message={`Assistant snapshot version ${assistant?.version} published for immutable inference.`}
        />
      )}

      {errorMessage && (
        <Alert
          type="destructive"
          title="Error"
          message={errorMessage}
        />
      )}

      {/* Main Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Core Identity Section */}
        <div className="rounded-md border border-zinc-800 bg-zinc-950/20 p-6 space-y-5">
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-[#46C7D6]" />
            General Identity &amp; Role
          </h2>

          {/* Engine Mode Primary Selector */}
          <div className="space-y-3 p-4 rounded-md bg-zinc-900/40 border border-zinc-800">
            <div className="space-y-0.5">
              <label className="text-xs font-mono font-bold uppercase tracking-wider text-foreground">Engine Mode</label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setEngineMode("search_only")}
                className={`p-3.5 rounded-md text-left border transition-all flex flex-col justify-between ${
                  engineMode === "search_only"
                    ? "border-zinc-600 bg-zinc-900 text-foreground shadow-xs"
                    : "border-zinc-800 bg-zinc-950/40 text-muted-foreground hover:bg-zinc-900/40"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">Semantic Search</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-400">Retrieval Only</span>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setEngineMode("ai_answer")}
                className={`p-3.5 rounded-md text-left border transition-all flex flex-col justify-between ${
                  engineMode === "ai_answer"
                    ? "border-zinc-600 bg-zinc-900 text-foreground shadow-xs"
                    : "border-zinc-800 bg-zinc-950/40 text-muted-foreground hover:bg-zinc-900/40"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">AI Answer</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm border border-zinc-800 bg-zinc-900 text-[#46C7D6]">AI Generated</span>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className={`space-y-2 ${engineMode === "search_only" ? "md:col-span-2" : ""}`}>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assistant Name</label>
              <Input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Assistant display name"
                className="h-10 text-sm font-semibold"
              />
            </div>

            {engineMode === "ai_answer" && (
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-medium text-muted-foreground">AI Routing Strategy</label>
                <CustomSelect
                  value={model}
                  onChange={(val) => setModel(val)}
                  triggerClassName="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950/40 px-3.5 text-xs font-medium text-foreground"
                  options={[
                    { value: "Auto", label: "Auto", description: "Balanced Speed & Reasoning" },
                    { value: "Fast", label: "Fast", description: "Low Latency inference" },
                    { value: "Deep Thinking", label: "Deep Thinking", description: "Complex Analysis and multi-step reasoning" },
                  ]}
                />
              </div>
            )}
          </div>

          {engineMode === "ai_answer" && (
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-mono font-medium text-muted-foreground">System Instructions (Prompt)</label>
              <textarea
                rows={5}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Specify the assistant's behavior, role boundaries, citation format, and response tone..."
                className="w-full rounded-md border border-zinc-800 bg-zinc-950/40 p-3.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-zinc-600 focus:outline-none font-mono leading-relaxed"
              />
            </div>
          )}
        </div>

        {/* Hyperparameter Thresholds */}
        <div className="rounded-md border border-zinc-800 bg-zinc-950/20 p-6 space-y-6">
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2.5">
            <Sliders className="h-4 w-4 text-[#46C7D6]" />
            Retrieval &amp; Inference Parameters
          </h2>

          <div className={`grid grid-cols-1 ${engineMode === "ai_answer" ? "md:grid-cols-3" : "md:grid-cols-2"} gap-6 transition-all duration-200`}>
            {engineMode === "ai_answer" && (
              <div className="space-y-2 p-4 rounded-md border border-zinc-800 bg-zinc-900/40">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-foreground">Temperature</span>
                  <span className="font-mono text-[#46C7D6] font-bold">{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-white cursor-pointer"
                />
              </div>
            )}

            <div className="space-y-2 p-4 rounded-md border border-zinc-800 bg-zinc-900/40">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-foreground">Match Strictness</span>
                <span className="font-mono text-[#46C7D6] font-bold">{scoreThreshold}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(parseFloat(e.target.value))}
                className="w-full accent-white cursor-pointer"
              />
            </div>

            <div className="space-y-2 p-4 rounded-md border border-zinc-800 bg-zinc-900/40">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-foreground">Passages to Use</span>
                <span className="font-mono text-[#46C7D6] font-bold">{topK}</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value))}
                className="w-full accent-white cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Web Widget Embed & Integration Snippet (Available for Published Snapshots) */}
        {assistant?.status === "published" && (
          <div className="rounded-md border border-zinc-800 bg-zinc-950/20 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-[#46C7D6]" />
                Website Embed Snippet
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm border border-zinc-800 bg-zinc-900 text-emerald-400">Live Snapshot v{assistant.version}</span>
            </div>

            <div className="relative rounded-md border border-zinc-800 bg-zinc-900/40 p-3 sm:p-4">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800 text-xs font-mono text-muted-foreground">
                <span>HTML Responsive Snippet</span>
                <button
                  type="button"
                  onClick={() => handleCopyEmbed(`<iframe\n  src="${embedSrc}"\n  width="100%"\n  height="600"\n  frameborder="0"\n  style="border-radius: 6px; border: 1px solid #27272a;"\n  title="${name || "Weirwise AI Assistant"}"\n></iframe>`)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-foreground text-xs font-medium transition-colors"
                >
                  {copiedEmbed ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-white" />
                      <span className="text-white font-bold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Snippet</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre p-1">
{`<iframe
  src="${embedSrc}"
  width="100%"
  height="600"
  frameborder="0"
  style="border-radius: 6px; border: 1px solid #27272a;"
  title="${name || "Weirwise AI Assistant"}"
></iframe>`}
              </pre>
            </div>
          </div>
        )}

        {/* Attached Knowledge Sources */}
        <div className="rounded-md border border-zinc-800 bg-zinc-950/20 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-300">Attached Knowledge Sources</h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-400">{selectedSourceIds.length} Attached</span>
          </div>

          {sources.length === 0 ? (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-8 text-center text-xs text-zinc-400">
              No sources connected yet. Ingest files in Knowledge Base first.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sources.map((s) => {
                const isAttached = selectedSourceIds.includes(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() => toggleSource(s.id)}
                    className={`flex items-center justify-between p-3.5 rounded-md border cursor-pointer transition-all ${
                      isAttached
                        ? "border-zinc-600 bg-zinc-900 text-foreground"
                        : "border-zinc-800 bg-zinc-950/40 text-muted-foreground hover:bg-zinc-900/40"
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <div className={`p-2 rounded-sm ${isAttached ? "bg-white text-black" : "bg-zinc-900 text-zinc-400 border border-zinc-800"}`}>
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-semibold text-foreground truncate">{s.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {s.document_count || 0} docs • {s.source_type}
                        </div>
                      </div>
                    </div>
                    {isAttached && <CheckCircle2 className="h-4 w-4 text-[#46C7D6] shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
