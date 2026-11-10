"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Send, Bot, User, AlertCircle, PhoneCall, Check, X } from "lucide-react";
import { WeirwiseMark } from "@/components/ui/weirwise-mark";
import { SourceReferences } from "@/components/assistant/source-references";
import { SourcesToggle } from "@/components/assistant/sources-toggle";
import { readSourcePreference, writeSourcePreference } from "@/lib/source-preference";
import { friendlyErrorMessage } from "@/lib/errors";
import type { CitationItem } from "@/types";

interface WidgetConfig {
  name?: string;
  welcome_message?: string;
  placeholder_text?: string;
  primary_color?: string;
  engine_mode?: string;
  show_sources?: boolean;
}

/* This surface answers in English like the rest of the widget; its greeting, placeholder
   and errors are already server- or literal-provided, not dictionary keys. */
const sourceLabels = {
  sourceFallback: (index: number) => `Source ${index + 1}`,
  copyQuote: "Copy text",
  copied: "Copied",
};

export default function AssistantWidgetPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const assistantId = params.assistantId as string;
  const widgetKey = searchParams.get("key") || undefined;

  const [config, setConfig] = useState<WidgetConfig>({});
  const [messages, setMessages] = useState<Array<{ role: string; content: string; citations?: CitationItem[] }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // A published reader's own choice, remembered on their device per assistant. It can
  // silence sources; it can never reveal what the publisher did not enable.
  const [sourcesOn, setSourcesOn] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Human Handoff & Lead Capture State
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [handoffReason, setHandoffReason] = useState("");
  const [submittingHandoff, setSubmittingHandoff] = useState(false);
  const [handoffSuccess, setHandoffSuccess] = useState(false);

  const handleRequestHandoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conversationId) {
      setError("Please send a message before requesting human assistance.");
      return;
    }
    setSubmittingHandoff(true);
    try {
      const res = await fetch(`${apiUrl}/public/conversations/${conversationId}/handoff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...widgetHeaders,
          ...(sessionToken ? { "X-Session-Token": sessionToken } : {}),
        },
        body: JSON.stringify({
          customer_name: leadName.trim() || undefined,
          customer_email: leadEmail.trim() || undefined,
          reason: handoffReason.trim() || "Customer requested human operator support.",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Could not submit support request.");
      }

      setHandoffSuccess(true);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Thank you. A team member has been notified and will review your conversation.",
        },
      ]);
      setTimeout(() => {
        setShowHandoffModal(false);
        setHandoffSuccess(false);
        setHandoffReason("");
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to submit handoff request.");
    } finally {
      setSubmittingHandoff(false);
    }
  };
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
        const publisherAllows = data.engine_mode === "search_only" && data.show_sources !== false;
        setSourcesOn(publisherAllows && readSourcePreference(assistantId, true));
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHandoffModal(true)}
            title="Request human assistance"
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PhoneCall className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Human Help</span>
          </button>

          {/* Only a published Search Assistant that ships with sources gets this control;
              every other assistant never learns the word exists. */}
          {config.engine_mode === "search_only" && config.show_sources !== false && (
            <SourcesToggle
              enabled={sourcesOn}
              onChange={(enabled) => {
                setSourcesOn(enabled);
                writeSourcePreference(assistantId, enabled);
              }}
              label="Sources"
            />
          )}
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
              {/* With the list in view, the count is a caption rather than a second
                  sentence the reader has already seen drawn. */}
              {sourcesOn && m.citations && m.citations.length > 0 ? (
                <>
                  <p className="text-[11px] font-medium text-muted-foreground">{m.content}</p>
                  <SourceReferences
                    sources={m.citations}
                    labels={sourceLabels}
                    className="mt-1.5 border-0"
                  />
                </>
              ) : (
                <div className="whitespace-pre-wrap">{m.content}</div>
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
          <div className="flex gap-2 items-center text-xs text-muted-foreground italic ps-8">
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
          className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>

      {/* Human Handoff / Lead Capture Modal */}
      {showHandoffModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="handoff-dialog-title"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in-opacity"
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <h3 id="handoff-dialog-title" className="text-sm font-semibold text-foreground">Request Human Support</h3>
              <button
                type="button"
                onClick={() => setShowHandoffModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {handoffSuccess ? (
              <div className="py-6 text-center text-xs text-foreground space-y-2">
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-success/20 text-success">
                  <Check className="h-4 w-4" />
                </div>
                <p className="font-medium">Request Received</p>
                <p className="text-muted-foreground">Our operator team will follow up via email shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleRequestHandoff} className="mt-4 space-y-3 text-xs">
                <div>
                  <label htmlFor="lead-name" className="block font-medium text-foreground mb-1">Your Name</label>
                  <input
                    id="lead-name"
                    type="text"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="w-full rounded-lg border border-border bg-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label htmlFor="lead-email" className="block font-medium text-foreground mb-1">Email Address (Optional)</label>
                  <input
                    id="lead-email"
                    type="email"
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full rounded-lg border border-border bg-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label htmlFor="lead-reason" className="block font-medium text-foreground mb-1">What can we help you with?</label>
                  <textarea
                    id="lead-reason"
                    rows={3}
                    value={handoffReason}
                    onChange={(e) => setHandoffReason(e.target.value)}
                    placeholder="Briefly describe what you need assistance on..."
                    className="w-full rounded-lg border border-border bg-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                  <button
                    type="button"
                    onClick={() => setShowHandoffModal(false)}
                    className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingHandoff}
                    className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {submittingHandoff ? "Sending…" : "Submit Request"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
