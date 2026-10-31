# Weirwise Copilot & Deepgram Voice Integration

## 1. Overview
Weirwise Copilot is the official, internal product-guide assistant designed to help customers understand platform capabilities, manage workspaces, configure assistants, and navigate knowledge ingestion.

Copilot integrates **Deepgram** Speech-to-Text (STT) and Text-to-Speech (TTS) into a unified conversation experience with shared identity, knowledge sources, and conversation history.

---

## 2. Architecture & Design Principles

### Single Engine for Text and Voice
- Both text input and speech input funnel into the same underlying Copilot conversation pipeline (`/api/v1/copilot/chat`).
- All answers are grounded strictly in curated official Weirwise product documentation.
- When verified knowledge is absent, Copilot honestly acknowledges uncertainty rather than hallucinating capabilities.

### Security & Secret Protection
- Deepgram API credentials (`DEEPGRAM_API_KEY`) remain strictly server-side.
- The client receives synthesized audio blobs or transcription payloads; browser network requests never receive API tokens.
- Audio payloads are processed in memory and never persisted as raw files on the host or database.

### Verified Language Support
Deepgram model capabilities were audited:
- **English (`en`)**:
  - STT: Fully supported via `nova-3` / `nova-2` models with punctuation and smart formatting.
  - TTS: Fully supported via Deepgram Aura-2 voices (`aura-2-andromeda-en`, `aura-2-apollo-en`, etc.).
- **Persian (`fa`)**:
  - STT: Supported via `nova-3` and `whisper` architectures.
  - TTS: **Currently unsupported** by Deepgram (0 available Persian voices). The platform handles this limitation gracefully: Persian queries receive full grounded text answers without attempting audio playback.

---

## 3. Configuration & Environment Variables

Add to `.env` or deployment secrets:

```env
# Deepgram Voice Integration
DEEPGRAM_API_KEY=your_deepgram_api_key_here
DEEPGRAM_API_BASE_URL=https://api.deepgram.com
DEEPGRAM_STT_MODEL=nova-3
DEEPGRAM_TTS_MODEL=aura-2-andromeda-en
```

---

## 4. Maintenance Workflow

Official product knowledge is stored in:
`backend/app/copilot/knowledge/official_product_knowledge.md`

To update official product knowledge:
1. Edit or append sections in `official_product_knowledge.md` under markdown headers (`## Section Title`).
2. The `CopilotKnowledgeStore` parses sections on startup and indexes keywords.
3. No conversation engine changes or database migrations are required.
