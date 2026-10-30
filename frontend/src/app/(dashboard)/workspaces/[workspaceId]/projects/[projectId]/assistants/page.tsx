"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Assistant, KnowledgeSource, Project } from "@/types";
import {
  Bot,
  Plus,
  Sliders,
  Settings2,
  FileText,
  CheckCircle2,
  X,
  Search,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

export default function AssistantsListPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;
  const { toast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showCreate, setShowCreate] = useState(false);
  const [newAssistantName, setNewAssistantName] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const [newModel, setNewModel] = useState("gpt-4o-mini");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    if (projectId) {
      try {
        const [p, aList, sList] = await Promise.all([
          api.getProject(projectId),
          api.getAssistants(projectId),
          api.getSources(projectId),
        ]);
        setProject(p);
        setAssistants(aList);
        setSources(sList);
      } finally {
        setLoading(false);
      }
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssistantName.trim()) return;
    setCreating(true);

    try {
      const created = await api.createAssistant(projectId, {
        name: newAssistantName.trim(),
        system_instructions: newInstructions.trim() || "You are an intelligent business assistant.",
        model: newModel,
        temperature: 0.2,
        top_k: 4,
        score_threshold: 0.7,
        knowledge_source_ids: selectedSourceIds.length > 0 ? selectedSourceIds : undefined,
      });
      setShowCreate(false);
      router.push(`/workspaces/${workspaceId}/projects/${projectId}/assistants/${created.id}`);
    } catch (err: any) {
      toast({ type: "error", message: err.message || "Failed to create assistant" });
    } finally {
      setCreating(false);
    }
  };

  const filteredAssistants = assistants.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.description && a.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Assistants
            </h1>
            <Badge variant="primary" className="text-xs px-2.5 py-0.5">{assistants.length} Configured</Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Build and configure specialized RAG assistants grounded in project knowledge.
          </p>
        </div>

        <Button
          onClick={() => setShowCreate(true)}
          variant="primary"
          size="sm"
          className="h-9 px-4 text-xs font-bold gap-2 shrink-0 self-start sm:self-center"
        >
          <Plus className="h-4 w-4" /> New Assistant
        </Button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search assistants by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-border bg-input pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 shadow-xs"
          />
        </div>
      </div>

      {/* Assistants Grid */}
      {filteredAssistants.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No assistants found"
          description={
            searchQuery
              ? "No assistants match your search filter."
              : "Create your first assistant to begin testing grounded answers against your knowledge sources."
          }
          actionLabel="Create Assistant"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAssistants.map((a) => (
            <div
              key={a.id}
              className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-6 hover:border-primary/50 transition-all shadow-sm"
            >
              <div className="space-y-3.5">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary border border-border/80">
                    <Bot className="h-6 w-6" />
                  </div>
                  <Badge variant={a.status === "published" ? "success" : "outline"} className="text-xs px-2.5 py-0.5">
                    {a.status}
                  </Badge>
                </div>

                <div>
                  <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                    {a.name}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1.5 leading-relaxed">
                    {a.system_instructions || "No system instructions configured."}
                  </p>
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground font-mono">
                  <span>Model: <span className="text-foreground font-semibold">{a.model}</span></span>
                  <span>Sources: <span className="text-foreground font-semibold">{a.knowledge_source_ids?.length || 0}</span></span>
                </div>
              </div>

              <div className="mt-5 pt-3.5 border-t border-border flex items-center gap-2.5">
                <Link
                  href={`/workspaces/${workspaceId}/projects/${projectId}/assistants/${a.id}`}
                  className="flex-1"
                >
                  <Button variant="outline" size="sm" className="w-full h-8 px-3 text-xs font-semibold gap-1.5">
                    <Settings2 className="h-4 w-4" /> Configure
                  </Button>
                </Link>
                <Link
                  href={`/workspaces/${workspaceId}/projects/${projectId}/playground?assistantId=${a.id}`}
                  className="flex-1"
                >
                  <Button variant="primary" size="sm" className="w-full h-8 px-3 text-xs font-bold gap-1.5">
                    <Sliders className="h-4 w-4" /> Test
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Creation Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Create New Assistant</h3>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAssistant} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Assistant Name</label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. Compliance Analyst, Legal Advisor"
                  value={newAssistantName}
                  onChange={(e) => setNewAssistantName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Inference Model</label>
                <select
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cost-Efficient)</option>
                  <option value="gpt-4o">GPT-4o (High-Precision Reasoning)</option>
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">System Instructions</label>
                <textarea
                  rows={3}
                  placeholder="Describe role, tone, grounding rules, and response structure..."
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  className="w-full rounded-md border border-border bg-input p-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>

              {sources.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Attach Initial Knowledge</label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto border border-border rounded-lg p-2 bg-input/40">
                    {sources.map((s) => {
                      const isSelected = selectedSourceIds.includes(s.id);
                      return (
                        <div
                          key={s.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedSourceIds(selectedSourceIds.filter((id) => id !== s.id));
                            } else {
                              setSelectedSourceIds([...selectedSourceIds, s.id]);
                            }
                          }}
                          className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-xs transition-colors ${
                            isSelected
                              ? "bg-primary/10 border border-primary/30 text-foreground"
                              : "hover:bg-secondary text-muted-foreground"
                          }`}
                        >
                          <span className="truncate">{s.name}</span>
                          {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={creating}
                  disabled={!newAssistantName.trim()}
                >
                  Create &amp; Configure
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
