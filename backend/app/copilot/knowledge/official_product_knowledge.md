# Weirwise Official Product Guide Knowledge Base

## Product Overview
Weirwise is an AI platform designed to help businesses turn trusted knowledge into useful, grounded AI assistant experiences while keeping people firmly in control.
The current product scope centers around an internal product-guide assistant (Weirwise Copilot) that helps users understand platform capabilities, manage workspaces and assistants, configure knowledge sources, and communicate through text and voice.

## Core Concepts

### Workspaces
- Workspaces provide multi-tenant organizational isolation.
- Each workspace has its own projects, members, billing plan, and settings.
- Roles within a workspace include Owner, Admin, Member, and Viewer.
- Workspaces isolate customer data: no workspace can access another workspace's knowledge or conversations.

### Projects
- Projects exist within workspaces to group related knowledge sources and assistants.
- A single workspace can contain multiple projects depending on the subscription plan.

### Assistants
- Assistants are conversational agents grounded in specific knowledge sources.
- Configurable parameters:
  - Name and description
  - System instructions (defining role and tone)
  - Model selection (e.g., gpt-4o-mini, claude-3-5-sonnet, gemini-1.5-pro)
  - Temperature (0.0 to 1.0)
  - Fallback message: the exact message returned when verified evidence is insufficient
  - Score threshold: cosine similarity cutoff for retrieval grounding
  - Top-K: number of chunks retrieved per query
  - Business tone: friendly, professional, concise, empathetic
  - Language: default language setting
- Assistants can be tested in the Playground before publishing.
- Published assistants can generate widget deployments with allowed domain restrictions.

### Knowledge Sources and Ingestion
- Knowledge sources store documents and web-crawled content.
- Supported file types: PDF (.pdf), Word Documents (.docx), Plain Text (.txt), Markdown (.md).
- Upload limit: up to 50 MB per file.
- Web crawler: SSRF-resilient crawler supporting sitemap discovery and recursive website crawling.
- Processing lifecycle: Documents transition through PENDING -> PROCESSING -> READY (or FAILED with error messages).

### Conversation and Citations
- Conversations track user and assistant messages with timestamps.
- Grounded answers provide citations including chunk ID, similarity score, and source excerpt.
- When no verified knowledge matches above the score threshold, the assistant acknowledges uncertainty using its configured fallback message.
- Users can provide thumbs up/down feedback on messages.
- Human handoff escalation is supported for queries requiring supervisor attention.

### Voice Capabilities (Deepgram Integration)
- Weirwise integrates Deepgram for Speech-to-Text (STT) and Text-to-Speech (TTS).
- Push-to-talk voice interface allows users to record their voice, transcribe speech, send queries to Copilot, and listen to synthesized audio responses.
- Language support:
  - English: Full STT and TTS support (Nova-2 / Nova-3 models and Aura-2 voices).
  - Persian: STT transcription is supported via Nova-3 / Whisper architectures. Persian TTS is currently not supported by Deepgram voices; in Persian mode, Copilot provides complete text responses without audio playback.
- Voice and text share the identical Copilot identity, knowledge grounding, and conversation history.

### Enterprise and Integrations
- Bring Your Own Key (BYOK): Encrypted credential storage for workspace-specific provider keys.
- Outbound Webhooks: HMAC-SHA256 signed notifications for events like human handoff requests.
- Integrations: Shopify, Zendesk, HubSpot credential storage and synchronization hooks.

### What Is NOT Currently Supported (Roadmap / Future Scope)
- The Copilot is an informational guide, NOT an autonomous operator.
- Copilot CANNOT automatically create, edit, or delete customer workspaces, projects, or assistants.
- Copilot CANNOT autonomously publish changes or alter production data.
- Copilot DOES NOT support proactive messaging or automated outreach.
- Copilot DOES NOT support Telegram, WhatsApp, or email messaging channels.
