# Voice Latency Report

Date: 2026-11-04
Environment: local Platform API `127.0.0.1:8010`, Next.js `127.0.0.1:3000`, real Deepgram STT/TTS over the public network, real assistant and handbook document.

## Architecture

```
Browser microphone
  └─ MediaRecorder / AudioWorklet -> PCM16 16 kHz frames
       └─ WebSocket /api/v1/voice/stream (subprotocol: wwp-voice + access JWT)
            └─ Platform relay (auth, origin check, credential routing, health recording)
                 └─ Deepgram live STT (interim + is_final + speech_final)
                      └─ final transcript -> POST /assistants/{id}/chat/stream (SSE)
                           └─ grounded answer + citations
                                └─ sentence chunking -> POST /voice/speak
                                     └─ Deepgram TTS (real credential, pool-aware)
                                          └─ audio bytes -> browser playback
```

Key implementation properties verified in code and live runs:

- WebSocket auth comes from the HttpOnly `access_token` cookie or the `wwp-voice` subprotocol token; no token is placed in the URL.
- Origin is checked before upgrade; unauthenticated upgrades are rejected before accept.
- Deepgram credentials are resolved from an admin-managed pool when present, otherwise from the configured environment key. Failures are recorded against the routed credential; successes now update routing events and health timestamps.
- TTS playback is chunked per sentence. Starting to speak while the assistant is talking pauses playback (barge-in) and cancels pending TTS where applicable.

## Measured results

Instrumented browser session: Chrome with a fake microphone playing a synthesized 16 kHz WAV of a support question. Timestamps captured from Deepgram control frames, network request/response events, and `HTMLMediaElement` playback events (n = 1 turn for the full E2E chain; stage timings from the same run).

| # | Stage | Measurement | Value |
|---|---|---|---:|
| 1 | Speech onset → Deepgram `SpeechStarted` | server event | 0 ms reference (arrives with audio) |
| 2 | Speech onset → first interim hypothesis | `SpeechStarted` → first `Results` | **934 ms** |
| 3 | Speech onset → final transcript | `SpeechStarted` → `is_final` | **1763 ms** |
| 4 | Last word → `UtteranceEnd` (endpointing) | `last_word_end` → event | **768 ms** |
| 5 | Utterance end → assistant chat request | `UtteranceEnd` → `/chat/stream` request | **0 ms** |
| 6 | Chat request → first SSE bytes | request → first byte | **266 ms** |
| 7 | Utterance end → first TTS request | `UtteranceEnd` → `/voice/speak` | **317 ms** |
| 8 | TTS request → TTS first byte | request → response headers | **933–1029 ms** (three sentence chunks) |
| 9 | TTS first byte → playback start | headers → `media_play` | **337 ms** |
| 10 | **End-to-end: end of user speech → assistant audio** | `UtteranceEnd` → first `media_play` | **1683 ms** |

Prior runs with the same harness produced 2.59 s for the same chain when TTS was serialized behind a larger answer; the 1.68 s result reflects sentence-chunked TTS starting as soon as the first sentence is available.

### Barge-in

In an earlier multi-turn run, assistant audio was playing when user speech was detected. Playback paused after **142 ms** and **178 ms** in two measured events. No full assistant utterance was allowed to finish after the interruption, confirming that playback interruption is wired to `SpeechStarted`, not merely to a UI state change.

### TTS relay

`POST /api/v1/voice/speak` with a real Deepgram credential returned audio with first-byte latency of 933–1029 ms and complete WAV/Opus payloads (7.9–8.0 KB for a short sentence in the admin live suite). The endpoint records a success routing event for the selected credential.

## Functional checks

| Check | Result | Evidence |
|---|---|---|
| Unauthenticated WebSocket upgrade | Rejected (HTTP 403 before accept) | live probe |
| Expired/invalid JWT on WebSocket | Rejected | JWT tamper probes |
| Streaming transcription includes interim and final hypotheses | Pass | `Results` frames with `is_final` transitions |
| Final transcript matched spoken question | Pass | “Is the refund window for customers?” |
| Grounded assistant answer with citations | Pass | SSE `meta` + `done` with 2 sources; answer cites handbook |
| TTS playback produced audible media events | Pass | `audio_playing` / `media_play` events |
| Multi-turn without reconnecting | Pass | 2 chat streams in one 44 s session |
| Barge-in pauses assistant audio | Pass | 142 ms / 178 ms pause after `SpeechStarted` |
| No token in URL | Pass | code inspection + WebSocket URL has only `language` |
| Unauthorized origin | Rejected | origin allow-list check |

## Not verified in this environment

- Native Persian speech recognition. The `language` query parameter is relayed to Deepgram, but no validated Persian audio fixture was available; no claim of Persian accuracy is made.
- Physical microphone gain, acoustic echo cancellation with speaker playback, Bluetooth latency, and mobile Safari behaviour.
- Packet-loss/reconnect under real network impairment. The harness supports CDP offline emulation, but no reconnect assertion was completed for this report.
- Microphone permission-denied UI. Code paths exist for capture failure, but the browser harness grants permission and does not exercise the denied path.
- Background noise and long silence beyond Deepgram's own endpointing; the synthesized fixture contains clean speech and digital silence.

## Limitations

- Latency numbers are from a single local machine; Deepgram network time varies by region and time of day.
- The assistant used the environment's pseudo-embedding fallback because Jina returns HTTP 451, so the answer text is extractive rather than model-generated. TTFT therefore measures retrieval + SSE framing, not a paid LLM's token generation.
- The browser used Chrome's fake audio device; playback events measure browser-side scheduling, not speaker output.
