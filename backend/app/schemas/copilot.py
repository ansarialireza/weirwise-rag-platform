"""Schemas for Weirwise Copilot conversations and Deepgram voice integration."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CopilotCitation(BaseModel):
    chunk_id: str
    title: str
    content: str
    similarity_score: float
    rank: int


class CopilotChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    conversation_id: uuid.UUID | None = None
    language: str = Field(default="en", max_length=10)


class CopilotChatResponse(BaseModel):
    conversation_id: uuid.UUID
    message_id: uuid.UUID
    role: str = "assistant"
    content: str
    sources: list[CopilotCitation] = Field(default_factory=list)
    latency_ms: int
    is_grounded: bool
    voice_supported: bool = True


class CopilotMessageItem(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    sources: list[CopilotCitation] = Field(default_factory=list)
    is_grounded: bool
    created_at: datetime


class CopilotConversationDetail(BaseModel):
    id: uuid.UUID
    title: str | None = None
    created_at: datetime
    messages: list[CopilotMessageItem] = Field(default_factory=list)


class VoiceTranscribeResponse(BaseModel):
    transcript: str
    confidence: float
    language: str
    duration_seconds: float


class VoiceSynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    language: str = Field(default="en", max_length=10)
    voice: str | None = None


class CopilotAdminConfigResponse(BaseModel):
    is_enabled: bool
    provider: str
    model: str
    temperature: float
    top_k: int
    score_threshold: float
    voice_enabled: bool
    deepgram_stt_model: str
    deepgram_tts_model: str
    supported_languages: list[str]
    has_deepgram_key: bool
    deepgram_key_prefix: str | None = None
    official_kb_id: uuid.UUID | None = None
    assistant_id: uuid.UUID | None = None


class CopilotAdminConfigRequest(BaseModel):
    is_enabled: bool | None = None
    provider: str | None = None
    model: str | None = None
    temperature: float | None = None
    top_k: int | None = None
    score_threshold: float | None = None
    voice_enabled: bool | None = None
    deepgram_stt_model: str | None = None
    deepgram_tts_model: str | None = None
    supported_languages: list[str] | None = None
    deepgram_api_key: str | None = None  # If provided, encrypted & stored
