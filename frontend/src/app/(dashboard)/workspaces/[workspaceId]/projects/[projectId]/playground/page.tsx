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
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DedicatedPlaygroundPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;
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
    if (projectId) {
      Promise.all([
        api.getAssistants(projectId),
        api.getSources(projectId),
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
    }
  }, [projectId, preselectedAssistantId]);

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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const promptSuggestions = [
    "What are our core operational guidelines?",
    "Summarize key policies found in the uploaded documents",
    "Explain our customer onboarding workflow",
  ];

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {/* Top Header: Clean, Minimalist, Non-distracting */}
      <header className="flex h-14 items-center justify-between border-b border-border/40 px-4 sm:px-6 shrink-0 bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {assistants.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Assistant:</span>
              <select
                value={selectedAssistant?.id || ""}
                onChange={(e) => handleSelectAssistant(e.target.value)}
                className="h-8 rounded-xl bg-muted/50 px-2.5 text-xs font-semibold text-foreground focus:outline-none border-none cursor-pointer"
              >
                {assistants.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.model})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="text-xs font-medium text-muted-foreground">No assistant configured</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMessages([]);
                setConversationId(undefined);
              }}
              className="h-8 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground gap-1.5"
              title="Clear chat"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowInspector(!showInspector)}
            className={`h-8 px-2.5 text-xs font-medium gap-1.5 ${showInspector ? "text-primary bg-muted" : "text-muted-foreground hover:text-foreground"}`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </Button>
        </div>
      </header>

      {/* Main Studio Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Chat Stream & Floating Input */}
        <div className="flex flex-1 flex-col overflow-hidden relative">
          {/* Scrollable Message List */}
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 space-y-6 max-w-3xl w-full mx-auto pb-32">
            {messages.length === 0 ? (
              /* Centered ChatGPT-style Empty State */
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-primary">
                  <Bot className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    {selectedAssistant ? selectedAssistant.name : "Playground"}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
                    Ask questions grounded directly in your uploaded knowledge sources.
                  </p>
                </div>

                {/* Prompt Suggestions */}
                <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-center max-w-lg pt-2">
                  {promptSuggestions.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handleSendMessage(prompt)}
                      className="rounded-full bg-muted/50 hover:bg-muted px-4 py-2 text-xs text-foreground/80 hover:text-foreground transition-colors border border-border/20 text-left sm:text-center"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Message Flow */
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  } space-y-2`}
                >
                  <div
                    className={`max-w-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground font-medium rounded-3xl rounded-br-sm px-5 py-3 shadow-xs"
                        : "bg-muted/40 text-foreground rounded-3xl rounded-bl-sm px-5 py-4"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>

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
                              className="rounded-2xl bg-background/80 p-3 text-xs border border-border/30 text-muted-foreground"
                            >
                              <div className="flex justify-between items-center text-foreground font-medium mb-1">
                                <span className="text-[11px]">Chunk #{s.rank || idx + 1}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-mono text-primary">
                                    {(s.similarity_score * 100).toFixed(1)}% match
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyEvidence(s.content, idx)}
                                    className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                                    title="Copy quote"
                                  >
                                    {copiedIndex === idx ? (
                                      <Check className="h-3 w-3 text-primary" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              <p className="text-[12px] text-foreground/90 leading-relaxed italic line-clamp-3">
                                &quot;{s.content}&quot;
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {/* Chatting Loading indicator */}
            {chatting && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pl-2 animate-pulse">
                <span className="h-2 w-2 rounded-full bg-primary" />
                Thinking and searching sources...
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
              className="max-w-3xl mx-auto flex items-center bg-card/90 backdrop-blur-xl border border-border/60 rounded-full shadow-lg p-1.5 focus-within:ring-2 focus-within:ring-primary/20 transition-all"
            >
              <input
                type="text"
                value={inputQuery}
                disabled={chatting || !selectedAssistant}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder={
                  selectedAssistant
                    ? `Message ${selectedAssistant.name}...`
                    : "Configure an assistant first..."
                }
                className="flex-1 bg-transparent px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="submit"
                disabled={!inputQuery.trim() || chatting || !selectedAssistant}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-30 disabled:pointer-events-none hover:opacity-90 transition-opacity shrink-0 mr-1"
                aria-label="Send message"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Right Parameters Drawer/Inspector */}
        {showInspector && selectedAssistant && (
          <aside className="w-72 border-l border-border/40 bg-card/60 backdrop-blur-md p-5 overflow-y-auto space-y-5 animate-in slide-in-from-right-10 duration-200">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Assistant Settings
              </h3>
              <p className="text-xs text-muted-foreground">
                Inference configuration and thresholds
              </p>
            </div>

            <div className="space-y-3 rounded-2xl bg-muted/40 p-4 text-xs">
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
              <div className="rounded-2xl bg-muted/30 p-3 text-xs text-muted-foreground line-clamp-6 leading-relaxed">
                {selectedAssistant.system_instructions || "Default assistant instructions."}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Indexed Sources</span>
                <span className="text-xs text-muted-foreground">{sources.length}</span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {sources.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs">
                    <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate text-foreground font-medium">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <Link href={`/workspaces/${workspaceId}/projects/${projectId}/assistants/${selectedAssistant.id}`}>
                <Button variant="outline" size="sm" className="w-full rounded-xl text-xs font-medium">
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
