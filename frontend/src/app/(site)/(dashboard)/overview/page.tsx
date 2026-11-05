"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Assistant, KnowledgeSource } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Database,
  FileText,
  MessageSquare,
  Plus,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { formatNumber } from "@/lib/i18n/format";

export default function OverviewPage() {
  const { locale } = useI18n();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getAssistants(), api.getSources()])
      .then(([aList, sList]) => {
        setAssistants(aList);
        setSources(sList);
      })
      .catch((err: any) => setError(err.message || "We couldn't load your workspace right now. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const documentCount = sources.reduce((total, source) => total + (source.document_count || 0), 0);
  const publishedAssistants = assistants.filter((assistant) => assistant.status === "published");
  const attention = sources.filter((source) => source.status === "failed").length;

  const steps = [
    {
      title: "Add your knowledge",
      description: "Upload the documents your team already relies on.",
      href: "/sources",
      action: "Add knowledge",
      done: sources.length > 0,
    },
    {
      title: "Create an assistant",
      description: "Choose the knowledge it uses and how it should answer.",
      href: "/assistants",
      action: "Create assistant",
      done: assistants.length > 0,
    },
    {
      title: "Share an answer",
      description: "Publish the assistant or embed it where your customers are.",
      href: "/assistants",
      action: "Publish",
      done: publishedAssistants.length > 0,
    },
  ];
  const completed = steps.filter((step) => step.done).length;
  const progress = Math.round((completed / steps.length) * 100);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-56" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Overview"
        description="Everything your workspace needs, in one clear place."
        actions={
          <>
            {/* "Add knowledge" is offered by step 1 and by the empty state below;
                the bar carries only the action those do not. */}
            <Link
              href="/playground"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <MessageSquare className="h-4 w-4" />
              Ask a question
            </Link>
          </>
        }
      />

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Collections",
            value: sources.length,
            hint: `${formatNumber(documentCount, locale)} document${documentCount === 1 ? "" : "s"}`,
            icon: Database,
            href: "/sources",
          },
          {
            label: "Assistants",
            value: assistants.length,
            hint: `${formatNumber(publishedAssistants.length, locale)} published`,
            icon: Bot,
            href: "/assistants",
          },
          {
            label: "Needs attention",
            value: attention,
            hint: attention === 0 ? "Everything looks healthy" : "Needs attention",
            icon: attention > 0 ? AlertCircle : CheckCircle2,
            href: "/sources",
            tone: attention > 0 ? "warning" : "default",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              href={stat.href}
              className="group rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-muted-foreground/25"
            >
              <div className="flex items-start justify-between">
                <span className="text-[13px] font-medium text-muted-foreground">{stat.label}</span>
                <Icon
                  className={cn(
                    "h-4 w-4",
                    stat.tone === "warning" && stat.value > 0 ? "text-warning" : "text-muted-foreground/70"
                  )}
                />
              </div>
              <div className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                {formatNumber(stat.value, locale)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{stat.hint}</div>
            </Link>
          );
        })}
      </div>

      {/* Getting started */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              {completed === steps.length ? "You're all set" : "Get started with Weirwise"}
            </h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {completed === steps.length
                ? "Your assistant is live. Ask a question to see it in action."
                : "Three small steps from documents to a working assistant."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-signal transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {formatNumber(completed, locale)}/{formatNumber(steps.length, locale)}
            </span>
          </div>
        </div>

        <ol className="divide-y divide-border/60">
          {steps.map((step, index) => (
            <li key={step.title}>
              <Link
                href={step.href}
                className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                    step.done
                      ? "border-signal/40 bg-signal/15 text-foreground"
                      : "border-border bg-background text-muted-foreground"
                  )}
                >
                  {step.done ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-sm font-medium",
                      step.done ? "text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {step.title}
                  </div>
                  {/* Clipping here hid a third of the sentence at 390px with no way
                      to read the rest; two wrapped lines cost nothing and stay legible. */}
                  <div className="line-clamp-2 text-xs text-muted-foreground">{step.description}</div>
                </div>
                <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground sm:inline-flex">
                  {step.done ? "Review" : step.action}
                  <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* Recent content */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Knowledge</h2>
            </div>
            <Link
              href="/sources"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>

          {sources.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <FileText className="mx-auto h-5 w-5 text-muted-foreground/70" />
              <p className="mt-2 text-sm font-medium text-foreground">No knowledge yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                Add documents so your assistant has something to answer from.
              </p>
              <Link
                href="/sources"
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Add knowledge
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {sources.slice(0, 4).map((source) => (
                <li key={source.id}>
                  <Link
                    href="/sources"
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-foreground">
                        {source.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {source.document_count ?? 0} document
                        {(source.document_count ?? 0) === 1 ? "" : "s"}
                      </div>
                    </div>
                    <StatusPill
                      status={source.document_count ? source.status : "draft"}
                      label={source.document_count ? undefined : "Empty"}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Assistants</h2>
            </div>
            <Link
              href="/assistants"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>

          {assistants.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Sparkles className="mx-auto h-5 w-5 text-muted-foreground/70" />
              <p className="mt-2 text-sm font-medium text-foreground">No assistants yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                Create one to turn your knowledge into answers.
              </p>
              <Link
                href="/assistants"
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Create assistant
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {assistants.slice(0, 4).map((assistant) => (
                <li key={assistant.id}>
                  <Link
                    href={`/assistants/${assistant.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Bot className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-foreground">
                        {assistant.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {assistant.engine_mode === "search_only" ? "Search mode" : "AI answers"}
                      </div>
                    </div>
                    <StatusPill status={assistant.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
