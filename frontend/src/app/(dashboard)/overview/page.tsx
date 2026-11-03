"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Assistant, KnowledgeSource } from "@/types";
import { BrutalistLoader } from "@/components/ui/brutalist-loader";
import {
  Bot,
  Database,
  ArrowRight,
} from "lucide-react";

export default function OverviewPage() {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getAssistants(),
      api.getSources(),
    ])
      .then(([aList, sList]) => {
        setAssistants(aList);
        setSources(sList);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <BrutalistLoader label="LOADING OVERVIEW" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-150">
      {/* Ruthlessly Clean Typographic Header */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Overview
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Connect company documents, configure AI assistants, and verify answers with deterministic citations.
        </p>
      </div>

      {/* Direct Entry Points to Knowledge Base and Assistants */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card 1: Knowledge Base */}
        <Link
          href="/sources"
          className="group rounded-md border border-zinc-800 bg-zinc-950/40 p-6 sm:p-8 flex flex-col justify-between hover:border-zinc-700 hover:bg-zinc-900/60 transition-all shadow-xs"
        >
          <div className="space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-[#46C7D6] transition-transform">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center justify-between">
                <span>Knowledge Base</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-sm border border-zinc-800 bg-zinc-900/60 text-zinc-400">
                  {sources.length} sources
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Upload and manage documents, view chunking status, and inspect mass text ingestion.
              </p>
            </div>
          </div>
          <div className="pt-6 flex items-center gap-1.5 text-xs font-semibold text-foreground group-hover:text-[#46C7D6] transition-colors">
            <span>Open Knowledge Base</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Card 2: Assistants & Search */}
        <Link
          href="/assistants"
          className="group rounded-md border border-zinc-800 bg-zinc-950/40 p-6 sm:p-8 flex flex-col justify-between hover:border-zinc-700 hover:bg-zinc-900/60 transition-all shadow-xs"
        >
          <div className="space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-[#46C7D6] transition-transform">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center justify-between">
                <span>Assistants &amp; Search</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-sm border border-zinc-800 bg-zinc-900/60 text-zinc-400">
                  {assistants.length} configured
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Configure Semantic Search or AI Answer RAG engines and test in Playground.
              </p>
            </div>
          </div>
          <div className="pt-6 flex items-center gap-1.5 text-xs font-semibold text-foreground group-hover:text-[#46C7D6] transition-colors">
            <span>Manage Assistants</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>
    </div>
  );
}
