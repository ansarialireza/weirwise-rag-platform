"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { CopilotCitation, CopilotMessage } from "@/types";
import {
  Mic,
  MicOff,
  Send,
  Square,
  Volume2,
  VolumeX,
  X,
  HelpCircle,
  FileText,
  AlertCircle,
  ShieldCheck,
  Check,
  Copy,
} from "lucide-react";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { cn } from "@/lib/utils";

interface CopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUGGESTED_PROMPTS = [
  "How do I create and configure an assistant?",
  "What file types can I upload to a knowledge source?",
  "What is the difference between workspace roles?",
  "Does Weirwise support voice conversation?",
];

export function CopilotModal({ isOpen, onClose }: CopilotModalProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<"en" | "fa">("en");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Load existing conversations if available
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      api
        .getCopilotConversations()
        .then((convs) => {
          if (convs.length > 0 && convs[0].messages.length > 0) {
            setConversationId(convs[0].id);
            setMessages(convs[0].messages);
          }
        })
        .catch(() => {
          // Gracefully ignore error on listing
        });
    }
  }, [isOpen, messages.length]);

  // Stop audio and recording when closing modal
  useEffect(() => {
    if (!isOpen) {
      stopAudioPlayback();
      stopRecording();
    }
  }, [isOpen]);

  const stopAudioPlayback = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    setIsPlayingAudio(false);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;

    setInputQuery("");
    setErrorMessage(null);
    stopAudioPlayback();

    const userMessage: CopilotMessage = {
      id: Math.random().toString(),
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const resp = await api.chatWithCopilot({
        message: trimmed,
        conversation_id: conversationId,
        language: selectedLanguage,
      });

      setConversationId(resp.conversation_id);

      const assistantMessage: CopilotMessage = {
        id: resp.message_id,
        role: "assistant",
        content: resp.content,
        sources: resp.sources,
        is_grounded: resp.is_grounded,
        voice_supported: resp.voice_supported,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // If voice supported and in English, play synthesized voice automatically
      if (resp.voice_supported && selectedLanguage === "en") {
        playTextToSpeech(resp.content, selectedLanguage);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to communicate with Weirwise Copilot.");
    } finally {
      setIsLoading(false);
    }
  };

  const playTextToSpeech = async (text: string, language: string) => {
    stopAudioPlayback();

    if (language.startsWith("fa")) {
      setErrorMessage("Persian voice synthesis is currently unsupported by Deepgram. Text response provided.");
      return;
    }

    try {
      const audioBlob = await api.synthesizeVoice(text, language);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.onplay = () => setIsPlayingAudio(true);
      audio.onended = () => {
        setIsPlayingAudio(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsPlayingAudio(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (err: any) {
      console.warn("Audio playback error:", err);
      // Keep text response intact, just show subtle error
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    setErrorMessage(null);
    stopAudioPlayback();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage("Microphone access is not supported by your browser environment.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined,
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

        if (audioBlob.size === 0) return;

        setIsLoading(true);
        try {
          const sttResult = await api.transcribeVoice(audioBlob, selectedLanguage);
          if (sttResult.transcript.trim()) {
            setInputQuery(sttResult.transcript.trim());
            await handleSendMessage(sttResult.transcript.trim());
          } else {
            setErrorMessage("No speech detected. Please try speaking closer to the microphone.");
          }
        } catch (err: any) {
          setErrorMessage(err.message || "Failed to transcribe speech audio.");
        } finally {
          setIsLoading(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setErrorMessage("Microphone permission was denied. Please allow microphone access in your browser settings to use voice input.");
      } else {
        setErrorMessage(`Microphone error: ${err.message || "Unable to access microphone"}`);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Weirwise Copilot"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative flex flex-col w-full max-w-2xl h-[90vh] max-h-[720px] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <WeirwiseSymbol className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-foreground">
                  Weirwise Copilot
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500 border border-emerald-500/20">
                  <ShieldCheck className="h-3 w-3" /> Official Guide
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Grounded strictly in verified Weirwise product documentation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language toggle: en / fa */}
            <div className="flex items-center rounded-lg border border-border bg-secondary/50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setSelectedLanguage("en")}
                className={cn(
                  "px-2 py-1 rounded-md font-medium transition-colors",
                  selectedLanguage === "en"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setSelectedLanguage("fa")}
                className={cn(
                  "px-2 py-1 rounded-md font-medium transition-colors",
                  selectedLanguage === "fa"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Persian (STT supported, TTS unsupported)"
              >
                FA
              </button>
            </div>

            {/* Audio stop button if playing */}
            {isPlayingAudio && (
              <button
                type="button"
                onClick={stopAudioPlayback}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                title="Stop Audio"
              >
                <VolumeX className="h-3.5 w-3.5" /> Stop
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              aria-label="Close Copilot"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Error banner */}
        {errorMessage && (
          <div className="flex items-center justify-between border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:opacity-75"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Message body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <HelpCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h4 className="text-sm font-bold text-foreground">
                  How can I help you navigate Weirwise?
                </h4>
                <p className="text-xs text-muted-foreground">
                  Ask questions about workspaces, assistants, knowledge ingestion, or voice features.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md pt-2">
                {SUGGESTED_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(prompt)}
                    className="text-left p-3 rounded-xl border border-border bg-card/60 hover:bg-secondary/70 hover:border-primary/40 text-xs text-foreground transition-all duration-150 line-clamp-2"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={cn("flex flex-col gap-1.5", isUser ? "items-end" : "items-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed transition-colors",
                      isUser
                        ? "bg-primary text-primary-foreground font-medium rounded-tr-xs"
                        : "border border-border bg-secondary/40 text-foreground rounded-tl-xs"
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>

                    {/* Citations block for assistant answers */}
                    {!isUser && m.sources && m.sources.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-border/70 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Verified Sources
                          </span>
                          <span>{m.sources.length} document chunk(s)</span>
                        </div>
                        {m.sources.map((s, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-border/80 bg-background/50 p-2 text-[11px] text-muted-foreground"
                          >
                            <span className="font-semibold text-foreground block mb-0.5">
                              {s.title}
                            </span>
                            <span className="line-clamp-2">{s.content}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions under assistant message */}
                  {!isUser && (
                    <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => handleCopy(m.content, m.id)}
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        title="Copy text"
                      >
                        {copiedIndex === m.id ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span>{copiedIndex === m.id ? "Copied" : "Copy"}</span>
                      </button>

                      {m.voice_supported && selectedLanguage === "en" && (
                        <button
                          type="button"
                          onClick={() => playTextToSpeech(m.content, selectedLanguage)}
                          className="flex items-center gap-1 hover:text-foreground transition-colors ml-2"
                          title="Read aloud"
                        >
                          <Volume2 className="h-3 w-3" />
                          <span>Listen</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>
                {isRecording
                  ? "Transcribing voice via Deepgram..."
                  : "Checking official Weirwise documentation..."}
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <footer className="border-t border-border bg-card p-3 sm:p-4 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputQuery);
            }}
            className="flex items-center gap-2"
          >
            {/* Push-to-talk voice recording button */}
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isLoading}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isRecording
                  ? "border-destructive bg-destructive/20 text-destructive animate-pulse"
                  : "border-border bg-secondary/50 text-foreground hover:bg-secondary"
              )}
              title={isRecording ? "Stop recording" : "Hold or click to speak (Deepgram STT)"}
              aria-label={isRecording ? "Stop recording" : "Start voice recording"}
            >
              {isRecording ? <Square className="h-5 w-5 fill-current" /> : <Mic className="h-5 w-5" />}
            </button>

            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder={
                isRecording
                  ? "Listening to your voice..."
                  : "Ask about Weirwise features or documentation..."
              }
              disabled={isLoading || isRecording}
              className="flex-1 h-11 rounded-xl border border-border bg-input px-4 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading || isRecording}
              className="flex h-11 px-4 items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
