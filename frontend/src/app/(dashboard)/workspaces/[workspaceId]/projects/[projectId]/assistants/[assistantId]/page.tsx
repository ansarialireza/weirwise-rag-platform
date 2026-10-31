"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Assistant,
  KnowledgeSource,
  Deployment,
  PublishReadiness,
  AssistantConversation,
  ConversationMessage,
} from "@/types";
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
  Globe,
  Code2,
  MessageSquare,
  ShieldAlert,
  ChevronRight,
  ExternalLink,
  PowerOff,
  UserCheck,
  Clock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";

export default function AssistantConfigurePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;
  const assistantId = params.assistantId as string;

  const [activeTab, setActiveTab] = useState<"general" | "knowledge" | "publishing" | "conversations" | "advanced">("general");

  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [readiness, setReadiness] = useState<PublishReadiness | null>(null);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loading, setLoading] = useState(true);

  // General & Persona Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [language, setLanguage] = useState("en");
  const [tone, setTone] = useState("professional");
  const [fallbackMessage, setFallbackMessage] = useState("");
  const [escalationEmail, setEscalationEmail] = useState("");

  // Advanced Hyperparameters
  const [model, setModel] = useState("gpt-4o-mini");
  const [temperature, setTemperature] = useState(0.2);
  const [scoreThreshold, setScoreThreshold] = useState(0.7);
  const [topK, setTopK] = useState(4);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

  // Action states
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const loadData = useCallback(async () => {
    if (projectId && assistantId) {
      try {
        const [a, sList, rData, depList, convList] = await Promise.all([
          api.getAssistant(assistantId),
          api.getSources(projectId),
          api.getPublishReadiness(assistantId).catch(() => null),
          api.getDeployments(assistantId).catch(() => []),
          api.getAssistantConversations(assistantId).catch(() => []),
        ]);

        setAssistant(a);
        setName(a.name);
        setDescription(a.description || "");
        setInstructions(a.system_instructions || "");
        setLanguage(a.language || "en");
        setTone(a.tone || "professional");
        setFallbackMessage(a.fallback_message || "I am sorry, but I do not have enough verified information in my knowledge base to answer that accurately.");
        setEscalationEmail(a.escalation_email || "");
        setModel(a.model || "gpt-4o-mini");
        setTemperature(a.temperature ?? 0.2);
        setScoreThreshold(a.score_threshold ?? 0.7);
        setTopK(a.top_k ?? 4);
        setSelectedSourceIds(a.knowledge_source_ids || []);
        setSources(sList);
        setReadiness(rData);
        setDeployments(depList);
        setConversations(convList);
      } catch (err: any) {
        toast({ message: err.message || "Failed to load assistant.", type: "error" });
      } finally {
        setLoading(false);
      }
    }
  }, [projectId, assistantId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadConversationMessages = async (convId: string) => {
    setSelectedConversationId(convId);
    setLoadingMessages(true);
    try {
      const msgs = await api.getConversationMessages(convId);
      setConversationMessages(msgs);
    } catch (err: any) {
      toast({ message: "Failed to load messages", type: "error" });
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    try {
      const updated = await api.updateAssistant(assistantId, {
        name: name.trim(),
        description: description.trim(),
        system_instructions: instructions.trim(),
        language,
        tone,
        fallback_message: fallbackMessage.trim(),
        escalation_email: escalationEmail.trim() || undefined,
        model,
        temperature,
        score_threshold: scoreThreshold,
        top_k: topK,
        knowledge_source_ids: selectedSourceIds,
      });
      setAssistant(updated);
      const updatedReadiness = await api.getPublishReadiness(assistantId).catch(() => null);
      if (updatedReadiness) setReadiness(updatedReadiness);
      toast({ message: "Assistant configuration saved.", type: "success" });
    } catch (err: any) {
      toast({ message: err.message || "Failed to save assistant changes.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const updated = await api.publishAssistant(assistantId);
      setAssistant(updated);
      const depList = await api.getDeployments(assistantId);
      setDeployments(depList);
      const updatedReadiness = await api.getPublishReadiness(assistantId).catch(() => null);
      if (updatedReadiness) setReadiness(updatedReadiness);
      toast({ message: `Snapshot v${updated.version} is now live and published!`, type: "success" });
    } catch (err: any) {
      toast({ message: err.message || "Publishing failed.", type: "error" });
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!confirm("Are you sure you want to take this assistant offline? Public widgets will stop answering queries.")) {
      return;
    }
    setUnpublishing(true);
    try {
      const updated = await api.unpublishAssistant(assistantId);
      setAssistant(updated);
      toast({ message: "Assistant taken offline (draft mode).", type: "info" });
    } catch (err: any) {
      toast({ message: err.message || "Failed to unpublish.", type: "error" });
    } finally {
      setUnpublishing(false);
    }
  };

  const toggleSource = (sourceId: string) => {
    if (selectedSourceIds.includes(sourceId)) {
      setSelectedSourceIds(selectedSourceIds.filter((id) => id !== sourceId));
    } else {
      setSelectedSourceIds([...selectedSourceIds, sourceId]);
    }
  };

  const copyWidgetCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippet(true);
    toast({ message: "Embed snippet copied to clipboard!", type: "success" });
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const primaryDeployment = deployments[0] || null;
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://dev.weirwise.com";
  const widgetSnippet = primaryDeployment
    ? `<script\n  src="${siteUrl}/widget.js"\n  data-assistant-id="${assistantId}"\n  data-key="${primaryDeployment.public_key}"\n  defer\n></script>`
    : `<script\n  src="${siteUrl}/widget.js"\n  data-assistant-id="${assistantId}"\n  defer\n></script>`;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-200 w-full overflow-hidden">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-center gap-3.5 min-w-0">
          <Link
            href={`/workspaces/${workspaceId}/projects/${projectId}/assistants`}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors shadow-2xs shrink-0"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                {name || "Configure Assistant"}
              </h1>
              <Badge
                variant={assistant?.status === "published" ? "success" : "outline"}
                className="text-xs px-2.5 py-0.5 shrink-0"
              >
                {assistant?.status === "published" ? "● Live / Published" : "Draft Mode"} • v{assistant?.version || 1}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">
              {description || "Manage identity, knowledge sources, publishing, and live conversations."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Link
            href={`/workspaces/${workspaceId}/projects/${projectId}/playground?assistantId=${assistantId}`}
            className="flex-1 sm:flex-initial"
          >
            <Button variant="outline" size="sm" className="w-full sm:w-auto h-9 px-3 text-xs font-semibold gap-1.5">
              <Sliders className="h-4 w-4 text-primary" /> Test in Playground
            </Button>
          </Link>

          {assistant?.status === "published" ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleUnpublish}
              isLoading={unpublishing}
              className="flex-1 sm:flex-initial h-9 px-3 text-xs font-semibold gap-1.5 text-muted-foreground hover:text-destructive"
            >
              <PowerOff className="h-4 w-4" /> Take Offline
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePublish}
              isLoading={publishing}
              disabled={Boolean(readiness && !readiness.is_ready)}
              className="flex-1 sm:flex-initial h-9 px-3 text-xs font-semibold gap-1.5"
            >
              <ArrowUpRight className="h-4 w-4 text-primary" /> Publish Live
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={() => handleSave()}
            isLoading={saving}
            className="flex-1 sm:flex-initial h-9 px-3.5 text-xs font-bold gap-1.5"
          >
            <Save className="h-4 w-4" /> Save Changes
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1 border-b border-border text-xs font-semibold overflow-x-auto pb-px">
        <button
          type="button"
          onClick={() => setActiveTab("general")}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "general"
              ? "border-primary text-foreground font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bot className="h-4 w-4" /> Identity &amp; Behavior
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("knowledge")}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "knowledge"
              ? "border-primary text-foreground font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="h-4 w-4" /> Attached Knowledge ({selectedSourceIds.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("publishing")}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "publishing"
              ? "border-primary text-foreground font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Globe className="h-4 w-4" /> Website Widget &amp; Publishing
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("conversations")}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "conversations"
              ? "border-primary text-foreground font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4" /> Conversations &amp; Insights ({conversations.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("advanced")}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "advanced"
              ? "border-primary text-foreground font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sliders className="h-4 w-4" /> Advanced Settings
        </button>
      </div>

      {/* TAB 1: General Identity & Behavior */}
      {activeTab === "general" && (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 space-y-5 shadow-xs">
            <h2 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" /> Assistant Profile
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assistant Name</label>
                <Input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Customer Support Guide"
                  className="h-10 text-sm font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tone of Voice</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full h-10 rounded-xl border border-border bg-input px-3.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none shadow-2xs"
                >
                  <option value="professional">Professional &amp; Courteous</option>
                  <option value="friendly">Warm &amp; Conversational</option>
                  <option value="concise">Direct &amp; Concise</option>
                  <option value="empathetic">Empathetic Customer Care</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Primary Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full h-10 rounded-xl border border-border bg-input px-3.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none shadow-2xs"
                >
                  <option value="en">English (US/UK)</option>
                  <option value="fa">Persian / فارسی (RTL Supported)</option>
                  <option value="es">Spanish / Español</option>
                  <option value="fr">French / Français</option>
                  <option value="de">German / Deutsch</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Escalation Email (Optional)</label>
                <Input
                  type="email"
                  value={escalationEmail}
                  onChange={(e) => setEscalationEmail(e.target.value)}
                  placeholder="support@company.com"
                  className="h-10 text-xs font-medium"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Short Description</label>
              <Input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain what this assistant helps customers achieve..."
                className="h-10 text-xs font-medium"
              />
            </div>

            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Instructions &amp; Behavioral Guidelines</label>
                <span className="text-[11px] text-muted-foreground">Plain business language</span>
              </div>
              <textarea
                rows={5}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Example: You are our enterprise store assistant. Answer customer questions strictly based on our return and shipping documentation. If pricing is asked, state that custom quotes are available through sales."
                className="w-full rounded-xl border border-border bg-input p-3.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none shadow-2xs leading-relaxed"
              />
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Graceful Fallback Message</label>
              <Input
                type="text"
                value={fallbackMessage}
                onChange={(e) => setFallbackMessage(e.target.value)}
                placeholder="What to answer when no verified documentation covers the query..."
                className="h-10 text-xs font-medium"
              />
              <p className="text-[11px] text-muted-foreground">
                Prevents hallucinations: If the knowledge base does not contain the answer, this message is returned.
              </p>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: Knowledge Sources */}
      {activeTab === "knowledge" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 space-y-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-4">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Business Knowledge Attachments
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select which knowledge sources this assistant retrieves citations from.
                </p>
              </div>

              <Link href={`/workspaces/${workspaceId}/projects/${projectId}/sources`}>
                <Button variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1.5">
                  + Upload New Documents
                </Button>
              </Link>
            </div>

            {sources.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-3">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
                <div className="text-sm font-bold text-foreground">No knowledge sources in this project yet</div>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Upload your employee handbook, product FAQs, or crawl your website to give your assistant business knowledge.
                </p>
                <Link href={`/workspaces/${workspaceId}/projects/${projectId}/sources`}>
                  <Button variant="primary" size="sm" className="h-8 text-xs font-bold">
                    Add Knowledge Now
                  </Button>
                </Link>
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
                          ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30"
                          : "border-border bg-card hover:bg-secondary/40 text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-3.5 truncate">
                        <div className={`p-2 rounded-lg ${isAttached ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                          <FileText className="h-4.5 w-4.5 shrink-0" />
                        </div>
                        <div className="truncate">
                          <div className="text-sm font-bold text-foreground truncate">{s.name}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">
                            {s.document_count || 0} docs • {s.status}
                          </div>
                        </div>
                      </div>
                      {isAttached && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Publishing & Web Widget */}
      {activeTab === "publishing" && (
        <div className="space-y-6">
          {/* Readiness Banner */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" /> Publication Status &amp; Readiness
              </h2>
              <Badge
                variant={readiness?.is_ready ? "success" : "outline"}
                className="text-xs"
              >
                {readiness?.is_ready ? "Ready to Publish" : "Setup Incomplete"}
              </Badge>
            </div>

            {readiness && !readiness.is_ready ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 space-y-2 text-xs text-amber-500">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> Please resolve these items before publishing:
                </div>
                <ul className="list-disc list-inside space-y-1">
                  {readiness.issues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs text-emerald-500 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  Assistant has {readiness?.knowledge_sources_count || selectedSourceIds.length} attached knowledge sources and {readiness?.indexed_documents_count || 1} processed document ready.
                </span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                Current State: <span className="font-bold text-foreground capitalize">{assistant?.status}</span> (Snapshot v{assistant?.version})
              </div>

              {assistant?.status === "published" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleUnpublish}
                  isLoading={unpublishing}
                  className="h-8 text-xs font-semibold text-muted-foreground hover:text-destructive"
                >
                  <PowerOff className="h-3.5 w-3.5 mr-1" /> Unpublish (Take Offline)
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePublish}
                  isLoading={publishing}
                  disabled={Boolean(readiness && !readiness.is_ready)}
                  className="h-8 text-xs font-bold"
                >
                  <ArrowUpRight className="h-3.5 w-3.5 mr-1" /> Publish to Live
                </Button>
              )}
            </div>
          </div>

          {/* Website Embed Snippet */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-primary" /> Website Embed Code
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Paste this 1-line script tag before the closing <code className="text-primary font-mono">&lt;/body&gt;</code> tag on your website or Shopify/WordPress store.
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => copyWidgetCode(widgetSnippet)}
                className="h-8 text-xs font-semibold gap-1.5"
              >
                {copiedSnippet ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedSnippet ? "Copied!" : "Copy Snippet"}
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-muted/60 p-4 font-mono text-xs text-foreground/90 overflow-x-auto">
              <pre>{widgetSnippet}</pre>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
              <span className="text-muted-foreground">
                Preview standalone widget in a clean window:
              </span>
              <a
                href={`/embed/${assistantId}${primaryDeployment ? `?key=${primaryDeployment.public_key}` : ""}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-primary font-semibold hover:underline"
              >
                Launch Standalone Widget <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Conversations & Insights */}
      {activeTab === "conversations" && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5 shadow-xs">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" /> Customer Conversations &amp; Grounding History
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Inspect questions asked to this assistant, answers generated, and supporting source citations.
            </p>
          </div>

          {conversations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
              No conversations recorded yet. Ask a question in the Studio Playground or publish to your website.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Conversation list */}
              <div className="space-y-2 border-r border-border/80 pr-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Session History
                </div>
                {conversations.map((conv) => {
                  const isSelected = selectedConversationId === conv.id;
                  return (
                    <div
                      key={conv.id}
                      onClick={() => loadConversationMessages(conv.id)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 font-semibold"
                          : "border-border bg-card hover:bg-secondary/40 text-muted-foreground"
                      }`}
                    >
                      <div className="text-foreground truncate font-medium">
                        {conv.title || `Conversation #${conv.id.slice(0, 8)}`}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                        <span>{conv.message_count} turns</span>
                        <span>{new Date(conv.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Message transcript */}
              <div className="md:col-span-2 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Transcript Inspection
                </div>

                {!selectedConversationId ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                    Select a conversation on the left to inspect turns and citations.
                  </div>
                ) : loadingMessages ? (
                  <div className="flex justify-center p-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2">
                    {conversationMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-xl border text-xs ${
                          msg.role === "user"
                            ? "border-border bg-secondary/50 text-foreground"
                            : "border-primary/30 bg-card text-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-[11px] mb-1.5 text-muted-foreground">
                          <span className={msg.role === "assistant" ? "text-primary" : ""}>
                            {msg.role === "user" ? "Customer Query" : "Assistant Answer"}
                          </span>
                          {msg.latency_ms && <span>{msg.latency_ms}ms</span>}
                        </div>
                        <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                        {msg.citations && msg.citations.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-border/50 text-[10px] text-muted-foreground space-y-1">
                            <span className="font-semibold text-primary">Verified Citations:</span>
                            {msg.citations.map((c: any, cIdx: number) => (
                              <div key={cIdx} className="bg-secondary/40 p-1.5 rounded truncate">
                                {c.content || JSON.stringify(c)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Advanced Technical Settings */}
      {activeTab === "advanced" && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-6 shadow-xs">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <Sliders className="h-4 w-4 text-primary" /> Advanced Hyperparameters &amp; LLM Routing
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Fine-tune inference model selection, semantic threshold strictness, and passage retrieval counts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Inference Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full h-10 rounded-xl border border-border bg-input px-3.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none shadow-2xs"
              >
                <option value="gpt-4o-mini">GPT-4o Mini (Default - Ultra Fast &amp; Cost-Effective)</option>
                <option value="gpt-4o">GPT-4o (Deep Complex Reasoning)</option>
                <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div className="space-y-2.5 p-4 rounded-xl border border-border/80 bg-secondary/20">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-foreground text-xs">Creativity (Temp)</span>
                <span className="font-mono text-primary font-extrabold text-sm">{temperature}</span>
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
              <p className="text-[11px] text-muted-foreground">Lower value produces factual, deterministic answers.</p>
            </div>

            <div className="space-y-2.5 p-4 rounded-xl border border-border/80 bg-secondary/20">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-foreground text-xs">Similarity Threshold</span>
                <span className="font-mono text-primary font-extrabold text-sm">{scoreThreshold}</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="0.95"
                step="0.05"
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(parseFloat(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <p className="text-[11px] text-muted-foreground">Minimum cosine similarity for document chunk relevance.</p>
            </div>

            <div className="space-y-2.5 p-4 rounded-xl border border-border/80 bg-secondary/20">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-foreground text-xs">Top K Passages</span>
                <span className="font-mono text-primary font-extrabold text-sm">{topK}</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value, 10))}
                className="w-full accent-primary cursor-pointer"
              />
              <p className="text-[11px] text-muted-foreground">Maximum cited document passages per turn.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
