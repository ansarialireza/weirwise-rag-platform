"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Assistant, KnowledgeSource, ChatMessage } from "@/types";
import {
  Bot,
  Send,
  Loader2,
  FileText,
  Sliders,
  CheckCircle2,
  ArrowRight,
  Info,
  RefreshCw,
  ChevronDown,
  Layers,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/alert";

export default function DedicatedPlaygroundPage() {
  const params = useParams();
  const router = useRouter();
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

  // Inspector Sidebar toggle
  const [showInspector, setShowInspector] = useState(true);
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
  }, [messages]);

  const handleSelectAssistant = (assistantId: string) => {
    const found = assistants.find((a) => a.id === assistantId);
    if (found) {
      setSelectedAssistant(found);
      setMessages([]);
      setConversationId(undefined);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || chatting || !selectedAssistant) return;

    const userText = inputQuery.trim();
    setInputQuery("");

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      role: "user",
      content: userText,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setChatting(true);

    try {
      const resp = await api.chatWithAssistant(
        selectedAssistant.id,
        userText,
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
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] overflow-hidden bg-background">
      {/* Playground Top Bar */}
      <header className="flex flex-wrap min-h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6 py-2.5 gap-3">
        <div className="flex items-center gap-3 sm:gap-5 min-w-0 flex-1">
          <div className="flex items-center gap-2 shrink-0">
            <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 text-primary">
              <Sliders className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-foreground hidden sm:inline">
              Playground
            </span>
          </div>

          {/* Assistant Selector */}
          {assistants.length > 0 && (
            <div className="flex items-center gap-2 sm:pl-4 sm:border-l sm:border-border min-w-0 flex-1 max-w-xs">
              <span className="text-xs font-semibold text-muted-foreground shrink-0 hidden md:inline">Active:</span>
              <select
                value={selectedAssistant?.id || ""}
                onChange={(e) => handleSelectAssistant(e.target.value)}
                className="h-9 w-full rounded-xl border border-border bg-input px-2.5 sm:px-3.5 text-xs font-semibold text-foreground focus:border-primary focus:outline-none shadow-xs truncate"
              >
                {assistants.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.model})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {selectedAssistant && (
            <Link
              href={`/workspaces/${workspaceId}/projects/${projectId}/assistants/${selectedAssistant.id}`}
              className="hidden lg:inline-flex"
            >
              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs font-semibold">
                Configure &rarr;
              </Button>
            </Link>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMessages([]);
              setConversationId(undefined);
            }}
            disabled={messages.length === 0}
            className="h-8 px-2.5 text-xs font-semibold gap-1.5"
            title="Clear current session"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowInspector(!showInspector)}
            className="h-8 px-2.5 text-xs font-semibold"
          >
            {showInspector ? "Hide Info" : "Parameters"}
          </Button>
        </div>
      </header>

      {/* Main Studio Body: Chat Conversation on Left, Parameters & Sources on Right */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0 min-w-0">
        {/* Main Conversation Stream */}
        <div className="flex flex-1 flex-col bg-background/50 min-w-0">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-8 space-y-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary shadow-sm border border-border">
                  <Bot className="h-7 w-7" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-bold text-foreground">
                    {selectedAssistant ? `Test ${selectedAssistant.name}` : "Interactive Grounding Playground"}
                  </h3>
                  <p className="max-w-md text-sm text-muted-foreground leading-relaxed">
                    Verify retrieval accuracy, model grounding, and cited chunks against project knowledge sources in real time.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 text-xs font-mono text-muted-foreground bg-card border border-border px-4 py-2.5 rounded-xl shadow-xs">
                  <Info className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>Try asking: &quot;What are our core operational guidelines?&quot;</span>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-2xl rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "border border-border bg-card text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* Grounded Sources & Citations Box */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3.5 pt-3 border-t border-border/80 space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 font-mono">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Grounded Evidence ({msg.sources.length})
                        </span>
                        <div className="space-y-2">
                          {msg.sources.map((s, idx) => (
                            <div
                              key={idx}
                              className="rounded-xl border border-border bg-input/60 p-3 text-xs text-muted-foreground font-mono group/item relative"
                            >
                              <div className="flex justify-between items-center text-xs text-foreground font-semibold mb-1">
                                <span>Evidence #{s.rank || idx + 1}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-primary font-bold">
                                    Score: {(s.similarity_score * 100).toFixed(1)}%
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyEvidence(s.content, idx)}
                                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                                    title="Copy cited evidence snippet"
                                  >
                                    {copiedIndex === idx ? (
                                      <Check className="h-3.5 w-3.5 text-primary" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              <p className="line-clamp-2 italic font-sans text-foreground/90 leading-relaxed">
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
            <div ref={messagesEndRef} />
          </div>

          {/* Playground Prompt Input Bar */}
          <div className="border-t border-border bg-card p-4">
            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-3">
              <input
                type="text"
                value={inputQuery}
                disabled={chatting || !selectedAssistant}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder={
                  selectedAssistant
                    ? `Ask ${selectedAssistant.name} a question grounded in knowledge...`
                    : "Create or select an assistant to test..."
                }
                className="flex-1 rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs disabled:opacity-50"
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={!inputQuery.trim() || chatting || !selectedAssistant}
                isLoading={chatting}
                className="h-11 px-5 text-sm font-bold gap-2"
              >
                <Send className="h-4 w-4" /> Send
              </Button>
            </form>
          </div>
        </div>

        {/* Right Inspector Sidebar: Model Parameters & Grounded Sources */}
        {showInspector && selectedAssistant && (
          <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border bg-card/95 lg:bg-card/60 p-4 sm:p-5 overflow-y-auto space-y-4 sm:space-y-5 max-h-[35vh] lg:max-h-none shrink-0 min-w-0">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Active Parameters
              </h3>
              <p className="text-xs text-muted-foreground">
                Inference and threshold parameters configured for this assistant
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-input/40 p-4 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Model</span>
                <span className="font-mono font-semibold text-foreground">{selectedAssistant.model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Temperature</span>
                <span className="font-mono font-semibold text-foreground">{selectedAssistant.temperature}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Similarity Cutoff</span>
                <span className="font-mono font-semibold text-foreground">{selectedAssistant.score_threshold}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Top K Chunks</span>
                <span className="font-mono font-semibold text-foreground">{selectedAssistant.top_k}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={selectedAssistant.status === "published" ? "success" : "outline"} className="text-[11px] px-2 py-0.2">
                  {selectedAssistant.status}
                </Badge>
              </div>
            </div>

            {/* System Prompt Peek */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">System Instructions</span>
              <div className="rounded-xl border border-border bg-input p-3 text-xs text-muted-foreground line-clamp-6 whitespace-pre-wrap font-sans leading-relaxed">
                {selectedAssistant.system_instructions || "Default business assistant persona."}
              </div>
            </div>

            {/* Attached Sources */}
            <div className="space-y-2.5 pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Grounded Knowledge</span>
                <Badge variant="outline" className="text-xs">{sources.length}</Badge>
              </div>

              {sources.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No knowledge sources indexed.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {sources.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2.5 rounded-xl border border-border bg-input/80 px-3 py-2 text-xs text-foreground"
                    >
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="truncate flex-1 text-xs font-medium">{s.name}</span>
                      <span className="text-[11px] text-emerald-500 font-mono font-bold">Active</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
