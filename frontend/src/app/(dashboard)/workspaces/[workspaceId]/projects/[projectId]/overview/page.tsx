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
  Sparkles,
  UploadCloud,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProjectOverviewPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId && workspaceId) {
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

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-150">
      {/* Ruthlessly Clean Typographic Header - No duplicate action buttons */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Overview
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Connect business documents, tune assistant personas, and verify answers with semantic citations.
        </p>
      </div>

      {/* PROGRESSIVE DISCLOSURE: Zero-State when 0 Sources exist */}
      {!hasSources ? (
        <div className="space-y-6">
          {/* Prominent Zero-State Hero Upload Zone */}
          <div className="rounded-3xl border border-dashed border-border/80 bg-muted/20 p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-4 hover:bg-muted/30 transition-colors">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-primary">
              <UploadCloud className="h-7 w-7" />
            </div>

            <div className="max-w-md space-y-1.5">
              <h2 className="text-lg sm:text-xl font-bold text-foreground">
                Upload your first document
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Weirwise connects your internal documents to AI assistants. Upload PDF, Markdown, or text files to build your knowledge base.
              </p>
            </div>

            <Link href={`/workspaces/${workspaceId}/projects/${projectId}/sources`} className="pt-2">
              <Button variant="primary" size="lg" className="rounded-2xl px-6 font-semibold gap-2 shadow-xs">
                <Plus className="h-4 w-4" /> Upload Document
              </Button>
            </Link>
          </div>

          {/* Locked Next Steps */}
          <div className="space-y-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1">
              Next Steps (Locked until documents are added)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="rounded-2xl border border-border/30 bg-muted/10 p-4 flex items-start gap-3.5 opacity-50 select-none">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-muted-foreground shrink-0">
                  <Lock className="h-4 w-4" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-foreground">Configure AI Assistant</span>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Customize system prompts and parameters once documents are vectorized.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border/30 bg-muted/10 p-4 flex items-start gap-3.5 opacity-50 select-none">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-muted-foreground shrink-0">
                  <Lock className="h-4 w-4" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-foreground">Test in Playground</span>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Ask questions and inspect grounded citations in real time.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Focused Core Workflow Progression (Sole Interactive Section) */
        <div className="space-y-6">
          <div className="rounded-3xl bg-muted/20 p-5 sm:p-7 space-y-5">
            <div className="space-y-1">
              <h2 className="text-sm sm:text-base font-bold text-foreground">Core Workflow</h2>
              <p className="text-xs text-muted-foreground">Follow these 3 steps to ground and test your AI</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Step 1: Knowledge Base */}
              <div className="rounded-2xl bg-card p-4 sm:p-5 flex flex-col justify-between shadow-xs">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-semibold text-muted-foreground">STEP 01</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Knowledge Base</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {sources.length} sources indexed and vectorized for semantic retrieval.
                  </p>
                </div>
                <div className="pt-4 mt-2 border-t border-border/30">
                  <Link
                    href={`/workspaces/${workspaceId}/projects/${projectId}/sources`}
                    className="group inline-flex items-center text-xs font-medium text-foreground hover:text-primary transition-colors gap-1.5"
                  >
                    <span>Manage sources</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </Link>
                </div>
              </div>

              {/* Step 2: Configure Assistant */}
              <div className="rounded-2xl bg-card p-4 sm:p-5 flex flex-col justify-between shadow-xs">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-semibold text-muted-foreground">STEP 02</span>
                    {hasAssistants ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" /> Pending
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Configure Assistant</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {hasAssistants ? `${assistants.length} assistants active.` : "Set model persona, temperature, and cutoff."}
                  </p>
                </div>
                <div className="pt-4 mt-2 border-t border-border/30">
                  <Link
                    href={`/workspaces/${workspaceId}/projects/${projectId}/assistants`}
                    className="group inline-flex items-center text-xs font-medium text-foreground hover:text-primary transition-colors gap-1.5"
                  >
                    <span>{hasAssistants ? "View assistants" : "Create assistant"}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </Link>
                </div>
              </div>

              {/* Step 3: Test in Playground */}
              <div className="rounded-2xl bg-card p-4 sm:p-5 flex flex-col justify-between shadow-xs">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-semibold text-muted-foreground">STEP 03</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                      <Sparkles className="h-3.5 w-3.5" /> Interactive
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Test in Playground</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Verify answer grounding and evidence citations in real time.
                  </p>
                </div>
                <div className="pt-4 mt-2 border-t border-border/30">
                  <Link
                    href={`/workspaces/${workspaceId}/projects/${projectId}/playground${primaryAssistant ? "?assistantId=" + primaryAssistant.id : ""}`}
                    className="group inline-flex items-center text-xs font-semibold text-foreground hover:text-primary transition-colors gap-1.5"
                  >
                    <span>Launch Playground</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Minimal Assistant Quick-Launch List (only when assistants exist) */}
          {hasAssistants && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Active Assistants ({assistants.length})
                </span>
                <Link
                  href={`/workspaces/${workspaceId}/projects/${projectId}/assistants`}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all &rarr;
                </Link>
              </div>

              <div className="divide-y divide-border/30 rounded-2xl bg-card overflow-hidden">
                {assistants.slice(0, 3).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-3.5 hover:bg-muted/30 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-primary shrink-0">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-semibold text-foreground truncate">{a.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {a.model} &middot; Cutoff: {a.score_threshold}
                        </div>
                      </div>
                    </div>

                    <Link href={`/workspaces/${workspaceId}/projects/${projectId}/playground?assistantId=${a.id}`}>
                      <Button variant="ghost" size="sm" className="rounded-xl h-8 px-3 text-xs font-medium text-foreground hover:text-primary hover:bg-muted gap-1.5">
                        <Sliders className="h-3.5 w-3.5" /> Test
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
