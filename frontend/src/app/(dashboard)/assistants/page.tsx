"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Assistant, KnowledgeSource } from "@/types";
import {
  Bot,
  Plus,
  Sliders,
  CheckCircle2,
  X,
  Search,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CustomSelect } from "@/components/ui/custom-select";
import { cn } from "@/lib/utils";
import { useWorkflow, useTelemetry } from "@/lib/telemetry";
import { BrutalistLoader } from "@/components/ui/brutalist-loader";

export default function AssistantsListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const createAssistantWf = useWorkflow("wf_create_assistant");
  const { trackAction, trackFriction } = useTelemetry();

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Modal / Drawer State
  const [showCreate, setShowCreate] = useState(false);
  const [newAssistantName, setNewAssistantName] = useState("");
  const [newEngineMode, setNewEngineMode] = useState<"search_only" | "ai_answer">("ai_answer");
  const [newInstructions, setNewInstructions] = useState("");
  const [newModel, setNewModel] = useState("Auto");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Swipe-to-dismiss gesture handling for mobile bottom drawer
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [drawerTranslateY, setDrawerTranslateY] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [aList, sList] = await Promise.all([
        api.getAssistants(),
        api.getSources(),
      ]);
      setAssistants(aList);
      setSources(sList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lock body scroll when modal/drawer is open
  useEffect(() => {
    if (showCreate) {
      document.body.style.overflow = "hidden";
      setDrawerTranslateY(0);
    } else {
      document.body.style.overflow = "";
      setDrawerTranslateY(0);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showCreate]);

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
      const created = await api.createAssistant( {
        name: newAssistantName.trim(),
        system_instructions: newInstructions.trim() || "You are an intelligent business assistant.",
        model: newModel,
        engine_mode: newEngineMode,
        temperature: 0.2,
        top_k: 4,
        score_threshold: 0.7,
        knowledge_source_ids: selectedSourceIds.length > 0 ? selectedSourceIds : undefined,
      });

      // Workflow completed successfully
      createAssistantWf.complete({
        engine_mode: newEngineMode,
        model: newModel,
        sources_count: selectedSourceIds.length,
      });

      setShowCreate(false);
      router.push(`/assistants/${created.id}`);
    } catch (err: any) {
      createAssistantWf.stepFailed("API_ERROR", {
        status: err.status,
      });
      toast({ type: "error", message: err.message || "Failed to create assistant" });
    } finally {
      setCreating(false);
    }
  };

  const openCreateModal = () => {
    trackAction("button.clicked", "btn_new_assistant");
    createAssistantWf.start("modal_open", {
      sources_available: sources.length,
    });
    setShowCreate(true);
  };

  const closeCreateModal = () => {
    if (showCreate) {
      createAssistantWf.abandon("modal_dismissed");
      setShowCreate(false);
    }
  };

  const hasAssistants = assistants.length > 0;

  const filteredAssistants = assistants.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.description && a.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Touch handlers for drawer swipe-down
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const deltaY = e.touches[0].clientY - touchStartY;
    if (deltaY > 0) {
      setDrawerTranslateY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (drawerTranslateY > 100) {
      setShowCreate(false);
    } else {
      setDrawerTranslateY(0);
    }
    setTouchStartY(null);
  };

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <BrutalistLoader label="RETRIEVING ASSISTANTS" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-150">
      {/* Header with Progressive Disclosure: Only show count badge & "+ New Assistant" button when assistants exist */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
              Assistants
            </h1>
            {hasAssistants && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-400">
                {assistants.length}
              </span>
            )}
          </div>
        </div>

        {hasAssistants && (
          <Button
            onClick={openCreateModal}
            variant="primary"
            size="sm"
            className="rounded-md h-9 px-4 text-xs font-semibold gap-2 shrink-0 self-start sm:self-center shadow-xs"
          >
            <Plus className="h-4 w-4" /> New Assistant
          </Button>
        )}
      </div>

      {/* Progressive Disclosure: Only reveal Search when assistants exist */}
      {hasAssistants && (
        <div className="flex items-center justify-between gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search assistants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-zinc-800 bg-zinc-950/40 pl-10 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {!hasAssistants ? (
        /* Ruthlessly Clean Zero-State */
        <div className="rounded-md border border-zinc-800 bg-zinc-950/20 p-8 sm:p-14 text-center flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-150">
          <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-[#46C7D6]">
            <Bot className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">
              No assistants configured yet
            </h2>
          </div>

          <Button
            onClick={openCreateModal}
            variant="primary"
            size="md"
            className="rounded-md px-5 font-bold gap-2 shadow-xs text-xs sm:text-sm h-9"
          >
            <Plus className="h-4 w-4" /> Create Assistant
          </Button>
        </div>
      ) : filteredAssistants.length === 0 ? (
        /* Filter Zero-State */
        <div className="rounded-md border border-zinc-800 bg-zinc-950/20 p-8 text-center text-xs text-muted-foreground space-y-2">
          <p>No assistants match &quot;{searchQuery}&quot;</p>
          <button
            onClick={() => setSearchQuery("")}
            className="text-primary hover:underline font-medium"
          >
            Clear filter
          </button>
        </div>
      ) : (
        /* Bento-Grid / Borderless Assistant Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssistants.map((a) => (
            <div
              key={a.id}
              className="group flex flex-col justify-between rounded-md border border-zinc-800 bg-zinc-950/20 hover:border-zinc-700 hover:bg-zinc-900/40 p-5 transition-all duration-150"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-[#46C7D6]">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm border border-zinc-800 bg-zinc-900/60 text-zinc-300 uppercase">
                      {a.engine_mode === "search_only" ? "Search" : "AI"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-none bg-emerald-400" />
                      {a.status}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {a.name}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                    {a.system_instructions || "Default assistant persona."}
                  </p>
                </div>

                <div className="pt-2 text-[11px] text-muted-foreground font-mono flex items-center justify-between">
                  <span>Routing: <span className="text-foreground font-medium">{a.model}</span></span>
                  <span>{a.knowledge_source_ids?.length || 0} sources</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center gap-2">
                <Link
                  href={`/assistants/${a.id}`}
                  className="flex-1"
                >
                  <Button variant="ghost" size="sm" className="w-full rounded-md border border-transparent hover:border-zinc-800 h-8 px-2.5 text-xs font-medium text-zinc-400 hover:text-white">
                    Configure
                  </Button>
                </Link>
                <Link
                  href={`/playground?assistantId=${a.id}`}
                  className="flex-1"
                >
                  <Button variant="primary" size="sm" className="w-full rounded-md h-8 px-2.5 text-xs font-semibold gap-1.5 shadow-xs">
                    <Sliders className="h-3.5 w-3.5" /> Test
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Responsive Creation Component */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-150 p-0 md:p-6"
          onClick={closeCreateModal}
          role="dialog"
          aria-modal="true"
          aria-label="Create New Assistant"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              transform: drawerTranslateY > 0 ? `translateY(${drawerTranslateY}px)` : undefined,
              transition: touchStartY === null ? "transform 0.15s ease-out" : "none",
            }}
            className={cn(
              "w-full bg-[#0c0d10] text-foreground border-zinc-800 shadow-2xl flex flex-col relative",
              "mt-auto md:mt-0 rounded-t-md md:rounded-md border-t md:border border-x-0 md:border-x max-h-[90vh] md:max-h-[85vh] md:max-w-lg animate-in slide-in-from-bottom-8 md:slide-in-from-bottom-0 md:zoom-in-95 duration-150"
            )}
          >
            {/* Mobile Swipe-Down Handle */}
            <div className="flex justify-center pt-3 pb-1 md:hidden cursor-grab active:cursor-grabbing">
              <div className="h-1 w-12 rounded-sm bg-zinc-700" />
            </div>

            {/* Header with Title and 'X' Button */}
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-zinc-800/80 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900/60 text-[#46C7D6] shrink-0">
                  <Bot className="h-4 w-4 stroke-[1.5]" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-foreground tracking-tight font-mono">Create Assistant</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="h-8 w-8 flex items-center justify-center rounded-sm border border-transparent hover:border-zinc-800 text-zinc-400 hover:text-foreground hover:bg-zinc-800/60 active:scale-95 transition-all"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateAssistant} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1">
                {/* Engine Mode Toggle */}
                <div className="space-y-1.5">
                  <label className="text-xs font-mono font-medium text-zinc-300">Engine Mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setNewEngineMode("search_only")}
                      className={`p-3 rounded-md text-left border text-xs transition-all ${
                        newEngineMode === "search_only"
                          ? "border-zinc-500 bg-zinc-900/60 text-foreground font-medium"
                          : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-foreground"
                      }`}
                    >
                      <div className="font-semibold text-foreground">Semantic Search</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewEngineMode("ai_answer")}
                      className={`p-3 rounded-md text-left border text-xs transition-all ${
                        newEngineMode === "ai_answer"
                          ? "border-zinc-500 bg-zinc-900/60 text-foreground font-medium"
                          : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-foreground"
                      }`}
                    >
                      <div className="font-semibold text-foreground">AI Answer</div>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono font-medium text-zinc-300">Assistant Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Compliance Analyst"
                    value={newAssistantName}
                    onChange={(e) => setNewAssistantName(e.target.value)}
                    className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950/40 px-3.5 py-2 text-xs sm:text-sm text-foreground placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-white/20 transition-all font-mono"
                  />
                </div>

                {/* AI Routing Strategy */}
                {newEngineMode === "ai_answer" && (
                  <div className="space-y-5 animate-in fade-in duration-150">
                    <div className="space-y-1.5">
                      <CustomSelect
                        label="AI Routing Strategy"
                        value={newModel}
                        onChange={(val) => setNewModel(val)}
                        triggerClassName="border-zinc-800 bg-zinc-950/40 text-foreground focus:ring-1 focus:ring-white/20 focus:border-zinc-500 rounded-md"
                        options={[
                          {
                            value: "Auto",
                            label: "Auto Routing",
                          },
                          {
                            value: "Fast",
                            label: "Fast Response",
                          },
                          {
                            value: "Deep Thinking",
                            label: "Deep Thinking",
                          },
                        ]}
                      />
                    </div>

                    {/* System Instructions */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-mono font-medium text-zinc-300">System Instructions</label>
                      <textarea
                        rows={4}
                        placeholder="Instructions, grounding rules, and tone..."
                        value={newInstructions}
                        onChange={(e) => setNewInstructions(e.target.value)}
                        className="w-full rounded-md border border-zinc-800 bg-zinc-950/40 p-3.5 text-xs sm:text-sm text-foreground placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-white/20 transition-all leading-relaxed resize-none font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* Knowledge Sources Checklist */}
                {sources.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono font-medium text-zinc-300">Attach Knowledge Sources</label>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto rounded-md border border-zinc-800/80 p-2 bg-zinc-950/30">
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
                            className={`flex items-center justify-between p-2.5 rounded-md cursor-pointer text-xs transition-colors ${
                              isSelected
                                ? "bg-zinc-800/70 text-foreground font-medium border border-zinc-700/60"
                                : "hover:bg-zinc-900/60 text-zinc-400 hover:text-foreground border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <Database className="h-3.5 w-3.5 shrink-0 stroke-[1.5]" />
                              <span className="truncate">{s.name}</span>
                            </div>
                            {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons Footer */}
              <div className="px-6 sm:px-8 py-4 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center justify-end gap-3 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={closeCreateModal}
                  className="rounded-md"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={creating}
                  disabled={!newAssistantName.trim()}
                  className="rounded-md px-5 font-semibold"
                >
                  Create Assistant
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
