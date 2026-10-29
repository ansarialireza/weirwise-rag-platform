"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Assistant, KnowledgeSource, Project } from "@/types";
import { Bot, Plus, ArrowRight, Database, Sparkles, CheckCircle2, Sliders, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

export default function ProjectDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);

  // Assistant Creation Modal State
  const [showCreate, setShowCreate] = useState(false);
  const [newAssistantName, setNewAssistantName] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (projectId) {
      Promise.all([
        api.getProject(projectId),
        api.getAssistants(projectId),
        api.getSources(projectId),
      ])
        .then(([p, aList, sList]) => {
          setProject(p);
          setAssistants(aList);
          setSources(sList);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [projectId]);

  const handleCreateAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssistantName.trim()) return;
    setCreating(true);

    try {
      const created = await api.createAssistant(projectId, {
        name: newAssistantName.trim(),
        system_instructions: newInstructions.trim() || "You are an intelligent business assistant.",
        model: "gpt-4o-mini",
        temperature: 0.2,
        top_k: 4,
        score_threshold: 0.7,
      });
      router.push(`/workspaces/${workspaceId}/projects/${projectId}/assistants/${created.id}`);
    } catch (err: any) {
      alert(err.message || "Failed to create assistant");
    } finally {
      setCreating(false);
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
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {project?.name || "Project Assistants"}
            </h1>
            <Badge variant="primary">Studio</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Configure grounded AI assistants, attach business data, and test answers
          </p>
        </div>

        <Button
          onClick={() => setShowCreate(true)}
          variant="primary"
          size="sm"
        >
          <Plus className="h-4 w-4" /> New Assistant
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Active Assistants</span>
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground font-mono">
            {assistants.length}
          </div>
          <p className="text-[11px] text-muted-foreground">Deployed or in draft mode</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Knowledge Sources</span>
            <Database className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground font-mono">
            {sources.length}
          </div>
          <p className="text-[11px] text-muted-foreground">Indexed collections for grounding</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Platform Status</span>
            <Sparkles className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-sm font-semibold text-emerald-500 flex items-center gap-1.5 mt-1">
            <CheckCircle2 className="h-4 w-4" /> Ready for Inference
          </div>
          <p className="text-[11px] text-muted-foreground">Vector retrieval and chat enabled</p>
        </div>
      </div>

      {/* Assistants List Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider text-xs">
            Configured Assistants
          </h2>
        </div>

        {assistants.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="No Assistants in this Project"
            description="Create your first AI assistant to begin grounding responses on business data."
            actionLabel="Create Assistant"
            onAction={() => setShowCreate(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assistants.map((assistant) => (
              <Link
                key={assistant.id}
                href={`/workspaces/${workspaceId}/projects/${projectId}/assistants/${assistant.id}`}
                className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/50 hover:bg-secondary/40 shadow-sm"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <Bot className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                          {assistant.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {assistant.model}
                          </span>
                          <span className="text-[10px] text-muted-foreground">•</span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            v{assistant.version || 1}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Badge variant={assistant.status === "published" ? "success" : "outline"}>
                      {assistant.status || "draft"}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {assistant.system_instructions || "No custom instructions specified."}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between pt-3 border-t border-border/60 text-xs font-medium text-primary">
                  <span className="text-muted-foreground text-[11px]">
                    {assistant.knowledge_source_ids?.length || 0} Grounded Source(s)
                  </span>
                  <span className="flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    Open Studio <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Creation Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">Create New Assistant</h3>
              <button
                onClick={() => setShowCreate(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAssistant} className="space-y-4">
              <Input
                label="Assistant Name"
                required
                value={newAssistantName}
                onChange={(e) => setNewAssistantName(e.target.value)}
                placeholder="e.g. Support Knowledge Bot"
              />

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  System Instructions
                </label>
                <textarea
                  rows={4}
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Define role, tone, and constraints for answers..."
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
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
                >
                  Create & Launch Studio
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
