"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Assistant, KnowledgeSource } from "@/types";
import {
  Bot,
  CheckCircle2,
  Database,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { CustomSelect } from "@/components/ui/custom-select";
import { cn } from "@/lib/utils";
import { useWorkflow, useTelemetry } from "@/lib/telemetry";

export default function AssistantsListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const createAssistantWf = useWorkflow("wf_create_assistant");
  const { trackAction, trackFriction } = useTelemetry();

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newAssistantName, setNewAssistantName] = useState("");
  const [newEngineMode, setNewEngineMode] = useState<"search_only" | "ai_answer">("ai_answer");
  const [newInstructions, setNewInstructions] = useState("");
  const [newModel, setNewModel] = useState("Auto");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [aList, sList] = await Promise.all([api.getAssistants(), api.getSources()]);
      setAssistants(aList);
      setSources(sList);
    } catch (err: any) {
      setPageError(err.message || "Could not load your assistants.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssistantName.trim()) {
      trackFriction("form.validation_failed", "input_assistant_name", {
        field: "name",
        reason: "EMPTY_REQUIRED",
      });
      return;
    }
    setCreating(true);

    try {
      const created = await api.createAssistant({
        name: newAssistantName.trim(),
        system_instructions: newInstructions.trim() || "You are an intelligent business assistant.",
        model: newModel,
        engine_mode: newEngineMode,
        temperature: 0.2,
        top_k: 4,
        score_threshold: 0.7,
        knowledge_source_ids: selectedSourceIds.length > 0 ? selectedSourceIds : undefined,
      });

      createAssistantWf.complete({
        engine_mode: newEngineMode,
        model: newModel,
        sources_count: selectedSourceIds.length,
      });

      setShowCreate(false);
      router.push(`/assistants/${created.id}`);
    } catch (err: any) {
      createAssistantWf.stepFailed("API_ERROR", { status: err.status });
      toast({ type: "error", message: err.message || "Failed to create assistant" });
    } finally {
      setCreating(false);
    }
  };

  const openCreateModal = () => {
    trackAction("button.clicked", "btn_new_assistant");
    createAssistantWf.start("modal_open", { sources_available: sources.length });
    setShowCreate(true);
  };

  const closeCreateModal = () => {
    if (showCreate) {
      createAssistantWf.abandon("modal_dismissed");
      setShowCreate(false);
    }
  };

  const hasAssistants = assistants.length > 0;
  const filteredAssistants = assistants.filter(
    (assistant) =>
      assistant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (assistant.description &&
        assistant.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assistants"
        description="Each assistant has a job and a set of knowledge to answer from."
        actions={
          hasAssistants ? (
            <Button onClick={openCreateModal} className="gap-2">
              <Plus className="h-4 w-4" />
              New assistant
            </Button>
          ) : undefined
        }
      />

      {pageError && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
          {pageError}
        </div>
      )}

      {hasAssistants && (
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Find an assistant…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search assistants"
            className="h-10 w-full rounded-lg border border-border bg-input ps-9 pe-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
      )}

      {!hasAssistants ? (
        <EmptyState
          icon={Bot}
          title="Create your first assistant"
          description="Pick the knowledge it should use, then ask it anything. You can always adjust it later."
          actionLabel="Create assistant"
          onAction={openCreateModal}
        />
      ) : filteredAssistants.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">No assistants match “{searchQuery}”.</p>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="mt-2 text-sm font-medium text-accent hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAssistants.map((assistant) => (
            <article
              key={assistant.id}
              className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-muted-foreground/25"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Bot className="h-5 w-5" />
                </div>
                <StatusPill status={assistant.status} />
              </div>

              <div className="mt-4 flex-1">
                <h2 className="truncate text-[15px] font-semibold text-foreground">
                  {assistant.name}
                </h2>
                <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] leading-relaxed text-muted-foreground">
                  {assistant.description ||
                    assistant.system_instructions ||
                    "Answers from the knowledge you attach."}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
                  {assistant.engine_mode === "search_only" ? (
                    <>
                      <Search className="h-3 w-3" />
                      Search mode
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" />
                      AI answers
                    </>
                  )}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
                  <Database className="h-3 w-3" />
                  {assistant.knowledge_source_ids?.length || 0} source
                  {(assistant.knowledge_source_ids?.length || 0) === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3">
                <Link
                  href={`/assistants/${assistant.id}`}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-[13px] font-medium text-foreground transition-colors hover:bg-muted/70"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Configure
                </Link>
                <Link
                  href={`/playground?assistantId=${assistant.id}`}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Test
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        isOpen={showCreate}
        onClose={closeCreateModal}
        title="Create an assistant"
        description="Start with the essentials. You can fine-tune everything later."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateAssistant} className="space-y-5">
          <Input
            label="Name"
            type="text"
            required
            autoFocus
            placeholder="e.g. Support assistant"
            value={newAssistantName}
            onChange={(e) => setNewAssistantName(e.target.value)}
          />

          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 block text-[13px] font-medium text-foreground">
              How should it respond?
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                {
                  value: "ai_answer" as const,
                  title: "AI answers",
                  description: "Writes a clear answer and cites its source.",
                  icon: Sparkles,
                },
                {
                  value: "search_only" as const,
                  title: "Search only",
                  description: "Shows matching passages without writing.",
                  icon: Search,
                },
              ].map((option) => {
                const Icon = option.icon;
                const selected = newEngineMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setNewEngineMode(option.value)}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-xl border p-3.5 text-start transition-colors",
                      selected
                        ? "border-accent/50 bg-accent-soft"
                        : "border-border bg-background hover:bg-muted/50"
                    )}
                  >
                    <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                      <Icon className={cn("h-4 w-4", selected ? "text-accent" : "text-muted-foreground")} />
                      {option.title}
                    </span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {sources.length > 0 && (
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 block text-[13px] font-medium text-foreground">
                Knowledge sources
                <span className="ms-1 font-normal text-muted-foreground">(optional)</span>
              </legend>
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border bg-background/60 p-1.5">
                {sources.map((source) => {
                  const checked = selectedSourceIds.includes(source.id);
                  return (
                    <button
                      key={source.id}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() =>
                        setSelectedSourceIds((prev) =>
                          checked ? prev.filter((id) => id !== source.id) : [...prev, source.id]
                        )
                      }
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] transition-colors",
                        checked ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          checked
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border bg-card"
                        )}
                      >
                        {checked && <CheckCircle2 className="h-3 w-3" />}
                      </span>
                      <Database className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{source.name}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <details className="group rounded-xl border border-border bg-background/60 px-3.5 py-3">
            <summary className="cursor-pointer list-none text-[13px] font-medium text-foreground">
              Advanced options
              <span className="ms-1 font-normal text-muted-foreground">— model and personality</span>
            </summary>
            <div className="mt-3 space-y-4 border-t border-border/60 pt-3">
              {newEngineMode === "ai_answer" && (
                <CustomSelect
                  label="Model"
                  value={newModel}
                  onChange={setNewModel}
                  options={[
                    { value: "Auto", label: "Auto (recommended)" },
                    { value: "Fast", label: "Fast responses" },
                    { value: "Deep Thinking", label: "Deeper reasoning" },
                  ]}
                />
              )}
              <div className="space-y-1.5">
                <label htmlFor="assistant-instructions" className="block text-[13px] font-medium text-foreground">
                  Personality and rules
                </label>
                <textarea
                  id="assistant-instructions"
                  rows={4}
                  placeholder="e.g. Be concise and friendly. Always mention the policy name."
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  className="w-full resize-none rounded-lg border border-border bg-input p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </div>
          </details>

          <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
            <Button type="button" variant="ghost" onClick={closeCreateModal}>
              Cancel
            </Button>
            <Button type="submit" isLoading={creating} disabled={!newAssistantName.trim()}>
              Create assistant
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
