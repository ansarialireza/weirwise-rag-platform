"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/alert";

export default function ProjectOverviewPage() {
  const params = useParams();
  const router = useRouter();
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
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const primaryAssistant = assistants[0] || null;
  const primarySource = sources[0] || null;
  const totalIndexedDocs = usage?.documents_indexed ?? sources.reduce((acc, s) => acc + (s.document_count || 0), 0);
  const chatTurnsUsed = usage?.chat_turns_used ?? 0;
  const chatTurnsLimit = usage?.chat_turns_limit ?? 500;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Top Banner & Quick Journey Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
              {project?.name || "Project Overview"}
            </h1>
            <Badge variant="primary" className="text-xs px-2.5 py-0.5">Active Project</Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-xl">
            Enterprise RAG workspace: manage grounded knowledge, configure assistants, and test citations.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link href={"/workspaces/" + workspaceId + "/projects/" + projectId + "/sources"} className="flex-1 sm:flex-initial">
            <Button variant="outline" size="sm" className="w-full sm:w-auto h-9 px-3.5 text-xs font-semibold gap-2">
              <Database className="h-4 w-4 text-primary shrink-0" /> Manage Knowledge
            </Button>
          </Link>
          <Link href={"/workspaces/" + workspaceId + "/projects/" + projectId + "/playground" + (primaryAssistant ? "?assistantId=" + primaryAssistant.id : "")} className="flex-1 sm:flex-initial">
            <Button variant="primary" size="sm" className="w-full sm:w-auto h-9 px-3.5 text-xs font-bold gap-2">
              <Sliders className="h-4 w-4 shrink-0" /> Launch Playground
            </Button>
          </Link>
        </div>
      </div>

      {/* Real Operational Metrics Cards with Proportional Mobile Dimensions & Prominent Numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-5">
        {/* Metric 1 */}
        <div className="rounded-xl border border-border/90 bg-card p-4 sm:p-5 flex flex-col justify-between shadow-xs transition-all hover:border-border">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs sm:text-sm font-semibold text-foreground/90">Configured Assistants</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Bot className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <div className="my-1">
            <span className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-none">
              {assistants.length}
            </span>
          </div>
          <div className="text-xs text-muted-foreground font-medium pt-1.5 border-t border-border/40 mt-2">
            <span className="font-semibold text-foreground">{assistants.filter((a) => a.status === "published").length}</span> published snapshots
          </div>
        </div>

        {/* Metric 2 */}
        <div className="rounded-xl border border-border/90 bg-card p-4 sm:p-5 flex flex-col justify-between shadow-xs transition-all hover:border-border">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs sm:text-sm font-semibold text-foreground/90">Knowledge Sources</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Database className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <div className="my-1">
            <span className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-none">
              {sources.length}
            </span>
          </div>
          <div className="text-xs text-muted-foreground font-medium pt-1.5 border-t border-border/40 mt-2">
            <span className="font-semibold text-foreground">{totalIndexedDocs}</span> document chunks vectorized
          </div>
        </div>

        {/* Metric 3 */}
        <div className="rounded-xl border border-border/90 bg-card p-4 sm:p-5 flex flex-col justify-between shadow-xs transition-all hover:border-border">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs sm:text-sm font-semibold text-foreground/90">Monthly Chat Turns</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <div className="my-1 flex items-baseline gap-1.5">
            <span className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-none">
              {chatTurnsUsed}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">/ {chatTurnsLimit} turns</span>
          </div>
          <div className="text-xs text-muted-foreground font-medium pt-1.5 border-t border-border/40 mt-2">
            Tier: <span className="uppercase font-mono font-bold text-primary">{usage?.plan_tier || "free"}</span>
          </div>
        </div>
      </div>

      {/* Guided Core User Journey: 3 Direct Milestones */}
      <div className="rounded-xl border border-border bg-card/70 p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-xs">
        <div className="space-y-1">
          <h2 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
            <span>Core Workflow Progression</span>
            <Badge variant="outline" className="text-xs">Grounding Guide</Badge>
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Three simple steps to move from ungrounded prompts to accurate, cited business intelligence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-5 pt-1">
          {/* Step 1 */}
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col justify-between shadow-2xs hover:border-border/90 transition-colors">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">Step 1</span>
                {sources.length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
                    <CheckCircle2 className="h-4 w-4" /> Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" /> Pending
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-foreground">Attach Business Documents</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Upload PDF, TXT, or Markdown documents to create vector embeddings via Jina AI.
              </p>
            </div>
            <div className="pt-3 border-t border-border/50 mt-3">
              <Link
                href={"/workspaces/" + workspaceId + "/projects/" + projectId + "/sources"}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/90 bg-secondary/70 hover:bg-secondary px-3 py-2 text-xs font-semibold text-foreground transition-all shadow-2xs"
              >
                <span>{sources.length > 0 ? "Manage " + sources.length + " sources" : "Upload first source"}</span>
                <ArrowRight className="h-3.5 w-3.5 text-primary" />
              </Link>
            </div>
          </div>

          {/* Step 2 */}
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col justify-between shadow-2xs hover:border-border/90 transition-colors">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">Step 2</span>
                {assistants.length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
                    <CheckCircle2 className="h-4 w-4" /> Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Pending
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-foreground">Configure AI Assistant</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tailor system instructions, response style, strictness parameters, and attached sources.
              </p>
            </div>
            <div className="pt-3 border-t border-border/50 mt-3">
              <Link
                href={"/workspaces/" + workspaceId + "/projects/" + projectId + "/assistants"}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/90 bg-secondary/70 hover:bg-secondary px-3 py-2 text-xs font-semibold text-foreground transition-all shadow-2xs"
              >
                <span>{assistants.length > 0 ? "View " + assistants.length + " assistants" : "Create assistant"}</span>
                <ArrowRight className="h-3.5 w-3.5 text-primary" />
              </Link>
            </div>
          </div>

          {/* Step 3 */}
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col justify-between shadow-2xs hover:border-border/90 transition-colors">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">Step 3</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                  <Sparkles className="h-4 w-4" /> Live Test
                </span>
              </div>
              <h3 className="text-sm font-bold text-foreground">Test in Playground</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ask questions, inspect grounded source citations, and verify answer fidelity in real time.
              </p>
            </div>
            <div className="pt-3 border-t border-border/50 mt-3">
              <Link
                href={"/workspaces/" + workspaceId + "/projects/" + projectId + "/playground" + (primaryAssistant ? "?assistantId=" + primaryAssistant.id : "")}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/90 bg-secondary/70 hover:bg-secondary px-3 py-2 text-xs font-semibold text-foreground transition-all shadow-2xs"
              >
                <span>Launch Playground</span>
                <ArrowRight className="h-3.5 w-3.5 text-primary" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Active Assistants Table / List */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-foreground">Configured Assistants</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Quick access to test and configure assistant prompts</p>
          </div>
          <Link href={"/workspaces/" + workspaceId + "/projects/" + projectId + "/assistants"}>
            <Button variant="secondary" size="sm" className="h-8 px-3 text-xs font-semibold gap-1.5">
              <Plus className="h-4 w-4" /> All Assistants
            </Button>
          </Link>
        </div>

        {assistants.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 sm:p-8 text-center text-xs sm:text-sm text-muted-foreground">
            No assistants in this project yet. Create one to begin testing.
          </div>
        ) : (
          <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {assistants.slice(0, 4).map((a) => (
              <div
                key={a.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 bg-card hover:bg-secondary/40 transition-colors gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-secondary text-primary border border-border/80 shrink-0">
                    <Bot className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-bold text-foreground truncate">{a.name}</span>
                      <Badge variant={a.status === "published" ? "success" : "outline"} className="text-[10px] sm:text-[11px] px-2 py-0.2 shrink-0">
                        {a.status}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono mt-0.5 block truncate">
                      Model: <span className="text-foreground font-medium">{a.model}</span> | Temp: {a.temperature} | Cutoff: {a.score_threshold}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <Link href={"/workspaces/" + workspaceId + "/projects/" + projectId + "/assistants/" + a.id}>
                    <Button variant="outline" size="sm" className="h-8 px-3 text-xs font-semibold">Configure</Button>
                  </Link>
                  <Link href={"/workspaces/" + workspaceId + "/projects/" + projectId + "/playground?assistantId=" + a.id}>
                    <Button variant="primary" size="sm" className="h-8 px-3 text-xs font-bold gap-1.5">
                      <Sliders className="h-4 w-4" /> Test
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
