"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Assistant, KnowledgeSource, ChatMessage } from "@/types";
import {
  Bot,
  Send,
  Loader2,
  FileText,
  Sliders,
  CheckCircle2,
  ExternalLink,
  Code2,
  Layers,
  Sparkles,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Alert } from "@/components/ui/alert";

export default function AssistantStudioPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const assistantId = params.assistantId as string;

  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);

  // Studio Config Form State
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [temperature, setTemperature] = useState(0.2);
  const [scoreThreshold, setScoreThreshold] = useState(0.7);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishedSuccess, setPublishedSuccess] = useState(false);

  // Playground Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [chatting, setChatting] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (projectId && assistantId) {
      Promise.all([
        api.getAssistants(projectId),
        api.getSources(projectId),
      ])
        .then(([aList, sList]) => {
          const found = aList.find((a) => a.id === assistantId);
          if (found) {
            setAssistant(found);
            setInstructions(found.system_instructions || "");
            setModel(found.model);
            setTemperature(found.temperature);
            setScoreThreshold(found.score_threshold);
            setSelectedSourceIds(found.knowledge_source_ids || []);
          }
          setSources(sList);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [projectId, assistantId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handlePublish = async () => {
    if (!assistant) return;
    setPublishing(true);
    try {
      const updated = await api.publishAssistant(assistant.id);
      setAssistant(updated);
      setPublishedSuccess(true);
      setTimeout(() => setPublishedSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || "Publishing failed");
    } finally {
      setPublishing(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || chatting || !assistant) return;

    const userText = inputQuery.trim();
    setInputQuery("");
    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      role: "user",
      content: userText,
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatting(true);

    try {
      const resp = await api.chatWithAssistant(assistant.id, userText, conversationId);

      setConversationId(resp.conversation_id);
      const asstMsg: ChatMessage = {
        id: resp.message_id,
        role: "assistant",
        content: resp.content,
        sources: resp.sources,
      };
      setMessages((prev) => [...prev, asstMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: Math.random().toString(),
        role: "assistant",
        content: `Error generating response: ${err.message || "Request timed out"}`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setChatting(false);
    }
  };

  if (loading || !assistant) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Studio Navigation Bar */}
      <div className="flex h-16 items-center justify-between border-b border-border bg-card px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs shadow-sm">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground">{assistant.name}</h1>
              <Badge variant={assistant.status === "published" ? "success" : "outline"}>
                {assistant.status || "draft"}
              </Badge>
              <Badge variant="outline">v{assistant.version || 1}</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono">{assistant.model}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {publishedSuccess && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
              <CheckCircle2 className="h-4 w-4" /> Snapshot Published!
            </span>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handlePublish}
            isLoading={publishing}
          >
            <Sparkles className="h-3.5 w-3.5" /> Publish Snapshot
          </Button>
        </div>
      </div>

      {/* Main Studio Body: Left Configuration, Right Playground */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Config Panel */}
        <div className="w-80 border-r border-border bg-card/60 p-6 overflow-y-auto space-y-6">
          <div className="space-y-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Assistant Configuration
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Control behavior, knowledge grounding, and model thresholds
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Inference Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                <option value="gpt-4o-mini">GPT-4o Mini (Default)</option>
                <option value="gpt-4o">GPT-4o (High-Precision)</option>
                <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">System Instructions</label>
              <textarea
                rows={5}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full rounded-lg border border-border bg-input p-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                placeholder="Direct assistant persona, citations requirements, and answers style..."
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-foreground">Temperature</span>
                <span className="font-mono text-muted-foreground">{temperature}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-foreground">Similarity Threshold</span>
                <span className="font-mono text-muted-foreground">{scoreThreshold}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            {/* Attached Sources */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Grounded Sources</span>
                <Badge variant="outline">{sources.length}</Badge>
              </div>

              {sources.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
                  No sources indexed. Visit Knowledge Sources to ingest documents.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {sources.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-input/80 px-2.5 py-2 text-xs text-foreground"
                    >
                      <FileText className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      <span className="truncate flex-1">{s.name}</span>
                      <Badge variant="success">Active</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Playground Chat Area */}
        <div className="flex flex-1 flex-col bg-background/50">
          {/* Chat Messages Log */}
          <div className="flex-1 overflow-y-auto p-8 space-y-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-8 space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary shadow-sm">
                  <Bot className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-foreground">Grounding Playground</h3>
                <p className="max-w-md text-xs text-muted-foreground leading-relaxed">
                  Test your assistant against uploaded documents. Ask questions to verify citation
                  accuracy, similarity scores, and synthesized responses.
                </p>
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-card border border-border px-3 py-1.5 rounded-lg">
                  <Info className="h-3.5 w-3.5 text-primary" />
                  <span>Try: &quot;What are the core operating policies?&quot;</span>
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
                    className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed shadow-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "border border-border bg-card text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* Grounded Sources & Citations Box */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3.5 pt-3 border-t border-border/80 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1 font-mono">
                          <CheckCircle2 className="h-3 w-3" /> Grounded Evidence ({msg.sources.length})
                        </span>
                        <div className="space-y-1.5">
                          {msg.sources.map((s, idx) => (
                            <div
                              key={idx}
                              className="rounded-lg border border-border bg-input/50 p-2 text-[11px] text-muted-foreground font-mono"
                            >
                              <div className="flex justify-between text-[10px] text-foreground font-semibold mb-1">
                                <span>Evidence #{s.rank || idx + 1}</span>
                                <span className="text-primary">
                                  Score: {(s.similarity_score * 100).toFixed(1)}%
                                </span>
                              </div>
                              <p className="line-clamp-2 italic font-sans">&quot;{s.content}&quot;</p>
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

          {/* Chat Input Bar */}
          <div className="border-t border-border bg-card p-4">
            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-3">
              <input
                type="text"
                value={inputQuery}
                disabled={chatting}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder="Ask a question about your uploaded business knowledge..."
                className="flex-1 rounded-xl border border-border bg-input px-4 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={!inputQuery.trim() || chatting}
                isLoading={chatting}
              >
                <Send className="h-4 w-4" /> Send
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
