"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Send, Bot, User, AlertCircle, FileText } from "lucide-react";
import { WeirwiseMark } from "@/components/ui/weirwise-mark";
import { friendlyErrorMessage } from "@/lib/errors";

interface WidgetConfig {
  name?: string;
  welcome_message?: string;
  placeholder_text?: string;
  primary_color?: string;
}

interface Citation {
  document_name?: string;
  title?: string;
  content: string;
}

export default function AssistantWidgetPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const assistantId = params.assistantId as string;
  const widgetKey = searchParams.get("key") || undefined;

  const [config, setConfig] = useState<WidgetConfig>({});
  const [messages, setMessages] = useState<Array<{ role: string; content: string; citations?: Citation[] }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
  const widgetHeaders: Record<string, string> = widgetKey ? { "X-Widget-Key": widgetKey } : {};

  useEffect(() => {
    const storageKey = `wws_session_${assistantId}`;
    setSessionToken(localStorage.getItem(storageKey));

    fetch(`${apiUrl}/public/assistants/${assistantId}/config`, { headers: widgetHeaders })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            friendlyErrorMessage(data.detail, res.status, "This assistant isn't available right now.")
          );
        }
        return res.json();
      })
      .then((data) => {
        setConfig(data);
        document.title = data.name ? `${data.name} · Weirwise` : "Weirwise Assistant";
        setMessages([
          {
            role: "assistant",
            content: data.welcome_message || "Hello! How can I help you today?",
          },
        ]);
      })
      .catch((err: any) => {
        setError(err.message || "This assistant isn't available right now.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantId, widgetKey]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    setLoading(true);

    try {
      const res = await fetch(`${apiUrl}/public/assistants/${assistantId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...widgetHeaders,
          ...(sessionToken ? { "X-Session-Token": sessionToken } : {}),
        },
        body: JSON.stringify({
          message: userText,
          conversation_id: conversationId,
          session_token: sessionToken,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          friendlyErrorMessage(errData.detail, res.status, "I couldn't answer that just now. Please try again.")
        );
      }

      const data = await res.json();
      if (data.conversation_id) setConversationId(data.conversation_id);
      if (data.session_token && data.session_token !== sessionToken) {
        setSessionToken(data.session_token);
        localStorage.setItem(`wws_session_${assistantId}`, data.session_token);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.content,
          citations: data.sources || [],
        },
      ]);
    } catch (err: any) {
      setError(err.message || "I couldn't answer that just now. Please try again.");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I couldn't answer that just now. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-dvh w-full flex-col bg-background text-foreground font-sans">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <WeirwiseMark className="h-8 w-auto" />
          <div>
            <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
              {config.name || "Weirwise Assistant"}
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            </div>
          </div>
        </div>
      </div>

      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
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
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-accent-strong">
                    <FileText className="h-3 w-3" /> Sources
                  </div>
                  {m.citations.map((c, cIdx) => (
                    <div
                      key={cIdx}
                      className="rounded-lg bg-secondary/50 p-1.5 text-[10px] text-muted-foreground"
                    >
                      {c.document_name || c.title ? (
                        <div className="font-semibold text-foreground truncate mb-0.5">
                          {c.document_name || c.title}
                        </div>
                      ) : null}
                      <div className="line-clamp-2">{c.content}</div>
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
            <span>Looking through your documents…</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive"
          >
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-border bg-card p-3">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={config.placeholder_text || "Ask a question..."}
          aria-label="Message"
          className="max-h-32 min-h-[34px] flex-1 resize-none rounded-xl border border-border bg-input px-3.5 py-2 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          aria-label="Send message"
          className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
