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

      {/* Direct Entry Points to Knowledge Base and Assistants */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card 1: Knowledge Base */}
        <Link
          href={`/workspaces/${workspaceId}/projects/${projectId}/sources`}
          className="group rounded-3xl border border-border/40 bg-card/60 backdrop-blur-sm p-6 sm:p-8 flex flex-col justify-between hover:border-foreground/30 hover:bg-card/90 transition-all shadow-xs"
        >
          <div className="space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-foreground group-hover:scale-105 transition-transform">
              <Database className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center justify-between">
                <span>Knowledge Base</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-normal">
                  {sources.length} sources
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Upload and manage documents, view chunking status, and inspect mass text ingestion.
              </p>
            </div>
          </div>
          <div className="pt-6 flex items-center gap-1.5 text-xs font-semibold text-foreground group-hover:underline underline-offset-4">
            <span>Open Knowledge Base</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Card 2: Assistants & Search */}
        <Link
          href={`/workspaces/${workspaceId}/projects/${projectId}/assistants`}
          className="group rounded-3xl border border-border/40 bg-card/60 backdrop-blur-sm p-6 sm:p-8 flex flex-col justify-between hover:border-foreground/30 hover:bg-card/90 transition-all shadow-xs"
        >
          <div className="space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-foreground group-hover:scale-105 transition-transform">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center justify-between">
                <span>Assistants &amp; Search</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-normal">
                  {assistants.length} configured
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Configure Semantic Search (vector only) or AI Answer (RAG) engines and test in Playground.
              </p>
            </div>
          </div>
          <div className="pt-6 flex items-center gap-1.5 text-xs font-semibold text-foreground group-hover:underline underline-offset-4">
            <span>Manage Assistants</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>
    </div>
  );
}
