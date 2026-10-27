"""Pydantic schemas for Assistant, Conversation, Message, and Deployment."""

import uuid
from datetime import datetime
from typing import Any

from backend.app.models.assistant import AssistantStatus, DeploymentType
from pydantic import BaseModel, ConfigDict, Field


class AssistantCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    system_instructions: str | None = None
    model: str = Field("gpt-4o-mini", max_length=100)
    temperature: float = Field(0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(1024, ge=64, le=4096)
    score_threshold: float = Field(0.7, ge=0.0, le=1.0)
    top_k: int = Field(4, ge=1, le=20)
    knowledge_source_ids: list[uuid.UUID] | None = None


class AssistantUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=255)
    description: str | None = None
    system_instructions: str | None = None
    model: str | None = Field(None, max_length=100)
    temperature: float | None = Field(None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(None, ge=64, le=4096)
    score_threshold: float | None = Field(None, ge=0.0, le=1.0)
    top_k: int | None = Field(None, ge=1, le=20)
    knowledge_source_ids: list[uuid.UUID] | None = None


class AssistantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    core_assistant_id: uuid.UUID | None
    name: str
    description: str | None
    system_instructions: str | None
    model: str
    temperature: float
    max_tokens: int
    score_threshold: float
    top_k: int
    status: AssistantStatus
    version: int
    knowledge_source_ids: list[uuid.UUID] = []
    created_at: datetime
    updated_at: datetime


class ChatMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8192)
    conversation_id: uuid.UUID | None = None


class CitationItem(BaseModel):
    document_id: uuid.UUID | None = None
    document_name: str | None = None
    chunk_id: str | None = None
    content: str
    similarity_score: float
    rank: int


class ChatResponse(BaseModel):
    conversation_id: uuid.UUID
    message_id: uuid.UUID
    role: str = "assistant"
    content: str
    sources: list[CitationItem] = []
    latency_ms: int | None = None
    token_usage: dict[str, Any] = {}


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assistant_id: uuid.UUID
    title: str | None
    created_at: datetime
    updated_at: datetime


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    citations: list[Any]
    latency_ms: int | None
    created_at: datetime


class DeploymentCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    deployment_type: DeploymentType = DeploymentType.WIDGET
    allowed_domains: list[str] = Field(default_factory=list)
    theme_config: dict[str, Any] = Field(default_factory=dict)


class DeploymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assistant_id: uuid.UUID
    deployment_type: DeploymentType
    name: str
    public_key: str
    allowed_domains: list[str]
    theme_config: dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ApiCredentialCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    scopes: list[str] | None = Field(default_factory=lambda: ["assistants:read", "assistants:chat"])


class ApiCredentialResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    key_prefix: str
    scopes: list[str]
    is_active: bool
    created_at: datetime
    raw_api_key: str | None = None  # Populated strictly once upon creation
