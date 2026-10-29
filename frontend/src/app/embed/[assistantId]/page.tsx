"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Send, Bot, User, Sparkles, AlertCircle, FileText } from "lucide-react";

export default function AssistantWidgetPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const assistantId = params.assistantId as string;
  const publicKey = searchParams.get("key");

  const [messages, setMessages] = useState<Array<{ role: string; content: string; citations?: any[] }>>([
    {
      role: "assistant",
      content: "Hello! I am your AI assistant grounded in verified documentation. How can I assist you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    setLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
      const res = await fetch(`${apiUrl}/assistants/${assistantId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(publicKey ? { "X-Widget-Key": publicKey } : {}),
        },
        body: JSON.stringify({
          message: userText,
          conversation_id: conversationId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Request failed with status ${res.status}`);
      }

      const data = await res.json();
      if (data.conversation_id) setConversationId(data.conversation_id);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.content,
          citations: data.citations || [],
        },
      ]);
    } catch (err: any) {
      setError(err.message || "Failed to deliver message.");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an issue connecting to the knowledge base service.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground font-sans">
      {/* Widget Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-foreground">Weirwise Assistant</div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Grounded Knowledge Mode</span>
            </div>
          </div>
        </div>
      </div>

      {/* Message stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex gap-3 text-xs ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {m.role === "assistant" && (
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-secondary text-primary mt-0.5">
                <Bot className="h-3.5 w-3.5" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed shadow-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-xs"
                  : "bg-card border border-border text-foreground rounded-bl-xs"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>

              {m.citations && m.citations.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-border/50 space-y-1.5">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-primary">
                    <FileText className="h-3 w-3" /> Grounded Citations ({m.citations.length})
                  </div>
                  {m.citations.map((c: any, cIdx: number) => (
                    <div
                      key={cIdx}
                      className="rounded-lg bg-secondary/50 p-1.5 text-[10px] text-muted-foreground"
                    >
                      <div className="font-semibold text-foreground truncate">
                        Chunk #{c.chunk_id?.slice(0, 8)} (Score: {Math.round((c.similarity_score || 0) * 100)}%)
                      </div>
                      <div className="line-clamp-2 mt-0.5">{c.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {m.role === "user" && (
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary/20 text-primary mt-0.5">
                <User className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 items-center text-xs text-muted-foreground italic pl-8">
            <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
            <span>Searching grounded knowledge & synthesizing response...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Input box */}
      <form onSubmit={handleSubmit} className="border-t border-border bg-card p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this knowledge base..."
          className="flex-1 rounded-xl border border-border bg-input px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
