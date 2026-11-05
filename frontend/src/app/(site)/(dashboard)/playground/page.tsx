"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Assistant, ChatMessage, CitationItem, KnowledgeSource } from "@/types";
import {
  AlertCircle,
  ArrowUp,
  Bot,
  Check,
  Copy,
  FileText,
  Mic,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useVoiceConversation } from "@/lib/use-voice-conversation";
import { cn } from "@/lib/utils";

function VoiceBars({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-end gap-0.5", className)} aria-hidden="true">
      {[0, 1, 2, 3].map((bar) => (
        <span
          key={bar}
          className="h-3 w-0.5 origin-bottom animate-voice-bar rounded-full bg-current"
          style={{ animationDelay: `${bar * 0.12}s` }}
        />
      ))}
    </span>
  );
}

function SourceQuote({
  source,
  index,
  onCopy,
  copied,
}: {
  source: CitationItem;
  index: number;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-foreground">
          <FileText className="h-3 w-3 shrink-0 text-accent" />
          <span className="truncate">{source.document_name || `Source ${index + 1}`}</span>
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Copy quote"
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <p className="line-clamp-4 whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
        {source.content}
      </p>
    </div>
  );
}

function PlaygroundPage() {
  const searchParams = useSearchParams();
  const preselectedAssistantId = searchParams.get("assistantId");

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [chatting, setChatting] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [sendError, setSendError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [showInspector, setShowInspector] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const sendMessageRef = useRef<(text: string) => void>(() => {});
  const speakRepliesRef = useRef(speakReplies);
  speakRepliesRef.current = speakReplies;

  const handleBargeIn = useCallback(() => {
    streamAbortRef.current?.abort();
  }, []);

  const voice = useVoiceConversation({
    language: selectedAssistant?.language || "en",
    onUtterance: (text) => sendMessageRef.current(text),
    onBargeIn: handleBargeIn,
  });

  useEffect(() => {
    Promise.all([api.getAssistants(), api.getSources()])
      .then(([aList, sList]) => {
        setAssistants(aList);
        setSources(sList);
        if (aList.length > 0) {
          const found = preselectedAssistantId
            ? aList.find((assistant) => assistant.id === preselectedAssistantId)
            : aList[0];
          setSelectedAssistant(found || aList[0]);
        }
      })
      .catch((err: any) => setLoadError(err.message || "We couldn't open the test assistant. Please try again."))
      .finally(() => setLoading(false));
  }, [preselectedAssistantId]);

  useEffect(() => {
    api
      .getVoiceStatus()
      .then((status) => setVoiceAvailable(status.available))
      .catch(() => setVoiceAvailable(false));
  }, []);

  const stopSpeaking = voice.stopSpeaking;
  const speakText = voice.speak;
  const stopAudio = useCallback(() => {
    stopSpeaking();
    setSpeakingId(null);
  }, [stopSpeaking]);

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  useEffect(() => {
    if (messages.length || chatting) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, chatting]);

  const handleSelectAssistant = (assistantId: string) => {
    const found = assistants.find((assistant) => assistant.id === assistantId);
    if (!found) return;
    voice.stop();
    stopAudio();
    setSelectedAssistant(found);
    setMessages([]);
    setConversationId(undefined);
    setSendError(null);
  };

  const speak = useCallback(
    (text: string, messageId: string) => {
      if (!voiceAvailable || !text.trim()) return;
      setSpeakingId(messageId);
      speakText(text);
    },
    [speakText, voiceAvailable]
  );

  useEffect(() => {
    if (voice.status === "idle" || voice.status === "listening" || voice.status === "error") {
      setSpeakingId(null);
    }
  }, [voice.status]);

  const handleSendMessage = async (
    textOverride?: string,
    options: { fromVoice?: boolean } = {}
  ) => {
    const query = (textOverride ?? inputQuery).trim();
    if (!query || !selectedAssistant) return;

    // A new voice turn always supersedes the previous generation; typed sends
    // simply queue after the in-flight answer.
    if (chatting && !options.fromVoice) return;
    if (chatting && options.fromVoice) {
      streamAbortRef.current?.abort();
    }

    setInputQuery("");
    setSendError(null);
    if (!options.fromVoice) {
      stopAudio();
    }

    const controller = new AbortController();
    streamAbortRef.current = controller;

    const userMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: query,
      created_at: new Date().toISOString(),
    };
    const assistantId = `stream-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant", content: "", created_at: new Date().toISOString() },
    ]);
    setChatting(true);

    let answerText = "";
    let streamedDeltas = false;
    const speakDeltas = speakRepliesRef.current && selectedAssistant.engine_mode !== "search_only";
    if (speakDeltas) setSpeakingId(assistantId);

    try {
      const result = await api.streamAssistantChat(selectedAssistant.id, query, {
        conversationId,
        signal: controller.signal,
        onDelta: (delta) => {
          answerText += delta;
          streamedDeltas = true;
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId ? { ...message, content: answerText } : message
            )
          );
          if (speakDeltas) voice.feedAnswer(delta);
        },
        onDone: (done) => {
          setConversationId(done.conversation_id);
          if (typeof done.content === "string" && done.content) answerText = done.content;
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: answerText,
                    sources: done.sources || [],
                    latency_ms: done.latency_ms,
                  }
                : message
            )
          );
          // Some providers (and the extractive fallback) send the whole answer
          // in `done` with no deltas; speak it instead of staying silent.
          if (speakDeltas && !streamedDeltas && answerText.trim()) {
            voice.feedAnswer(answerText);
          }
        },
      });

      if (result.error) {
        setSendError(result.error);
      }
    } catch (err: any) {
      if (controller.signal.aborted) {
        // Barge-in: the user took the turn; drop an empty placeholder.
        setMessages((prev) =>
          prev.filter((message) => message.id !== assistantId || message.content.trim().length > 0)
        );
      } else {
        setSendError(err.message || "The assistant couldn't respond just now.");
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId && !message.content.trim()
              ? {
                  ...message,
                  content: "I couldn't reach your knowledge just now. Please try again.",
                }
              : message
          )
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        voice.finishAnswer();
      }
      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null;
      }
      setChatting(false);
    }
  };

  sendMessageRef.current = (text: string) => {
    void handleSendMessage(text, { fromVoice: true });
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  const clearConversation = () => {
    streamAbortRef.current?.abort();
    stopAudio();
    setMessages([]);
    setConversationId(undefined);
    setSendError(null);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-[520px]" />
      </div>
    );
  }

  const hasAssistants = assistants.length > 0;
  const isSearchMode = selectedAssistant?.engine_mode === "search_only";
  const attachedSources = sources.filter((source) =>
    selectedAssistant?.knowledge_source_ids?.includes(source.id)
  );

  const promptSuggestions = [
    "What are our core operational guidelines?",
    "Summarize the key policies in our documents",
    "Explain our customer onboarding workflow",
  ];

  const confidence =
    (selectedAssistant?.score_threshold || 0.7) >= 0.85
      ? "Very strict"
      : (selectedAssistant?.score_threshold || 0.7) >= 0.7
        ? "Balanced"
        : "Flexible";
  const contextDepth =
    (selectedAssistant?.top_k || 4) <= 3 ? "Focused" : (selectedAssistant?.top_k || 4) <= 6 ? "Balanced" : "Broad";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Test assistant"
        description="Ask the same questions your customers will — and see the answer and its source."
        actions={
          hasAssistants ? (
            <>
              <div className="w-full sm:w-64">
                <CustomSelect
                  value={selectedAssistant?.id || ""}
                  onChange={handleSelectAssistant}
                  options={assistants.map((assistant) => ({
                    value: assistant.id,
                    label: assistant.name,
                    description:
                      assistant.engine_mode === "search_only" ? "Search only" : "AI answers",
                  }))}
                />
              </div>
              {messages.length > 0 && (
                <Button variant="outline" size="sm" onClick={clearConversation} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  New conversation
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {loadError && <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">{loadError}</div>}

      {!hasAssistants ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-border bg-card px-6 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Bot className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">No assistant to test yet</h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Create an assistant, choose its knowledge, then come back to try real questions.
          </p>
          <Link
            href="/assistants"
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            Create assistant
          </Link>
        </div>
      ) : (
        <div
          className={cn(
            "grid items-start gap-4",
            showInspector ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : "grid-cols-1"
          )}
        >
          <section className="flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:h-[calc(100dvh-15rem)]">
            {/* Chat header */}
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {selectedAssistant?.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {isSearchMode ? "Shows matching passages" : "Writes answers with sources"}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {voiceAvailable && !isSearchMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setSpeakReplies((enabled) => {
                        if (enabled) stopAudio();
                        return !enabled;
                      });
                    }}
                    aria-pressed={speakReplies}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
                      speakReplies
                        ? "border-accent/40 bg-accent-soft text-accent"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    )}
                    title={speakReplies ? "Spoken replies on" : "Spoken replies off"}
                    aria-label={speakReplies ? "Turn spoken replies off" : "Turn spoken replies on"}
                  >
                    {speakReplies ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowInspector((visible) => !visible)}
                  aria-pressed={showInspector}
                  aria-label={showInspector ? "Hide details" : "Show details"}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                    showInspector
                      ? "border-accent/40 bg-accent-soft text-accent"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Details</span>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              className="flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-6"
              role="log"
              aria-live="polite"
              aria-label="Conversation"
            >
              {messages.length === 0 ? (
                <div className="flex h-full min-h-[340px] flex-col items-center justify-center px-2 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    {isSearchMode ? <Search className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
                  </div>
                  <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
                    Ask {selectedAssistant?.name} anything
                  </h2>
                  <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                    {isSearchMode
                      ? "You'll see the exact passages that match your question."
                      : "Answers come only from your knowledge, with the source beside them."}
                  </p>

                  {attachedSources.length > 0 ? (
                    <div className="mt-6 flex w-full max-w-lg flex-col gap-2">
                      {promptSuggestions.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => handleSendMessage(prompt)}
                          className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5 text-start text-[13px] text-foreground transition-colors hover:border-muted-foreground/30 hover:bg-card"
                        >
                          <span>{prompt}</span>
                          <ArrowUp className="h-3.5 w-3.5 shrink-0 rotate-45 text-muted-foreground transition-colors group-hover:text-accent" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground">
                      Add files on the Knowledge page, then come back and ask a real question.
                    </p>
                  )}
                </div>
              ) : (
                messages.map((message) => {
                  const isUser = message.role === "user";
                  const messageSources = message.sources || [];
                  if (!isUser && !message.content && messageSources.length === 0) {
                    return null;
                  }

                  return (
                    <div
                      key={message.id}
                      className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}
                    >
                      {isUser ? (
                        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-ee-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                          {message.content}
                        </div>
                      ) : isSearchMode ? (
                        <div className="w-full max-w-2xl rounded-2xl rounded-es-md border border-border bg-background p-4">
                          <div className="mb-3 flex items-center justify-between gap-3 border-b border-border/60 pb-2.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                              <Search className="h-3.5 w-3.5 text-accent" />
                              Matching passages
                            </span>
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              {messageSources.length} found
                            </span>
                          </div>
                          {messageSources.length > 0 ? (
                            <div className="space-y-2">
                              {messageSources.map((source, index) => (
                                <SourceQuote
                                  key={`${message.id}-${index}`}
                                  source={source}
                                  index={index}
                                  copied={copiedKey === `${message.id}-${index}`}
                                  onCopy={() => handleCopy(source.content, `${message.id}-${index}`)}
                                />
                              ))}
                            </div>
                          ) : (
                            <p className="py-4 text-center text-[13px] text-muted-foreground">
                              No passages matched. Try different words or add more knowledge.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="w-full max-w-2xl rounded-2xl rounded-es-md border border-border bg-background">
                          <div className="whitespace-pre-wrap px-4 py-3.5 text-sm leading-relaxed text-foreground">
                            {message.content}
                          </div>

                          {messageSources.length > 0 && (
                            <div className="border-t border-border/60 px-4 py-3">
                              <details className="group">
                                <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-medium text-muted-foreground">
                                  <span className="inline-flex items-center gap-1.5">
                                    <FileText className="h-3.5 w-3.5 text-accent" />
                                    {messageSources.length} source
                                    {messageSources.length === 1 ? "" : "s"}
                                  </span>
                                  <span className="transition-transform group-open:rotate-180">▾</span>
                                </summary>
                                <div className="mt-2 space-y-2">
                                  {messageSources.map((source, index) => (
                                    <SourceQuote
                                      key={`${message.id}-${index}`}
                                      source={source}
                                      index={index}
                                      copied={copiedKey === `${message.id}-${index}`}
                                      onCopy={() => handleCopy(source.content, `${message.id}-${index}`)}
                                    />
                                  ))}
                                </div>
                              </details>
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-1 border-t border-border/60 px-3 py-1.5">
                            {voiceAvailable && (
                              <button
                                type="button"
                                onClick={() =>
                                  speakingId === message.id
                                    ? stopAudio()
                                    : speak(message.content, message.id)
                                }
                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                aria-label={speakingId === message.id ? "Stop reading" : "Read aloud"}
                                title={speakingId === message.id ? "Stop" : "Read aloud"}
                              >
                                {speakingId === message.id ? (
                                  <Square className="h-3 w-3" />
                                ) : (
                                  <Volume2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleCopy(message.content, message.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label="Copy answer"
                            >
                              {copiedKey === message.id ? (
                                <Check className="h-3.5 w-3.5 text-success" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {chatting &&
                (messages.length === 0 ||
                  messages[messages.length - 1].role !== "assistant" ||
                  !messages[messages.length - 1].content.trim()) && (
                  <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    </span>
                    Reading your knowledge…
                  </div>
                )}

              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-border/70 bg-card p-3 sm:p-4">
              {sendError && (
                <div className="mb-2 flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{sendError}</span>
                </div>
              )}

              {voice.error && (
                <div className="mb-2 flex items-start justify-between gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-[12px] text-warning">
                  <span className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {voice.error}
                  </span>
                  <button
                    type="button"
                    onClick={voice.clearError}
                    className="rounded p-0.5 hover:bg-warning/10"
                    aria-label="Dismiss voice error"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {voice.isActive && (
                <div
                  className={cn(
                    "mb-2 flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[12px]",
                    voice.status === "listening"
                      ? "border-signal/40 bg-signal/10 text-foreground"
                      : "border-border bg-background text-muted-foreground"
                  )}
                  aria-live="polite"
                >
                  {voice.status === "listening" ? (
                    <VoiceBars className="text-foreground" />
                  ) : (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {voice.status === "requesting"
                      ? "Connecting microphone…"
                      : voice.status === "thinking"
                        ? "Thinking…"
                        : voice.status === "speaking"
                          ? "Assistant is speaking — just start talking to interrupt"
                          : voice.interim || "Listening… speak naturally"}
                  </span>
                  <button
                    type="button"
                    onClick={voice.stop}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="End voice conversation"
                    title="End voice conversation"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSendMessage();
                }}
                className={cn(
                  "flex items-end gap-2 rounded-xl border border-border bg-background p-1.5 transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15",
                  !selectedAssistant && "opacity-60"
                )}
              >
                <textarea
                  ref={composerRef}
                  rows={1}
                  value={inputQuery}
                  disabled={chatting || voice.isActive}
                  onChange={(event) => setInputQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={
                    selectedAssistant
                      ? `Message ${selectedAssistant.name}…`
                      : "Choose an assistant to start"
                  }
                  aria-label="Message"
                  className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:cursor-not-allowed"
                />

                {voice.supported && voiceAvailable && (
                  <button
                    type="button"
                    onClick={() => {
                      if (voice.isActive) {
                        voice.stop();
                      } else {
                        setSpeakReplies(true);
                        void voice.start();
                      }
                    }}
                    disabled={voice.status === "requesting"}
                    aria-label={
                      voice.isActive ? "End voice conversation" : "Start voice conversation"
                    }
                    title={
                      voice.isActive
                        ? "End voice conversation"
                        : "Talk to the assistant — replies are spoken and you can interrupt"
                    }
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:opacity-50",
                      voice.isActive
                        ? "border-signal bg-signal text-signal-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {voice.status === "requesting" ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    ) : voice.isActive ? (
                      <Square className="h-3.5 w-3.5" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </button>
                )}

                <button
                  type="submit"
                  disabled={!inputQuery.trim() || chatting || voice.isActive}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-30"
                  aria-label="Send message"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
                <span className="sm:hidden">Tap the arrow to send</span>
                {attachedSources.length > 0 && (
                  <span className="tabular-nums">
                    {attachedSources.length} source{attachedSources.length === 1 ? "" : "s"} connected
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Inspector */}
          {showInspector && selectedAssistant && (
            <aside className="space-y-4 self-start rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Assistant details</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">What this test uses</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInspector(false)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
                  aria-label="Close details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2.5 rounded-xl border border-border bg-background/60 p-3.5 text-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Mode</span>
                  <span className="font-medium text-foreground">
                    {isSearchMode ? "Search only" : "AI answers"}
                  </span>
                </div>
                {!isSearchMode && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Answer style</span>
                    <span className="font-medium text-foreground">{selectedAssistant.model}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Answer confidence</span>
                  <span className="font-medium text-foreground">{confidence}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Context depth</span>
                  <span className="font-medium text-foreground">{contextDepth}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-foreground">Knowledge attached</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {attachedSources.length}
                  </span>
                </div>
                {attachedSources.length > 0 ? (
                  <div className="max-h-44 space-y-1.5 overflow-y-auto">
                    {attachedSources.map((source) => (
                      <div
                        key={source.id}
                        className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-2 text-[12px]"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-accent" />
                        <span className="truncate text-foreground">{source.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">
                    No knowledge attached yet.
                  </p>
                )}
              </div>

              {selectedAssistant.system_instructions && (
                // Collapsed: the rail is for testing answers, and the full text
                // belongs to the assistant settings page below.
                <details className="space-y-1.5 rounded-lg border border-border/70 px-2.5 py-2">
                  <summary className="cursor-pointer text-[13px] font-medium text-foreground">
                    Instructions
                  </summary>
                  <p className="line-clamp-6 pt-1 text-[12px] leading-relaxed text-muted-foreground">
                    {selectedAssistant.system_instructions}
                  </p>
                </details>
              )}

              <Link
                href={`/assistants/${selectedAssistant.id}`}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-[13px] font-medium text-foreground transition-colors hover:bg-muted/70"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Open full settings
              </Link>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

export default function DedicatedPlaygroundPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-[520px]" />
        </div>
      }
    >
      <PlaygroundPage />
    </Suspense>
  );
}
