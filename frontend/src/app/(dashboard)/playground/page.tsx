"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Assistant, KnowledgeSource, ChatMessage } from "@/types";
import {
  Bot,
  ArrowUp,
  FileText,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  ChevronRight,
  SlidersHorizontal,
  Plus,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { CrystallineCursor } from "@/components/chat/crystalline-cursor";
import { ScrambleText } from "@/components/chat/scramble-text";
import { BrutalistLoader } from "@/components/ui/brutalist-loader";

export default function DedicatedPlaygroundPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const preselectedAssistantId = searchParams.get("assistantId");

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);

  // Playground conversation state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [chatting, setChatting] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Inspector Panel toggle
  const [showInspector, setShowInspector] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyEvidence = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  useEffect(() => {
    Promise.all([
      api.getAssistants(),
      api.getSources(),
    ])
      .then(([aList, sList]) => {
        setAssistants(aList);
        setSources(sList);
        if (aList.length > 0) {
          const found = preselectedAssistantId
            ? aList.find((a) => a.id === preselectedAssistantId)
            : aList[0];
          setSelectedAssistant(found || aList[0]);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [preselectedAssistantId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatting]);

  const handleSelectAssistant = (assistantId: string) => {
    const found = assistants.find((a) => a.id === assistantId);
    if (found) {
      setSelectedAssistant(found);
      setMessages([]);
      setConversationId(undefined);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query || chatting || !selectedAssistant) return;

    setInputQuery("");

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      role: "user",
      content: query,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setChatting(true);

    try {
      const resp = await api.chatWithAssistant(
        selectedAssistant.id,
        query,
        conversationId
      );

      setConversationId(resp.conversation_id);

      const assistantMsg: ChatMessage = {
        id: resp.message_id,
        role: "assistant",
        content: resp.content,
        sources: resp.sources,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: Math.random().toString(),
        role: "assistant",
        content: `Error: ${err.message || "Unable to retrieve response from assistant."}`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setChatting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <BrutalistLoader label="INITIALIZING PLAYGROUND" />
      </div>
    );
  }

  const promptSuggestions = [
    "What are our core operational guidelines?",
    "Summarize key policies found in the uploaded documents",
    "Explain our customer onboarding workflow",
  ];

  const hasAssistants = assistants.length > 0;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {/* Top Header: Clean & Minimalist data-terminal bar */}
      <header className="flex h-14 items-center justify-between border-b border-zinc-800 px-4 sm:px-6 shrink-0 bg-zinc-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          {hasAssistants ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-mono font-bold text-zinc-400 shrink-0 hidden sm:inline uppercase">Assistant:</span>
              <div className="w-48 sm:w-60 shrink-0">
                <CustomSelect
                  value={selectedAssistant?.id || ""}
                  onChange={(val) => handleSelectAssistant(val)}
                  triggerClassName="h-8 rounded-md bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-2.5 text-xs font-semibold text-foreground"
                  options={assistants.map((a) => ({
                    value: a.id,
                    label: a.name,
                    description: `${a.engine_mode === "search_only" ? "Semantic Search" : "AI Answer"} • ${a.model}`,
                  }))}
                />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm border border-zinc-800 bg-zinc-900/40 text-zinc-400 uppercase hidden sm:inline">
                {selectedAssistant?.engine_mode === "search_only" ? "Search Only" : "AI Answer"}
              </span>
            </div>
          ) : (
            <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">Playground Terminal</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMessages([]);
                setConversationId(undefined);
              }}
              className="rounded-md border border-transparent hover:border-zinc-800 h-8 px-2.5 text-xs font-medium text-zinc-400 hover:text-white gap-1.5 transition-colors"
              title="Clear chat"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )}

          {selectedAssistant && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowInspector(!showInspector)}
              className={`rounded-md border h-8 px-2.5 text-xs font-medium gap-1.5 transition-colors ${
                showInspector
                  ? "text-[#46C7D6] bg-zinc-900 border-zinc-700"
                  : "text-zinc-400 hover:text-white border-transparent hover:border-zinc-800"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          )}
        </div>
      </header>

      {/* Main Studio Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Chat Stream & Floating Input */}
        <div className="flex flex-1 flex-col overflow-hidden relative">
          {/* Scrollable Message List */}
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 space-y-6 max-w-3xl w-full mx-auto pb-36">
            {/* Case 1: No Assistant Configured in Project (Single focused hero action) */}
            {!hasAssistants ? (
              <div className="flex flex-col items-center justify-center min-h-[55vh] text-center space-y-5 px-4 animate-in fade-in duration-150">
                <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-[#46C7D6]">
                  <Bot className="h-6 w-6" />
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <h2 className="text-lg sm:text-xl font-bold text-foreground">
                    No assistant configured yet
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Configure an assistant with your model and instructions to start testing grounded responses.
                  </p>
                </div>

                {/* Single, Primary Centered Action Button with Solid Clean Styling */}
                <Link href={`/assistants`} className="pt-1">
                  <Button variant="primary" size="lg" className="rounded-md px-6 h-9 text-xs sm:text-sm font-bold gap-2 shadow-xs">
                    <Plus className="h-4 w-4" /> Create Assistant
                  </Button>
                </Link>
              </div>
            ) : messages.length === 0 ? (
              /* Case 2: Assistant Ready, Empty State with Clickable Prompt Chips */
              <div className="flex flex-col items-center justify-center min-h-[55vh] text-center space-y-6 px-4 animate-in fade-in duration-150">
                <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-[#46C7D6]">
                  <Bot className="h-6 w-6" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    {selectedAssistant ? selectedAssistant.name : "Grounding Playground"}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
                    Ask questions grounded directly in your uploaded knowledge sources.
                  </p>
                </div>

                {/* Prompt Suggestions with Tactile Hover Affordance */}
                <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 justify-center max-w-lg pt-2">
                  {promptSuggestions.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handleSendMessage(prompt)}
                      className="group rounded-md bg-zinc-900/40 hover:bg-zinc-900 hover:border-zinc-700 active:scale-98 px-3.5 py-2 text-xs text-zinc-300 hover:text-white transition-all duration-150 border border-zinc-800 text-left sm:text-center flex items-center justify-between sm:justify-center gap-2 cursor-pointer"
                    >
                      <span>{prompt}</span>
                      <ArrowRight className="h-3 w-3 text-zinc-500 group-hover:text-[#46C7D6] transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Case 3: Message Flow */
              messages.map((msg, idx) => {
                const isSearchOnly = selectedAssistant?.engine_mode === "search_only";

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === "user" ? "items-end" : "items-start"
                    } space-y-2`}
                  >
                    <div
                      className={`max-w-2xl text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-white text-black font-medium rounded-md px-4 py-2.5"
                          : isSearchOnly
                          ? "bg-zinc-950/40 border border-zinc-800 text-zinc-200 rounded-md p-4 w-full"
                          : "bg-zinc-900/30 border border-zinc-800/80 text-zinc-200 rounded-md px-4 py-3"
                      }`}
                    >
                      {/* For Search Only mode, display prominent search summary header */}
                      {msg.role === "assistant" && isSearchOnly ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-2 border-b border-border/30">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Vector Similarity Results
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm border border-zinc-800 bg-zinc-900/40 text-zinc-400">
                              {msg.sources?.length || 0} Chunks Matched
                            </span>
                          </div>

                          {msg.sources && msg.sources.length > 0 ? (
                            <div className="space-y-3">
                              {msg.sources.map((s, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-md bg-zinc-900/60 p-3.5 text-xs border border-zinc-800 space-y-2"
                                >
                                  <div className="flex justify-between items-center text-foreground font-medium">
                                    <span className="text-xs font-semibold">Passage #{s.rank || idx + 1}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-mono font-bold text-[#46C7D6]">
                                        {(s.similarity_score * 100).toFixed(1)}% match
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyEvidence(s.content, idx)}
                                        className="p-1 rounded-sm hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                                        title="Copy chunk text"
                                      >
                                        {copiedIndex === idx ? (
                                          <Check className="h-3 w-3 text-white" />
                                        ) : (
                                          <Copy className="h-3 w-3" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                  <p className="text-[12px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                    {s.content}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No document chunks exceeded the cutoff threshold.</p>
                          )}
                        </div>
                      ) : (
                        /* Standard AI Answer mode */
                        <>
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {idx === messages.length - 1 ? (
                              <ScrambleText text={msg.content} />
                            ) : (
                              msg.content
                            )}
                          </div>

                          {/* Citations Box (Minimalist cards) */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-border/40 space-y-2.5">
                              <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Grounded Evidence ({msg.sources.length})
                              </span>
                              <div className="space-y-2">
                                {msg.sources.map((s, idx) => (
                                  <div
                                    key={idx}
                                    className="rounded-md bg-zinc-900/60 p-3 text-xs border border-zinc-800 text-zinc-300"
                                  >
                                    <div className="flex justify-between items-center text-foreground font-medium mb-1">
                                      <span className="text-[11px] font-mono">Chunk #{s.rank || idx + 1}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-mono text-[#46C7D6] font-bold">
                                          {(s.similarity_score * 100).toFixed(1)}% match
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleCopyEvidence(s.content, idx)}
                                          className="p-1 rounded-sm hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                                          title="Copy quote"
                                        >
                                          {copiedIndex === idx ? (
                                            <Check className="h-3 w-3 text-white" />
                                          ) : (
                                            <Copy className="h-3 w-3" />
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                    <p className="text-[12px] text-zinc-300 leading-relaxed italic line-clamp-3">
                                      &quot;{s.content}&quot;
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Chatting Loading indicator */}
            {chatting && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pl-2">
                <span className="font-mono text-xs text-foreground/80">Synthesizing ground truth</span>
                <CrystallineCursor />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Floating Pill Prompt Input Bar pinned at bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background/95 to-transparent pt-8">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className={`max-w-3xl mx-auto flex items-center bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 rounded-md shadow-lg p-1.5 transition-all ${
                !hasAssistants ? "opacity-50 cursor-not-allowed" : "focus-within:border-zinc-700"
              }`}
            >
              <input
                type="text"
                value={inputQuery}
                disabled={chatting || !hasAssistants}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder={
                  hasAssistants && selectedAssistant
                    ? `Message ${selectedAssistant.name}...`
                    : "Configure an assistant first to start chatting..."
                }
                className="flex-1 bg-transparent px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
              />

              {/* Only render send button when assistant exists */}
              {hasAssistants && (
                <button
                  type="submit"
                  disabled={!inputQuery.trim() || chatting}
                  className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-black disabled:opacity-30 disabled:pointer-events-none hover:bg-zinc-200 active:scale-95 transition-all shrink-0 mr-1"
                  aria-label="Send message"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Right Parameters Drawer/Inspector */}
        {showInspector && selectedAssistant && (
          <aside className="w-72 border-l border-zinc-800 bg-zinc-950/80 backdrop-blur-md p-5 overflow-y-auto space-y-5 animate-in slide-in-from-right-10 duration-150">
            <div>
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 mb-1">
                Assistant Settings
              </h3>
              <p className="text-xs text-muted-foreground">
                Inference configuration and thresholds
              </p>
            </div>

            <div className="space-y-3 rounded-md bg-zinc-900/60 border border-zinc-800 p-4 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Model</span>
                <span className="font-semibold text-foreground font-mono">{selectedAssistant.model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Temperature</span>
                <span className="font-semibold text-foreground font-mono">{selectedAssistant.temperature}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cutoff</span>
                <span className="font-semibold text-foreground font-mono">{selectedAssistant.score_threshold}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Top K</span>
                <span className="font-semibold text-foreground font-mono">{selectedAssistant.top_k}</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-foreground">Instructions</span>
              <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-300 line-clamp-6 leading-relaxed font-mono">
                {selectedAssistant.system_instructions || "Default assistant instructions."}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Indexed Sources</span>
                <span className="text-xs font-mono text-muted-foreground">{sources.length}</span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {sources.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-md border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-xs">
                    <FileText className="h-3.5 w-3.5 text-[#46C7D6] shrink-0" />
                    <span className="truncate text-foreground font-medium">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <Link href={`/assistants/${selectedAssistant.id}`}>
                <Button variant="outline" size="sm" className="w-full rounded-md text-xs font-medium border-zinc-800 hover:border-zinc-700">
                  Full Configuration &rarr;
                </Button>
              </Link>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
