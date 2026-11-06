"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type VoiceConversationStatus =
  | "idle"
  | "requesting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

interface UseVoiceConversationOptions {
  language?: string;
  /** Called once per finished user utterance. */
  onUtterance?: (text: string) => void;
  /** Called when the user starts talking over the assistant. */
  onBargeIn?: () => void;
}

const VOICE_SUBPROTOCOL = "wwp-voice";
const RECORDER_TIMESLICE_MS = 120;
const KEEPALIVE_MS = 12000;
const MAX_RECONNECTS = 8;

// Energy (RMS of time-domain samples) that counts as the user talking over TTS.
const BARGE_IN_RMS = 0.055;
const BARGE_IN_FRAMES = 4;
const MIN_PLAYBACK_BEFORE_BARGE_IN_MS = 350;
// Backstop for when Deepgram never sends UtteranceEnd: flush a merged
// post-barge-in utterance after this much silence in transcripts.
const MERGE_WINDOW_MS = 8000;
// Give the microphone a moment to go quiet after a question is sent; a
// trailing word would otherwise cancel the answer before it starts.
const THINKING_BARGE_IN_GRACE_MS = 700;

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

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
  if (status === 503) return "Voice input isn't available right now.";
  if (status) return "Speech service couldn't be reached. Check your connection and try again.";
  return "Voice input hit a problem. Please try again.";
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_#`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits streamed answer text into speakable chunks. Sentence boundaries are
 * preferred so the first words can start playing while the model keeps writing.
 */
