"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Assistant, KnowledgeSource, Project } from "@/types";
import { Bot, Plus, ArrowRight, Database, Sparkles, CheckCircle2 } from "lucide-react";

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
      ]).then(([p, aList, sList]) => {
        setProject(p);
        setAssistants(aList);
        setSources(sList);
      }).finally(() => {
        setLoading(false);
      });
    }
  }, [projectId]);

  const handleCreateAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssistantName) return;
    setCreating(true);

    try {
      const created = await api.createAssistant(projectId, {
        name: newAssistantName,
        system_instructions: newInstructions,
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
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {project?.name || "Project Assistants"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure grounded AI assistants and link data sources
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Assistant
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-5 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Active Assistants</span>
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground font-mono">
            {assistants.length}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Attached Knowledge</span>
            <Database className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground font-mono">
            {sources.length} Sources
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Engine Status</span>
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Core RAG Ready
          </div>
        </div>
      </div>

      {/* Assistants List */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Assistants in this Project
        </h2>

        {assistants.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center space-y-3">
            <Bot className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">No assistants configured</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Create your first assistant to begin testing grounding prompts against your business documents.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-border"
            >
              <Plus className="h-3.5 w-3.5" /> Create Assistant
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assistants.map((ast) => (
              <Link
                key={ast.id}
                href={`/workspaces/${workspaceId}/projects/${projectId}/assistants/${ast.id}`}
                className="group rounded-lg border border-border bg-card p-5 transition-all hover:border-primary/50"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                      {ast.name}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {ast.system_instructions || "No system prompt configured."}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-mono uppercase font-semibold ${
                      ast.status === "published"
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {ast.status} v{ast.version}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                  <span className="font-mono">Model: {ast.model}</span>
                  <div className="flex items-center gap-1 group-hover:translate-x-0.5 transition-transform text-foreground">
                    Studio <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 space-y-5">
            <h3 className="text-lg font-semibold text-foreground">New Assistant</h3>
            <form onSubmit={handleCreateAssistant} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Assistant Name</label>
                <input
                  type="text"
                  required
                  value={newAssistantName}
                  onChange={(e) => setNewAssistantName(e.target.value)}
                  placeholder="e.g. HR Policy Companion"
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">System Instructions</label>
                <textarea
                  rows={4}
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  placeholder="You are an enterprise knowledge assistant..."
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create & Open Studio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
