# Weirwise Voice Performance Report

Date: 2026-11-05
Scope: browser capture → Platform WebSocket relay → Deepgram STT → grounded chat → sentence-chunked TTS → playback.
Environment: Platform `127.0.0.1:8010`, Next.js `127.0.0.1:3000`, real Deepgram STT/TTS over the public network, real assistant and handbook document, Chrome with a synthesized 16 kHz WAV into a fake microphone.

The timing measurements below are the recorded single-turn browser run from 2026-11-04. The TTS warm-up fix (`0194339`) landed on 2026-11-05 and has **not** been re-timed end to end; this report does not claim a latency improvement from it.

---

## 1. Chain

```
Microphone (MediaRecorder / AudioWorklet, PCM16 16 kHz)
  └─ WS /api/v1/voice/stream  (subprotocol wwp-voice + JWT)
       ├─ Platform relay: origin check, JWT check, credential routing, health recording
       ├─ Deepgram live STT (interim, is_final, UtteranceEnd)
       │    └─ final transcript → POST /assistants/{id}/chat/stream (SSE)
       │         └─ grounded answer + citations
       │              └─ sentence chunking → POST /voice/speak
       │                   └─ Deepgram TTS (pooled client) → browser playback
       └─ SpeechStarted → barge-in: pause playback, cancel pending TTS
```

Security properties verified: the WebSocket rejects unauthenticated upgrades before accept, the token is not placed in the URL, and a disallowed origin is rejected at the handshake. Provider keys never reach the browser; voice and TTS are relayed server-side.

## 2. Measured stage timings

One full turn; stage timings from the same run (`n = 1` for the complete chain, three TTS sentence chunks).

| # | Stage | Measurement | Value |
|---|---|---|---:|
| 1 | Speech onset → Deepgram `SpeechStarted` | server event | 0 ms reference |
| 2 | Speech onset → first interim hypothesis | `SpeechStarted` → first `Results` | 934 ms |
| 3 | Speech onset → final transcript | `SpeechStarted` → `is_final` | 1,763 ms |
| 4 | Last word → `UtteranceEnd` | endpointing | 768 ms |
| 5 | Utterance end → chat request | `UtteranceEnd` → `/chat/stream` | 0 ms |
| 6 | Chat request → first SSE byte | request → first byte | 266 ms |
| 7 | Utterance end → first TTS request | `UtteranceEnd` → `/voice/speak` | 317 ms |
| 8 | TTS request → first audio byte | response headers (3 chunks) | 933–1,029 ms |
| 9 | TTS first byte → playback start | headers → `media_play` | 337 ms |
| 10 | **End of user speech → assistant audio** | `UtteranceEnd` → first `media_play` | **1,683 ms** |

An earlier run with serialized TTS took 2.59 s for the same chain. Sentence chunking starts playback as soon as the first sentence is ready, which produced the 1.68 s result.

### Barge-in

In a multi-turn run, assistant audio was playing when user speech was detected; playback paused after **142 ms** and **178 ms** in two events, and the interrupted utterance did not finish. Barge-in is wired to Deepgram `SpeechStarted`, not to a UI-only state.

### TTS relay

`POST /api/v1/voice/speak` with a real Deepgram credential returned audio with 933–1,029 ms first-byte latency and complete payloads (7.9–8.0 KB for a short sentence). The selected credential received a success routing event.

## 3. Changes in this engineering pass

| Change | Effect | Verification |
|---|---|---|
| Pooled TTS HTTP client | Reuses one keep-alive client for sentence chunks instead of a new client per chunk | Code inspection; live TTS returned audio |
| `0194339` warm-up fix | Primes the TLS connection with `HEAD https://api.deepgram.com/` instead of `GET /v1/speak`, which Deepgram rejects with 400 | Code inspection; the post-fix backend log contains no `/v1/speak` 400 warm-up failures |
| Recording successes | Success and failure update routing events and health timestamps | Live routing events verified |
| Sentence chunking | Playback begins on the first sentence rather than the full answer | 2.59 s → 1.68 s in the recorded comparison |

The current backend log's `400 Bad Request` entries are CORS preflight failures for `OPTIONS` requests from an earlier wrong-origin frontend configuration, not TTS warm-up failures.

## 4. Functional verification

| Check | Result | Evidence |
|---|---|---|
| Unauthenticated WebSocket upgrade | Rejected (403 before accept) | live probe |
| Invalid/expired JWT | Rejected | JWT tamper probes |
| Interim and final transcript hypotheses | Pass | `Results` frames with `is_final` |
| Final transcript matches spoken question | Pass | "Is the refund window for customers?" |
| Grounded answer with citations | Pass | SSE `meta` + `done`, two sources |
| Audible playback events | Pass | `audio_playing` / `media_play` |
| Multi-turn without reconnecting | Pass | two chat streams in one 44 s session |
| Barge-in pauses playback | Pass | 142 ms / 178 ms |
| No token in URL | Pass | WebSocket URL contains only `language` |

## 5. Not verified

| Item | Status | Reason |
|---|---|---|
| End-to-end latency after the warm-up fix | NOT RE-MEASURED | Requires a new instrumented browser run |
| Native Persian speech recognition | BLOCKED | No validated Persian audio fixture; `language` is relayed but accuracy is unclaimed |
| Physical microphone, gain, echo cancellation, Bluetooth | NOT TESTED | Synthesized audio into a virtual device |
| Mobile Safari | NOT TESTED | Desktop Chrome only |
| Packet loss and reconnect | NOT TESTED | Harness supports offline emulation; no reconnect assertion completed |
| Microphone permission-denied UI | NOT TESTED | Harness grants permission |
| Background noise and long silence | NOT TESTED | Clean synthetic fixture |

## 6. Interpretation

The voice path is functionally complete and its dominant costs are network/provider-bound: STT finalization (~1.76 s) and TTS first byte (~1.0 s). The 1.68 s end-of-speech-to-audio result is credible for a local run with a real provider and a short answer, but it is a single sample. It should not be generalized to other regions, longer answers, or mobile devices.

Note also that the assistant used an extractive fallback in this environment because the chat provider was unavailable, so stage 6 measures retrieval plus SSE framing, not paid LLM token generation. A production LLM would add its own first-token time.

## 7. Remaining work

1. Re-run the instrumented voice chain after the warm-up fix and record p50/p95 over at least ten turns.
2. Add a Persian audio fixture and measure STT accuracy before making any multilingual claim.
3. Test reconnect and degraded-network behavior.
4. Exercise microphone permission denial and device switching.
