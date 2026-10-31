# Weirwise Copilot & Deepgram Voice Integration

## 1. Overview
Weirwise Copilot is the official, internal product-guide assistant designed to help customers understand platform capabilities, manage workspaces, configure assistants, and navigate knowledge ingestion.

Copilot integrates **Deepgram** Speech-to-Text (STT) and Text-to-Speech (TTS) into a unified conversation experience with shared identity, knowledge sources, and conversation history.

---

## 2. Architecture & Design Principles

### Production-Grade Assistant Runtime Execution
Copilot is not a disconnected keyword search bot; it runs on the **same production-grade assistant runtime and infrastructure** that Weirwise provides to customer assistants:

```
             Weirwise Copilot UI
                      |
                Copilot Identity
                      |
             Assistant Runtime (`execute_assistant_turn`)
                      |
               Conversation Engine
                      |
              LLM Provider Router (`LLMRouter`)
                      |
              Admin-Selected LLM (OpenAI / Anthropic / Google)
                      |
                 RAG Pipeline
                      |
             RAG Core Gateway (`CoreClient` -> pgvector /dev-core)
                      |
         Official Weirwise Knowledge Base (`ws-operations`)
                      |
                Grounded Answer
                      |
      FinOps Cost Ledger & Conversation Persistence
```

Voice requests execute through the exact same conversation flow:
```
Microphone
    |
Deepgram STT (`/api/v1/copilot/voice/transcribe`)
    |
Transcribed Text
    |
Assistant Runtime (`/api/v1/copilot/chat`)
    |
LLM Router + RAG Core Retrieval
    |
Grounded Assistant Response
    |
Deepgram TTS (`/api/v1/copilot/voice/synthesize`)
    |
Audio Playback
```

### System-Managed Identity & Tenant Isolation
- **First-Party Platform Management**: Copilot is provisioned and resolved dynamically by `CopilotManager` under the dedicated `Weirwise Operations` workspace (`ws-operations`) and `platform-operations` project owned by `staff@weirwise.com`.
- **Tenant Isolation**: When customer users converse with Copilot, conversations and messages are persisted with their respective `user_id` and the Copilot `assistant_id`. Retrieval queries only target the official platform knowledge sources; customer private workspace documents are completely isolated.

### Super Admin Control & Encryption
Administrators manage Copilot via the dedicated Admin UI (`/admin/copilot`):
- **Runtime Parameters**: Global enable/disable, provider selection (`openai`, `anthropic`, `google`), model selection (`gpt-4o-mini`, `claude-3-5-sonnet`, `gemini-1.5-pro`, etc.), temperature, `top_k`, and retrieval threshold.
- **Deepgram Voice Settings**: Global voice enable/disable, STT model (`nova-3`), TTS voice (`aura-2-andromeda-en`).
- **Encrypted Credential Storage**: Admin-configured Deepgram API keys are encrypted at rest using Fernet encryption (`encrypt_credential_secret`) and stored in `SystemConfig.encrypted_secrets`. Zero credential leakage occurs over the API; keys are returned masked (e.g., `dg-a1b2...****`).

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

System-wide fallback settings are defined via environment variables:

```env
# Deepgram Voice Integration
DEEPGRAM_API_KEY=your_deepgram_api_key_here
DEEPGRAM_API_BASE_URL=https://api.deepgram.com
DEEPGRAM_STT_MODEL=nova-3
DEEPGRAM_TTS_MODEL=aura-2-andromeda-en
```

Overrides configured through `/admin/copilot` take precedence and are persisted dynamically in the platform database (`SystemConfig`).

---

## 4. Ingestion & Maintenance Workflow

Official product knowledge is maintained in the dedicated platform documentation knowledge source:
`backend/app/copilot/knowledge/official_product_knowledge.md`

On system bootstrap:
1. `CopilotManager.ensure_copilot_assistant(db)` validates the `Weirwise Operations` workspace and provisions the official knowledge source if not already indexed in pgvector.
2. Official product documentation can be updated by revising `official_product_knowledge.md` and triggering re-indexing via the Weirwise Knowledge API.
3. The RAG pipeline generates chunked vector embeddings via `dev-core` (pgvector), ensuring semantic similarity search with source citations for all user queries.