function splitForSpeech(
  text: string,
  flush: boolean,
  targetChars: number = 160
): { chunks: string[]; rest: string } {
  const chunks: string[] = [];
  let rest = text;

  for (;;) {
    const match = /[.!?…]+["')\]]*(\s+|$)/.exec(rest);
    if (!match) break;
    const cut = match.index + match[0].length;
    const sentence = rest.slice(0, cut).trim();
    if (sentence) chunks.push(sentence);
    rest = rest.slice(cut);
  }

  while (rest.length > targetChars) {
    const window = rest.slice(0, targetChars);
    const breakAt = Math.max(
      window.lastIndexOf(", "),
      window.lastIndexOf("; "),
      window.lastIndexOf(" ")
    );
    const cut = breakAt > targetChars * 0.4 ? breakAt + 1 : targetChars;
    const piece = rest.slice(0, cut).trim();
    if (piece) chunks.push(piece);
    rest = rest.slice(cut);
  }

  if (flush && rest.trim()) {
    chunks.push(rest.trim());
    rest = "";
  }
  return { chunks, rest };
}

interface SpeechQueueItem {
  text: string;
  generation: number;
  task?: Promise<Blob | null>;
  settled?: boolean;
}

// Synthesizing every sentence at once makes the provider queue them and
// delays the first sentence; two look-ahead requests keep the audio coming.
const TTS_PREFETCH_LIMIT = 2;

function beginSynthesis(item: SpeechQueueItem): Promise<Blob | null> {
  if (!item.task) {
    item.task = api
      .synthesizeSpeech(item.text)
      .then((blob) => {
        item.settled = true;
        return blob;
      })
      .catch(() => {
        item.settled = true;
        return null;
      });
  }
  return item.task;
}

export function useVoiceConversation({
  language = "en",
  onUtterance,
  onBargeIn,
}: UseVoiceConversationOptions = {}) {
  const [status, setStatus] = useState<VoiceConversationStatus>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  const statusRef = useRef<VoiceConversationStatus>("idle");
  const activeRef = useRef(false);
  const intentionalCloseRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voicedFramesRef = useRef(0);

  const utteranceRef = useRef("");
  const interimRef = useRef("");
  const lastDispatchAtRef = useRef(0);
  const mergeUtteranceRef = useRef(false);
  const mergeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const playingRef = useRef(false);
  const playbackStartedRef = useRef(0);
  const ttsQueueRef = useRef<SpeechQueueItem[]>([]);
  const speechGenerationRef = useRef(0);
  const pumpingRef = useRef(false);
  const currentResolveRef = useRef<(() => void) | null>(null);
  const answerBufferRef = useRef("");

  const onUtteranceRef = useRef(onUtterance);
  const onBargeInRef = useRef(onBargeIn);
  onUtteranceRef.current = onUtterance;
  onBargeInRef.current = onBargeIn;

  const setVoiceStatus = useCallback((next: VoiceConversationStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined" &&
      typeof WebSocket !== "undefined" &&
      Boolean(window.AudioContext);
    setSupported(ok);
  }, []);

  const stopRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Recorder already closing
      }
    }
  }, []);

  const stopKeepalive = useCallback(() => {
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    speechGenerationRef.current += 1;
    ttsQueueRef.current = [];
    answerBufferRef.current = "";
    currentResolveRef.current?.();
    currentResolveRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // Audio element may not have a source yet
      }
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    playingRef.current = false;
    if (activeRef.current && statusRef.current === "speaking") {
      setVoiceStatus("listening");
    } else if (!activeRef.current && statusRef.current === "speaking") {
      setVoiceStatus("idle");
    }
  }, [setVoiceStatus]);

  const ensureAudioElement = useCallback((): HTMLAudioElement | null => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audioRef.current = audio;
    }
    return audioRef.current;
  }, []);

  const unlockAudio = useCallback(() => {
    const audio = ensureAudioElement();
    if (!audio) return;
    // Playing a zero-length clip inside the user gesture unlocks later
    // programmatic playback on stricter mobile browsers.
    try {
      audio.src = SILENT_WAV;
      void audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => undefined);
    } catch {
      // Ignore unlock failures
    }
  }, [ensureAudioElement]);

  const primeSpeechQueue = useCallback(() => {
    let inFlight = 0;
    for (const item of ttsQueueRef.current) {
      if (item.task && !item.settled) inFlight += 1;
    }
    for (const item of ttsQueueRef.current) {
      if (inFlight >= TTS_PREFETCH_LIMIT) break;
      if (!item.task) {
        beginSynthesis(item);
        inFlight += 1;
      }
    }
  }, []);

  const pumpSpeech = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    try {
      while (ttsQueueRef.current.length) {
        const item = ttsQueueRef.current.shift();
        if (!item || item.generation !== speechGenerationRef.current) continue;

        const blob = await beginSynthesis(item);
        if (item.generation !== speechGenerationRef.current) continue;
        if (!blob) continue;

        const audio = ensureAudioElement();
        if (!audio) break;

        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        audio.src = url;
        audioUrlRef.current = url;
        playbackStartedRef.current = Date.now();

        try {
          await audio.play();
        } catch {
          URL.revokeObjectURL(url);
          audioUrlRef.current = null;
          continue;
        }
        playingRef.current = true;
        setVoiceStatus("speaking");
        primeSpeechQueue();

        await new Promise<void>((resolve) => {
          currentResolveRef.current = resolve;
          const finish = () => {
            audio.onended = null;
            audio.onerror = null;
            currentResolveRef.current = null;
            resolve();
          };
          audio.onended = finish;
          audio.onerror = finish;
        });

        if (item.generation !== speechGenerationRef.current) break;
        playingRef.current = false;
      }
    } finally {
      pumpingRef.current = false;
      if (activeRef.current && statusRef.current === "speaking") {
        setVoiceStatus("listening");
      } else if (!activeRef.current && statusRef.current === "speaking") {
        setVoiceStatus("idle");
      }
    }
  }, [ensureAudioElement, primeSpeechQueue, setVoiceStatus]);

  const enqueueSpeech = useCallback(
    (text: string) => {
      const cleaned = cleanForSpeech(text);
      if (!cleaned) return;
      ttsQueueRef.current.push({
        text: cleaned,
        generation: speechGenerationRef.current,
      });
      primeSpeechQueue();
      void pumpSpeech();
    },
    [primeSpeechQueue, pumpSpeech]
  );

  const speak = useCallback(
    (text: string) => {
      unlockAudio();
      stopSpeaking();
      speechGenerationRef.current += 1;
      const { chunks } = splitForSpeech(text, true);
      chunks.forEach(enqueueSpeech);
    },
    [enqueueSpeech, stopSpeaking, unlockAudio]
  );

  const feedAnswer = useCallback(
    (delta: string) => {
      answerBufferRef.current += delta;
      // Start the first synthesis earlier (short chunk) so audio begins while
      // the model is still streaming; later chunks keep fuller sentences.
      const isOpeningChunk = ttsQueueRef.current.length === 0 && !playingRef.current;
      const { chunks, rest } = splitForSpeech(answerBufferRef.current, false, isOpeningChunk ? 96 : 160);
      answerBufferRef.current = rest;
      chunks.forEach(enqueueSpeech);
    },
    [enqueueSpeech]
  );

  const finishAnswer = useCallback(() => {
    const remainder = answerBufferRef.current.trim();
    answerBufferRef.current = "";
    if (remainder) enqueueSpeech(remainder);
    if (activeRef.current && statusRef.current === "thinking") {
      setVoiceStatus("listening");
    }
  }, [enqueueSpeech, setVoiceStatus]);

  const sendJson = useCallback((payload: Record<string, unknown>) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(payload));
      } catch {
        // Socket closed mid-send
      }
    }
  }, []);

  const flushUtterance = useCallback(() => {
    mergeUtteranceRef.current = false;
    if (mergeTimerRef.current) {
      clearTimeout(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }
    const text = utteranceRef.current.trim();
    utteranceRef.current = "";
    if (text.length < 2) return;
    setVoiceStatus("thinking");
    lastDispatchAtRef.current = Date.now();
    onUtteranceRef.current?.(text);
  }, [setVoiceStatus]);

  const armMergeTimer = useCallback(() => {
    if (mergeTimerRef.current) clearTimeout(mergeTimerRef.current);
    mergeTimerRef.current = setTimeout(() => flushUtterance(), MERGE_WINDOW_MS);
  }, [flushUtterance]);

  const interrupt = useCallback(() => {
    stopSpeaking();
    if (!activeRef.current) return;
    utteranceRef.current = "";
    interimRef.current = "";
    setInterim("");
    // Deepgram flushes the current sentence when we send Finalize. The rest
    // of what the user is saying arrives as further segments; merge them and
    // send one message instead of a broken first half.
    mergeUtteranceRef.current = true;
    armMergeTimer();
    sendJson({ type: "finalize" });
    setVoiceStatus("listening");
    onBargeInRef.current?.();
  }, [armMergeTimer, sendJson, setVoiceStatus, stopSpeaking]);

  const noteBargeInEnergy = useCallback(() => {
    if (!activeRef.current) return;
    if (
      statusRef.current === "thinking" &&
      Date.now() - lastDispatchAtRef.current < THINKING_BARGE_IN_GRACE_MS
    ) {
      voicedFramesRef.current = 0;
      return;
    }
    const audible = playingRef.current || statusRef.current === "thinking";
    if (!audible) {
      voicedFramesRef.current = 0;
      return;
    }
    const analyser = analyserRef.current;
    const data = analyserDataRef.current;
    if (!analyser || !data) return;
    if (playingRef.current && Date.now() - playbackStartedRef.current < MIN_PLAYBACK_BEFORE_BARGE_IN_MS) {
      return;
    }

    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const value = (data[i] - 128) / 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / data.length);
    if (rms >= BARGE_IN_RMS) {
      voicedFramesRef.current += 1;
      if (voicedFramesRef.current >= BARGE_IN_FRAMES) {
        voicedFramesRef.current = 0;
        interrupt();
      }
    } else {
      voicedFramesRef.current = 0;
    }
  }, [interrupt]);

  const startAnalyser = useCallback(
    (stream: MediaStream) => {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const context = new AudioCtx();
        void context.resume();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        audioContextRef.current = context;
        analyserRef.current = analyser;
        analyserDataRef.current = new Uint8Array(analyser.fftSize);
        if (vadTimerRef.current) clearInterval(vadTimerRef.current);
        vadTimerRef.current = setInterval(noteBargeInEnergy, 60);
      } catch {
        // Barge-in detection degrades gracefully without an analyser
      }
    },
    [noteBargeInEnergy]
  );

  const handleTranscript = useCallback(
    (payload: any) => {
      if (payload.type === "error") {
        setError(payload.message || "Voice input hit a problem. Please try again.");
        return;
      }
      if (payload.type === "UtteranceEnd") {
        // Deepgram may end an utterance without a speech_final flag; flush
        // anything accumulated so the question is not lost.
        flushUtterance();
        return;
      }
      if (payload.type !== "Results") return;

      const transcript: string = payload.channel?.alternatives?.[0]?.transcript || "";
      if (!transcript) return;

      if (!payload.is_final) {
        if (statusRef.current === "listening") {
          interimRef.current = transcript;
          setInterim(transcript);
        }
        return;
      }

      interimRef.current = "";
      setInterim("");

      // While the assistant is talking the microphone still hears it; never
      // turn that echo into a user message.
      if (playingRef.current || statusRef.current === "speaking") return;

      utteranceRef.current = `${utteranceRef.current} ${transcript}`.replace(/\s+/g, " ").trim();
      // After a barge-in, wait for UtteranceEnd so the sentence that Finalize
      // split in two is sent as one message.
      if (mergeUtteranceRef.current) {
        armMergeTimer();
        return;
      }
      if (!payload.speech_final) return;

      flushUtterance();
    },
    [armMergeTimer, flushUtterance]
  );

  const startRecorder = useCallback(
    (stream: MediaStream, socket: WebSocket) => {
      stopRecorder();
      const mimeType = pickMimeType();
      try {
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };
        recorder.start(RECORDER_TIMESLICE_MS);
        recorderRef.current = recorder;
      } catch {
        setError("Couldn't start recording on this device.");
        setVoiceStatus("error");
        activeRef.current = false;
      }
    },
    [setVoiceStatus, stopRecorder]
  );

  const teardown = useCallback(() => {
    activeRef.current = false;
    intentionalCloseRef.current = true;
    stopKeepalive();
    stopRecorder();
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    analyserRef.current = null;
    analyserDataRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }

    const socket = wsRef.current;
    wsRef.current = null;
    if (socket) {
      try {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "stop" }));
        socket.close(1000);
      } catch {
        // Socket already closing
      }
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    speechGenerationRef.current += 1;
    ttsQueueRef.current = [];
    answerBufferRef.current = "";
    currentResolveRef.current?.();
    currentResolveRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
      } catch {
        // Ignore
      }
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    playingRef.current = false;

    utteranceRef.current = "";
    interimRef.current = "";
    mergeUtteranceRef.current = false;
    if (mergeTimerRef.current) {
      clearTimeout(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }
    setInterim("");
  }, [stopKeepalive, stopRecorder]);

  const connectSocket = useCallback(
    (stream: MediaStream) => {
      let socket: WebSocket;
      try {
        const token = api.getAccessToken();
        const protocols = token ? [VOICE_SUBPROTOCOL, token] : [VOICE_SUBPROTOCOL];
        socket = new WebSocket(api.getVoiceStreamUrl(language), protocols);
      } catch (err) {
        setVoiceStatus("error");
        setError(describeError(err));
        return;
      }

      wsRef.current = socket;
      intentionalCloseRef.current = false;

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setError(null);
        startRecorder(stream, socket);
        if (activeRef.current) setVoiceStatus("listening");
        stopKeepalive();
        keepaliveRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            try {
              socket.send(JSON.stringify({ type: "keepalive" }));
            } catch {
              // Ignore
            }
          }
        }, KEEPALIVE_MS);
      };

      socket.onmessage = (event) => {
        try {
          handleTranscript(JSON.parse(event.data));
        } catch {
          // Ignore malformed frames
        }
      };

      socket.onclose = () => {
        stopKeepalive();
        if (!activeRef.current || intentionalCloseRef.current) return;
        if (reconnectAttemptsRef.current >= MAX_RECONNECTS) {
          setError("Speech connection was lost. Reopen the microphone to continue.");
          setVoiceStatus("error");
          teardown();
          return;
        }
        reconnectAttemptsRef.current += 1;
        setError("Reconnecting to speech service…");
        const delay = Math.min(500 * 2 ** (reconnectAttemptsRef.current - 1), 4000);
        reconnectTimerRef.current = setTimeout(() => {
          if (activeRef.current) connectSocket(stream);
        }, delay);
      };
    },
    [handleTranscript, language, setVoiceStatus, startRecorder, stopKeepalive, teardown]
  );

  const start = useCallback(async () => {
    if (activeRef.current || statusRef.current === "requesting") return;
    if (!supported) {
      setError("Voice conversation isn't supported in this browser.");
      return;
    }

    setError(null);
    setInterim("");
    utteranceRef.current = "";
    interimRef.current = "";
    mergeUtteranceRef.current = false;
    if (mergeTimerRef.current) {
      clearTimeout(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    intentionalCloseRef.current = false;
    setVoiceStatus("requesting");
    unlockAudio();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (err) {
      setVoiceStatus("error");
      setError(describeError(err));
      return;
    }

    streamRef.current = stream;
    activeRef.current = true;
    startAnalyser(stream);
    connectSocket(stream);
  }, [connectSocket, setVoiceStatus, startAnalyser, supported, unlockAudio]);

  const stop = useCallback(() => {
    teardown();
    setError(null);
    setVoiceStatus("idle");
  }, [setVoiceStatus, teardown]);

  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  return {
    status,
    interim,
    error,
    supported,
    isActive: status === "requesting" || status === "listening" || status === "thinking" || status === "speaking",
    isBusy: status === "thinking" || status === "speaking",
    start,
    stop,
    interrupt,
    speak,
    feedAnswer,
    finishAnswer,
    stopSpeaking,
    clearError: () => setError(null),
  };
}
