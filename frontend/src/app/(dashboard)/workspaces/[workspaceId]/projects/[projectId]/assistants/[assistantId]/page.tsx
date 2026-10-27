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
} from "lucide-react";

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

  // Web Widget Deployment Modal
  const [showDeploy, setShowDeploy] = useState(false);
  const [widgetKey, setWidgetKey] = useState<string | null>(null);

  useEffect(() => {
    if (projectId && assistantId) {
      Promise.all([
        api.getAssistants(projectId),
        api.getSources(projectId),
      ]).then(([aList, sList]) => {
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
      }).finally(() => {
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

      const assistantMsg: ChatMessage = {
        id: resp.message_id,
        role: "assistant",
        content: resp.content,
        sources: resp.sources,
        latency_ms: resp.latency_ms,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: Math.random().toString(),
        role: "assistant",
        content: `Error: ${err.message || "Failed to retrieve response from assistant."}`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setChatting(false);
    }
  };

  const handleCreateDeployment = async () => {
    if (!assistant) return;
    try {
      const dep = await api.createDeployment(assistant.id, {
        name: `${assistant.name} Web Widget`,
        deployment_type: "widget",
        allowed_domains: ["*"],
      });
      setWidgetKey(dep.public_key);
    } catch (err: any) {
      alert(err.message || "Deployment failed");
    }
  };

  if (loading || !assistant) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Studio Configuration Panel */}
      <div className="w-96 border-r border-border bg-card/60 flex flex-col overflow-y-auto">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" /> {assistant.name}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground">
                v{assistant.version} • {assistant.status.toUpperCase()}
              </span>
              {publishedSuccess && (
                <span className="flex items-center gap-1 text-[10px] text-primary font-medium">
                  <CheckCircle2 className="h-3 w-3" /> Snapshot Saved
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowDeploy(true);
                handleCreateDeployment();
              }}
              title="Widget Code"
              className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Code2 className="h-4 w-4" />
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="rounded bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {publishing ? "Publishing..." : "Publish"}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {/* Instructions */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">System Persona & Prompt</label>
            <textarea
              rows={6}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          {/* Attached Knowledge Sources */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Grounding Sources</label>
              <span className="text-[10px] text-muted-foreground font-mono">
                {selectedSourceIds.length} attached
              </span>
            </div>

            <div className="space-y-1.5 rounded-md border border-border bg-input/50 p-2">
              {sources.length === 0 ? (
                <div className="text-[11px] text-muted-foreground p-2">
                  No knowledge sources in project.
                </div>
              ) : (
                sources.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 text-xs text-foreground p-1.5 rounded hover:bg-secondary cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSourceIds.includes(s.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSourceIds([...selectedSourceIds, s.id]);
                        } else {
                          setSelectedSourceIds(selectedSourceIds.filter((id) => id !== s.id));
                        }
                      }}
                      className="rounded border-border bg-input text-primary focus:ring-0"
                    />
                    <span className="truncate flex-1">{s.name}</span>
                    <span className="text-[9px] font-mono text-muted-foreground uppercase">
                      {s.status}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Model & Parameters */}
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Sliders className="h-3.5 w-3.5" /> Retrieval & Model Parameters
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">LLM Foundation Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-md border border-border bg-input px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none font-mono"
              >
                <option value="gpt-4o-mini">gpt-4o-mini (Verified RAG default)</option>
                <option value="gpt-4o">gpt-4o</option>
                <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
              </select>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Temperature</span>
                <span className="font-mono">{temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Similarity Threshold</span>
                <span className="font-mono">{scoreThreshold}</span>
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
          </div>
        </div>
      </div>

      {/* Playground Testing View */}
      <div className="flex-1 flex flex-col bg-background overflow-hidden">
        {/* Playground Header */}
        <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/20">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span>Playground Session</span>
            <span>•</span>
            <span className="text-foreground font-medium">{assistant.name}</span>
          </div>
          <button
            onClick={() => setMessages([])}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear History
          </button>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Interactive Testing Playground</h3>
              <p className="text-xs text-muted-foreground max-w-md">
                Send test queries to evaluate response generation and inspect citations retrieved from linked business sources.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 text-xs leading-relaxed ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {m.role === "assistant" && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary flex-shrink-0 font-bold">
                    W
                  </div>
                )}

                <div
                  className={`max-w-2xl rounded-lg p-4 space-y-3 ${
                    m.role === "user"
                      ? "bg-secondary text-foreground"
                      : "bg-card border border-border text-foreground"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>

                  {/* Grounded Citations Drawer */}
                  {m.sources && m.sources.length > 0 && (
                    <div className="border-t border-border pt-3 space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        <span>Retrieved Citations</span>
                        {m.latency_ms && <span>{m.latency_ms} ms</span>}
                      </div>

                      <div className="space-y-1.5">
                        {m.sources.map((c, idx) => (
                          <div
                            key={idx}
                            className="rounded border border-border bg-input/50 p-2 text-[11px] space-y-1 font-mono"
                          >
                            <div className="flex items-center justify-between text-primary">
                              <span className="flex items-center gap-1 font-semibold">
                                <FileText className="h-3 w-3" /> Citation #{c.rank}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                Score: {(c.similarity_score * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="text-foreground/90 font-sans text-xs">
                              {c.content}
                            </div>
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

        {/* Input Bar */}
        <div className="p-4 border-t border-border bg-card/30">
          <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-2">
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask a question grounded in connected knowledge sources..."
              disabled={chatting}
              className="flex-1 rounded-md border border-border bg-input px-4 py-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={chatting || !inputQuery.trim()}
              className="flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {chatting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Deployment Modal */}
      {showDeploy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Embeddable Web Widget</h3>
              <button
                onClick={() => setShowDeploy(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this lightweight embed snippet to any intranet or website to deploy this assistant.
            </p>

            <div className="rounded-md border border-border bg-input p-3 font-mono text-[11px] text-foreground overflow-x-auto">
              {`<script\n  src="https://cdn.weirwise.com/widget.js"\n  data-public-key="${widgetKey || "loading..."}"\n  async\n></script>`}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowDeploy(false)}
                className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
