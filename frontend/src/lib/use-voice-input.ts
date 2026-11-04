"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type VoiceInputStatus = "idle" | "requesting" | "listening" | "processing" | "error";

interface UseVoiceInputOptions {
  language?: string;
  onFinalTranscript?: (text: string) => void;
}

const VOICE_SUBPROTOCOL = "wwp-voice";

function describeError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "SecurityError") {
      return "Microphone access was blocked. Allow it in your browser settings and try again.";
    }
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return "No microphone was found. Connect one and try again.";
    }
    if (err.name === "NotReadableError" || err.name === "TrackStartError") {
      return "Your microphone is busy in another app.";
    }
  }
  const status = (err as { status?: number } | null)?.status;
  if (status === 503) {
    return "Voice input isn't available right now.";
  }
  if (status) {
    return "Speech service couldn't be reached. Check your connection and try again.";
  }
  return "Voice input hit a problem. Please try again.";
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function useVoiceInput({ language = "en", onFinalTranscript }: UseVoiceInputOptions = {}) {
  const [status, setStatus] = useState<VoiceInputStatus>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const finalTextRef = useRef("");
  const interimTextRef = useRef("");
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRequestedRef = useRef(false);
  const settledRef = useRef(true);
  const statusRef = useRef<VoiceInputStatus>("idle");
  const onFinalRef = useRef(onFinalTranscript);

  onFinalRef.current = onFinalTranscript;

  const setVoiceStatus = useCallback((next: VoiceInputStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined" &&
      typeof WebSocket !== "undefined";
    setSupported(ok);
  }, []);

  const teardown = useCallback(() => {
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Recorder may already be closing
      }
    }
    recorderRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const socket = wsRef.current;
    if (socket) {
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "stop" }));
        }
        socket.close(1000);
      } catch {
        // Socket is already closed
      }
    }
    wsRef.current = null;

    finalTextRef.current = "";
    interimTextRef.current = "";
    setInterim("");
  }, []);

  const settle = useCallback(
    (notify: boolean) => {
      if (settledRef.current) return;
      settledRef.current = true;

      const text = `${finalTextRef.current} ${interimTextRef.current}`
        .replace(/\s+/g, " ")
        .trim();

      teardown();
      setVoiceStatus("idle");

      if (!notify) return;
      if (text) {
        onFinalRef.current?.(text);
      } else {
        setError("We didn't catch that. Try again and speak a little closer.");
      }
    },
    [teardown, setVoiceStatus]
  );

  useEffect(() => {
    return () => {
      settledRef.current = true;
      teardown();
    };
  }, [teardown]);

  const start = useCallback(async () => {
    if (statusRef.current === "listening" || statusRef.current === "requesting") return;
    if (!supported) {
      setError("Voice input isn't supported in this browser.");
      return;
    }

    setError(null);
    setInterim("");
    finalTextRef.current = "";
    interimTextRef.current = "";
    stopRequestedRef.current = false;
    settledRef.current = false;
    setVoiceStatus("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      setVoiceStatus("error");
      setError(describeError(err));
      settledRef.current = true;
      return;
    }
    streamRef.current = stream;

    let socket: WebSocket;
    try {
      const token = api.getAccessToken();
      const protocols = token ? [VOICE_SUBPROTOCOL, token] : [VOICE_SUBPROTOCOL];
      socket = new WebSocket(api.getVoiceStreamUrl(language), protocols);
    } catch (err) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setVoiceStatus("error");
      setError(describeError(err));
      settledRef.current = true;
      return;
    }
    wsRef.current = socket;

    socket.onopen = () => {
      const mimeType = pickMimeType();
      try {
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };
        recorder.onstop = () => {
          if (stopRequestedRef.current && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "stop" }));
          }
        };
        recorder.start(250);
        recorderRef.current = recorder;
        setVoiceStatus("listening");
      } catch {
        setVoiceStatus("error");
        setError("Couldn't start recording on this device.");
        settle(false);
      }
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "error") {
          setError(payload.message || "Voice input hit a problem. Please try again.");
          setVoiceStatus("error");
          settle(false);
          return;
        }
        if (payload.type === "Metadata") {
          if (stopRequestedRef.current) settle(true);
          return;
        }
        if (payload.type !== "Results") return;
        const transcript: string = payload.channel?.alternatives?.[0]?.transcript || "";
        if (!transcript) return;

        if (payload.is_final) {
          finalTextRef.current = `${finalTextRef.current} ${transcript}`.trim();
          interimTextRef.current = "";
          setInterim("");
        } else {
          interimTextRef.current = transcript;
          setInterim(transcript);
        }
      } catch {
        // Ignore malformed frames
      }
    };

    socket.onerror = () => {
      if (stopRequestedRef.current || settledRef.current) return;
      setError("Speech connection dropped. Check your connection and try again.");
      setVoiceStatus("error");
      settle(false);
    };

    socket.onclose = () => {
      if (settledRef.current) return;
      if (stopRequestedRef.current) {
        settle(true);
        return;
      }
      setError("Speech connection closed unexpectedly.");
      setVoiceStatus("error");
      settle(false);
    };
  }, [language, settle, supported, setVoiceStatus]);

  const stop = useCallback(() => {
    if (statusRef.current !== "listening") return;
    stopRequestedRef.current = true;
    setVoiceStatus("processing");

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Already stopped; send the stop signal directly
        const socket = wsRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "stop" }));
        }
      }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    // Fallback in case the finalize frame never arrives.
    finishTimerRef.current = setTimeout(() => settle(true), 5000);
  }, [settle, setVoiceStatus]);

  const cancel = useCallback(() => {
    settledRef.current = true;
    stopRequestedRef.current = true;
    setError(null);
    teardown();
    setVoiceStatus("idle");
  }, [teardown, setVoiceStatus]);

  return {
    status,
    interim,
    error,
    supported,
    isActive: status === "listening" || status === "requesting" || status === "processing",
    start,
    stop,
    cancel,
    clearError: () => setError(null),
  };
}
