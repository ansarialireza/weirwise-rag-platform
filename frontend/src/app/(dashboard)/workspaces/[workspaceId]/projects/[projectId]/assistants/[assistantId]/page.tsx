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

export default function AssistantConfigurePage() {
  const params = useParams();
  const router = useRouter();

  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;
  const assistantId = params.assistantId as string;

  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
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
    if (projectId && assistantId) {
      Promise.all([
        api.getAssistant(assistantId),
        api.getSources(projectId),
      ])
        .then(([a, sList]) => {
          setAssistant(a);
          setName(a.name);
          setInstructions(a.system_instructions || "");
          setModel(a.model);
          setTemperature(a.temperature);
          setScoreThreshold(a.score_threshold);
          setTopK(a.top_k || 4);
          setSelectedSourceIds(a.knowledge_source_ids || []);
          setSources(sList);
        })
        .catch((err: any) => {
          setErrorMessage(err.message || "Failed to load assistant configuration.");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [projectId, assistantId]);

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

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-200 w-full overflow-hidden">
      {/* Breadcrumb / Top Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-center gap-3.5 min-w-0">
          <Link
            href={`/workspaces/${workspaceId}/projects/${projectId}/assistants`}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors shadow-xs shrink-0"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                {name || "Configure Assistant"}
              </h1>
              <Badge variant={assistant?.status === "published" ? "success" : "outline"} className="text-xs px-2.5 py-0.5 shrink-0">
                v{assistant?.version || 1} • {assistant?.status || "draft"}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">
              Configure system instructions, inference model parameters, and knowledge attachments.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Link
            href={`/workspaces/${workspaceId}/projects/${projectId}/playground?assistantId=${assistantId}`}
            className="flex-1 sm:flex-initial"
          >
            <Button variant="outline" size="sm" className="w-full sm:w-auto h-9 px-3 text-xs font-semibold gap-1.5">
              <Sliders className="h-4 w-4" /> Open Playground
            </Button>
          </Link>

          <Button
            variant="secondary"
            size="sm"
            onClick={handlePublish}
            isLoading={publishing}
            className="flex-1 sm:flex-initial h-9 px-3 text-xs font-semibold gap-1.5"
          >
            <ArrowUpRight className="h-4 w-4" /> Publish Snapshot
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={saving}
            className="flex-1 sm:flex-initial h-9 px-3.5 text-xs font-bold gap-1.5"
          >
            <Save className="h-4 w-4" /> Save Changes
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
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5 shadow-sm">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2.5">
            <Bot className="h-5 w-5 text-primary" />
            General Identity &amp; Role
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
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

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Inference Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full h-10 rounded-xl border border-border bg-input px-3.5 text-sm font-medium text-foreground focus:border-primary focus:outline-none shadow-xs"
              >
                <option value="gpt-4o-mini">GPT-4o Mini (Default - High Speed)</option>
                <option value="gpt-4o">GPT-4o (Deep Reasoning)</option>
                <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">System Instructions (Prompt)</label>
            <textarea
              rows={6}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Specify the assistant's behavior, role boundaries, citation format, and response tone..."
              className="w-full rounded-xl border border-border bg-input p-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none shadow-xs font-sans leading-relaxed"
            />
          </div>
        </div>

        {/* Hyperparameter Thresholds */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-6 shadow-sm">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2.5">
            <Sliders className="h-5 w-5 text-primary" />
            Retrieval &amp; Inference Parameters
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2.5 p-4 rounded-xl border border-border/80 bg-secondary/20">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-foreground">Temperature</span>
                <span className="font-mono text-primary font-extrabold text-base">{temperature}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">Lower value produces deterministic facts.</p>
            </div>

            <div className="space-y-2.5 p-4 rounded-xl border border-border/80 bg-secondary/20">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-foreground">Similarity Cutoff</span>
                <span className="font-mono text-primary font-extrabold text-base">{scoreThreshold}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(parseFloat(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">Minimum score for chunk vector relevance.</p>
            </div>

            <div className="space-y-2.5 p-4 rounded-xl border border-border/80 bg-secondary/20">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-foreground">Top K Chunks</span>
                <span className="font-mono text-primary font-extrabold text-base">{topK}</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">Maximum retrieved document passages.</p>
            </div>
          </div>
        </div>


        {/* Web Widget Embed & Integration Snippet (Available for Published Snapshots) */}
        {assistant?.status === "published" && (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <ArrowUpRight className="h-4.5 w-4.5 text-primary" />
                  Website Embed &amp; Public Integration
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Paste this responsive iframe code directly into your web application or documentation.
                </p>
              </div>
              <Badge variant="success" className="text-xs shrink-0">Live Snapshot v{assistant.version}</Badge>
            </div>

            <div className="relative rounded-xl border border-border/80 bg-secondary/30 p-3 sm:p-4">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/60 text-xs font-mono text-muted-foreground">
                <span>HTML Responsive Snippet</span>
                <button
                  type="button"
                  onClick={() => handleCopyEmbed(`<iframe\n  src="${typeof window !== "undefined" ? window.location.origin : ""}/embed/${assistantId}"\n  width="100%"\n  height="600"\n  frameborder="0"\n  style="border-radius: 12px; border: 1px solid #2E3444;"\n  title="${name || "Weirwise AI Assistant"}"\n></iframe>`)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-card hover:bg-secondary text-foreground text-xs font-medium transition-colors"
                >
                  {copiedEmbed ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-primary" />
                      <span className="text-primary font-bold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Snippet</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="text-xs font-mono text-foreground/90 overflow-x-auto whitespace-pre p-1">
{`<iframe
  src="${typeof window !== "undefined" ? window.location.origin : ""}/embed/${assistantId}"
  width="100%"
  height="600"
  frameborder="0"
  style="border-radius: 12px; border: 1px solid #2E3444;"
  title="${name || "Weirwise AI Assistant"}"
></iframe>`}
              </pre>
            </div>
          </div>
        )}

        {/* Attached Knowledge Sources */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">Attached Knowledge Sources</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Select which ingested datasets this assistant retrieves citations from
              </p>
            </div>
            <Badge variant="outline" className="text-xs">{selectedSourceIds.length} Attached</Badge>
          </div>

          {sources.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No sources in this project. Ingest files in the Knowledge tab first.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {sources.map((s) => {
                const isAttached = selectedSourceIds.includes(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() => toggleSource(s.id)}
                    className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                      isAttached
                        ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
                        : "border-border bg-card hover:bg-secondary/40 text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-3.5 truncate">
                      <div className={`p-2 rounded-lg ${isAttached ? "bg-primary text-black" : "bg-secondary text-muted-foreground"}`}>
                        <FileText className="h-4.5 w-4.5 flex-shrink-0" />
                      </div>
                      <div className="truncate">
                        <div className="text-sm font-bold text-foreground truncate">{s.name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          {s.document_count || 0} docs • {s.source_type}
                        </div>
                      </div>
                    </div>
                    {isAttached && <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />}
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
