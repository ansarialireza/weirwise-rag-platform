"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Assistant, KnowledgeSource, Project } from "@/types";
import {
  Bot,
  Database,
  Sliders,
  Plus,
  ArrowRight,
  CheckCircle2,
  Zap,
  Sparkles,
  UploadCloud,
  FileText,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/alert";

export default function ProjectOverviewPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [usage, setUsage] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId && workspaceId) {
      Promise.all([
        api.getProject(projectId),
        api.getAssistants(projectId),
        api.getSources(projectId),
        api.getBillingStatus(workspaceId).catch(() => null),
      ])
        .then(([p, aList, sList, bData]) => {
          setProject(p);
          setAssistants(aList);
          setSources(sList);
          setUsage(bData);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [projectId, workspaceId]);

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const primaryAssistant = assistants[0] || null;
  const hasSources = sources.length > 0;
  const hasAssistants = assistants.length > 0;

  const totalIndexedDocs = usage?.documents_indexed ?? sources.reduce((acc, s) => acc + (s.document_count || 0), 0);
  const chatTurnsUsed = usage?.chat_turns_used ?? 0;
  const chatTurnsLimit = usage?.chat_turns_limit ?? 500;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-10 animate-in fade-in duration-200">
      {/* Header: Clean & Typographic */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {project?.name || "Project Overview"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Grounded enterprise AI workspace and knowledge base
          </p>
        </div>

        {hasSources && (
          <div className="flex items-center gap-2">
            <Link href={`/workspaces/${workspaceId}/projects/${projectId}/sources`}>
              <Button variant="outline" size="sm" className="rounded-xl text-xs font-semibold h-9 px-3.5">
                Manage Sources
              </Button>
            </Link>
            <Link href={`/workspaces/${workspaceId}/projects/${projectId}/playground${primaryAssistant ? "?assistantId=" + primaryAssistant.id : ""}`}>
              <Button variant="primary" size="sm" className="rounded-xl text-xs font-semibold h-9 px-3.5 gap-1.5">
                <Sliders className="h-3.5 w-3.5" /> Launch Playground
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* PROGRESSIVE DISCLOSURE: Focus State when 0 Sources exist */}
      {!hasSources ? (
        <div className="space-y-8">
          {/* Prominent Zero-State Hero Upload Zone */}
          <div className="rounded-3xl border border-dashed border-border/80 bg-muted/20 p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-4 hover:bg-muted/30 transition-colors">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UploadCloud className="h-8 w-8" />
            </div>

            <div className="max-w-md space-y-1.5">
              <h2 className="text-xl font-bold text-foreground">Start by uploading your first document</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Weirwise connects your internal documents to AI assistants. Upload PDF, Markdown, or text files to build your knowledge base.
              </p>
            </div>

            <Link href={`/workspaces/${workspaceId}/projects/${projectId}/sources`} className="pt-2">
              <Button variant="primary" size="lg" className="rounded-2xl px-6 font-semibold gap-2 shadow-sm">
                <Plus className="h-4 w-4" /> Upload Document
              </Button>
            </Link>
          </div>

          {/* Dimmed Next Steps (Progressive Disclosure) */}
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 px-1">
              Next Steps (Locked until documents are added)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border/30 bg-muted/10 p-5 flex items-start gap-4 opacity-50 select-none">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground shrink-0">
                  <Lock className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-semibold text-foreground">Configure AI Assistant</span>
                  <p className="text-xs text-muted-foreground">
                    Customize system prompts and parameters once documents are vectorized.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border/30 bg-muted/10 p-5 flex items-start gap-4 opacity-50 select-none">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground shrink-0">
                  <Lock className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-semibold text-foreground">Test in Playground</span>
                  <p className="text-xs text-muted-foreground">
                    Ask questions and inspect grounded citations in real time.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Bento Grid & Workflow when Sources Exist */
        <div className="space-y-8">
          {/* Minimalist Bento Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-muted/40 p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted-foreground mb-3">
                <span className="text-xs font-medium">Knowledge Base</span>
                <Database className="h-4 w-4 text-primary" />
              </div>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {sources.length} <span className="text-xs font-normal text-muted-foreground">sources</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-2">
                {totalIndexedDocs} document chunks indexed
              </div>
            </div>

            <div className="rounded-2xl bg-muted/40 p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted-foreground mb-3">
                <span className="text-xs font-medium">Active Assistants</span>
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {assistants.length} <span className="text-xs font-normal text-muted-foreground">configured</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-2">
                {assistants.filter((a) => a.status === "published").length} ready for inference
              </div>
            </div>

            <div className="rounded-2xl bg-muted/40 p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted-foreground mb-3">
                <span className="text-xs font-medium">Usage</span>
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {chatTurnsUsed} <span className="text-xs font-normal text-muted-foreground">/ {chatTurnsLimit} turns</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-2">
                Plan: <span className="uppercase font-semibold text-primary">{usage?.plan_tier || "standard"}</span>
              </div>
            </div>
          </div>

          {/* Workflow Steps */}
          <div className="rounded-3xl bg-muted/30 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-foreground">Core Workflow</h2>
                <p className="text-xs text-muted-foreground">Follow these steps to ground your AI assistant</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step 1 */}
              <div className="rounded-2xl bg-card p-5 flex flex-col justify-between shadow-xs">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-semibold text-muted-foreground">01</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Knowledge Base</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {sources.length} sources loaded and indexed for semantic search.
                  </p>
                </div>
                <div className="pt-4 mt-2">
                  <Link
                    href={`/workspaces/${workspaceId}/projects/${projectId}/sources`}
                    className="inline-flex items-center text-xs font-semibold text-primary hover:underline gap-1"
                  >
                    Manage sources &rarr;
                  </Link>
                </div>
              </div>

              {/* Step 2 */}
              <div className="rounded-2xl bg-card p-5 flex flex-col justify-between shadow-xs">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-semibold text-muted-foreground">02</span>
                    {hasAssistants ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500">
                        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" /> Pending
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Configure Assistant</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Set model persona, temperature, and similarity thresholds.
                  </p>
                </div>
                <div className="pt-4 mt-2">
                  <Link
                    href={`/workspaces/${workspaceId}/projects/${projectId}/assistants`}
                    className="inline-flex items-center text-xs font-semibold text-primary hover:underline gap-1"
                  >
                    {hasAssistants ? "View assistants &rarr;" : "Create assistant &rarr;"}
                  </Link>
                </div>
              </div>

              {/* Step 3 */}
              <div className="rounded-2xl bg-card p-5 flex flex-col justify-between shadow-xs">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-semibold text-muted-foreground">03</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                      <Sparkles className="h-3.5 w-3.5" /> Interactive
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Test in Playground</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Verify answer grounding and evidence citations in real time.
                  </p>
                </div>
                <div className="pt-4 mt-2">
                  <Link
                    href={`/workspaces/${workspaceId}/projects/${projectId}/playground${primaryAssistant ? "?assistantId=" + primaryAssistant.id : ""}`}
                    className="inline-flex items-center text-xs font-semibold text-primary hover:underline gap-1"
                  >
                    Launch Playground &rarr;
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Assistants List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-foreground">Assistants</h2>
                <p className="text-xs text-muted-foreground">Tuned AI assistants for this project</p>
              </div>
              <Link href={`/workspaces/${workspaceId}/projects/${projectId}/assistants`}>
                <Button variant="ghost" size="sm" className="text-xs font-semibold">
                  View all
                </Button>
              </Link>
            </div>

            {assistants.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
                No assistants yet. Click &quot;Configure Assistant&quot; to create one.
              </div>
            ) : (
              <div className="divide-y divide-border/40 rounded-2xl bg-card overflow-hidden">
                {assistants.slice(0, 4).map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-muted/30 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-primary shrink-0">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground truncate">{a.name}</span>
                          <span className="text-[11px] font-mono text-muted-foreground">({a.model})</span>
                        </div>
                        <span className="text-xs text-muted-foreground block truncate">
                          Cutoff: {a.score_threshold} &middot; Top K: {a.top_k}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <Link href={`/workspaces/${workspaceId}/projects/${projectId}/assistants/${a.id}`}>
                        <Button variant="ghost" size="sm" className="rounded-xl h-8 px-3 text-xs font-medium">
                          Edit
                        </Button>
                      </Link>
                      <Link href={`/workspaces/${workspaceId}/projects/${projectId}/playground?assistantId=${a.id}`}>
                        <Button variant="primary" size="sm" className="rounded-xl h-8 px-3 text-xs font-semibold gap-1.5">
                          <Sliders className="h-3.5 w-3.5" /> Test
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
