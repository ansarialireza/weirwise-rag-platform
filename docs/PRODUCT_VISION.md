# Weirwise Product Vision

**Status:** Product direction and scope baseline  
**Last updated:** 2026-10-31

## 1. Product definition

Weirwise is being built to help businesses turn trusted knowledge into useful AI assistant experiences, while keeping people in control.

The central promise is simple: make business knowledge useful through AI assistants, without making the system opaque or taking important decisions away from people.

Weirwise is not merely a chat interface, a vector database UI, or a thin wrapper around an LLM provider. Its longer-term role is to provide the product experience and operational foundation around useful, knowledge-grounded assistants.

This document distinguishes the current product milestone from the longer-term direction. Future ideas must not be presented as released capabilities.

## 2. What Weirwise is today

The current near-term scope is intentionally narrow:

- A simple internal Weirwise assistant is available as the immediate product experience.
- The assistant is configured and maintained by the Weirwise team.
- Its knowledge is curated and supplied by the Weirwise team from official product information.
- Users can interact through text chat and voice conversation.
- Its purpose is to help users understand Weirwise and get guidance about currently available product capabilities.

This assistant is an internal product guide, not yet a fully autonomous operator. Its current scope does not imply that users can ask it to create, modify, publish, or delete platform resources.

It must not claim unavailable features exist. When official knowledge does not support an answer, it should say so rather than invent product behavior.

## 3. The internal Weirwise assistant

### Purpose
Help users understand the product, learn how currently available features work, and find answers to common questions without manually searching documentation.

### Knowledge ownership
- The Weirwise team owns and maintains the assistant's knowledge base.
- Knowledge should come from approved, current product documentation and verified product behavior.
- Documentation must distinguish released capabilities from planned or experimental capabilities.
- Unsupported questions should be acknowledged honestly and routed to an appropriate support path.
- Knowledge updates should follow product releases and verified documentation changes.

### Text and voice
Text and voice are two interaction modes for the same assistant. They must share the same identity, instructions, conversation context, knowledge sources, and answer policies.

Voice should be a natural alternative to typing, not a separate assistant. The interface should clearly communicate microphone permission, listening state, transcription, playback, and how to stop audio. Text must remain available when microphone permission or audio services are unavailable.

Deepgram is the selected infrastructure direction for speech-to-text and text-to-speech. Provider credentials must remain server-side. Audio should not be retained longer than necessary unless a clearly disclosed product requirement and appropriate consent justify retention.

## 4. The problem Weirwise aims to solve

Businesses have valuable knowledge scattered across websites, documents, policies, product information, and internal resources. Customers and employees repeatedly ask questions whose answers already exist somewhere in that information.

Traditional search makes people locate and interpret the material themselves. Generic AI chat can produce fluent answers without being grounded in a business's actual information.

Weirwise aims to bridge that gap with assistants that:
1. Use business-approved knowledge as their source of truth.
2. Retrieve relevant information for a question.
3. Generate clear answers grounded in that information.
4. Show supporting sources where supported by the product.
5. Acknowledge uncertainty instead of confidently inventing an answer.
6. Remain manageable by the people responsible for the business.

## 5. Long-term product direction

Over time, Weirwise may evolve into a workspace where a business can create, publish, manage, and improve multiple AI assistants for different use cases. This is strategic direction, not a claim that every capability is available today.

### Assistant lifecycle
Enable businesses to create assistants for distinct purposes, configure behavior, connect approved knowledge, test them, and publish them to relevant channels.

### Knowledge operations
Make it possible to add, organize, refresh, inspect, and remove knowledge sources. Help operators understand indexing status, failures, freshness, and whether available knowledge is sufficient.

### Quality and trust
Progressively support conversation inspection, source visibility, user feedback, unanswered-question analysis, and evaluation before changes affect live users.

### Integrations and channels
Connect assistants to business systems and communication channels only when a real use case, secure authorization model, and reliable operational support exist.

### Operational intelligence
Help operators understand usage, costs, reliability, and knowledge gaps. Reports and alerts should explain why they matter and remain configurable rather than becoming noisy notifications.

### Copilot and assisted operations
The internal assistant may eventually become context-aware and help users navigate or operate the platform. Any future action-taking capability must use authorized product APIs, enforce workspace permissions, and provide clear user control. Destructive or sensitive actions require stronger safeguards.

## 6. Product principles

- **Useful before impressive:** solve real user problems before adding complexity or novelty.
- **Grounded by default:** use approved knowledge, communicate uncertainty, and avoid fabricated claims.
- **Human control:** users should understand what the system is doing and retain control of important decisions.
- **Progressive capability:** add complexity only when user evidence and product maturity justify it.
- **One identity across modalities:** voice and text share the same assistant, knowledge, and policies.
- **Minimal, clear UX:** expose controls when useful, not merely because the system can support them.
- **Privacy and security by design:** protect credentials, isolate customer data, and minimize retention.
- **Honest product communication:** distinguish available features from development work and future possibilities.

## 7. Explicitly outside the current scope

The current internal-assistant milestone does not require:
- A general-purpose autonomous agent.
- Automatic creation, editing, publishing, or deletion of customer resources.
- A configurable autonomy or approval center.
- Proactive email, WhatsApp, or Telegram messaging.
- A multi-channel notification orchestration system.
- A broad ecosystem of third-party business integrations.
- Customer-managed assistant fleets or complex agent orchestration.
- Automatic self-healing or autonomous production changes.

These ideas may be revisited when the core product experience is stable and there is validated demand.

## 8. Experience expectations

The initial experience should be easy to access, clear about the assistant's role and knowledge boundaries, consistent between text and voice, responsive on desktop and mobile, and calm rather than overloaded with controls.

It should be helpful when it knows the answer, honest when it does not, and graceful when a service is unavailable.

## 9. How progress should be measured

Early success should be measured by user outcomes, not feature count:
- Users can access and start a conversation without confusion.
- Users can complete common product-information tasks through the assistant.
- Answers are supported by approved knowledge.
- Unsupported questions are handled honestly rather than hallucinated.
- Voice interactions work reliably and can be stopped or returned to text easily.
- Users understand the assistant's purpose and limitations.
- The Weirwise team can update and verify the knowledge base safely.

As the platform expands, additional measures may include assistant activation, knowledge freshness, answer quality, resolution rate, feedback, latency, reliability, and cost per useful interaction.

## 10. Roadmap posture

1. **Current:** a simple internal Weirwise assistant, maintained by the team, with curated official knowledge and text/voice conversation.
2. **Next, when justified:** improve answer quality, knowledge maintenance, UX, reliability, and visibility into unsupported questions.
3. **Later:** expand customer-facing assistant creation and lifecycle workflows based on validated needs.
4. **Future:** add deeper operational intelligence, integrations, proactive communication, and permissioned actions only when foundations are ready.

No future phase should be treated as delivered until implemented, tested, documented, and released.

---

**Product statement:** Weirwise turns trusted business knowledge into useful AI assistant experiences, with people remaining in control.
