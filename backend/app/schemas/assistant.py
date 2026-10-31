"""Comprehensive Pydantic schemas for Assistants, Public Runtime, Conversations, Feedback, Analytics, Integrations, and Billing."""

import uuid
from datetime import datetime
from typing import Any

from backend.app.models.assistant import AssistantStatus, DeploymentType
from pydantic import BaseModel, ConfigDict, Field


# ==============================================================================
# PHASE 1 & 2: ASSISTANTS, CONFIGURATION, PUBLIC RUNTIME & FEEDBACK
# ==============================================================================

class AssistantCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    system_instructions: str | None = None
    model: str = Field("gpt-4o-mini", max_length=100)
    temperature: float = Field(0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(1024, ge=64, le=4096)
    score_threshold: float = Field(0.7, ge=0.0, le=1.0)
    top_k: int = Field(4, ge=1, le=20)
    language: str = Field("en", max_length=20)
    tone: str = Field("professional", max_length=50)
    fallback_message: str = Field("I am sorry, but I do not have enough verified information in my knowledge base to answer that accurately.")
    escalation_email: str | None = None
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
    language: str | None = Field(None, max_length=20)
    tone: str | None = Field(None, max_length=50)
    fallback_message: str | None = None
    escalation_email: str | None = None
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
    language: str = "en"
    tone: str = "professional"
    fallback_message: str
    escalation_email: str | None = None
    status: AssistantStatus
    version: int
    last_published_at: datetime | None = None
    knowledge_source_ids: list[uuid.UUID] = []
    created_at: datetime
    updated_at: datetime


class PublishValidationResponse(BaseModel):
    is_ready: bool
    issues: list[str] = []
    knowledge_sources_count: int
    indexed_documents_count: int


class ChatMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8192)
    conversation_id: uuid.UUID | None = None
    session_token: str | None = None


class CitationItem(BaseModel):
    document_id: uuid.UUID | None = None
    document_name: str | None = None
    chunk_id: str | None = None
    source_url: str | None = None
    title: str | None = None
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
    is_grounded: bool = True
    suggest_escalation: bool = False


class PublicRuntimeConfigResponse(BaseModel):
    assistant_id: uuid.UUID
    name: str
    language: str
    tone: str
    welcome_message: str
    placeholder_text: str
    primary_color: str
    position: str
    show_branding: bool
    allowed_domains: list[str]


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assistant_id: uuid.UUID
    title: str | None
    is_escalated: bool = False
    escalation_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    citations: list[Any]
    latency_ms: int | None
    is_grounded: bool = True
    created_at: datetime


class AnswerFeedbackRequest(BaseModel):
    rating: str = Field(..., pattern="^(positive|negative)$")
    reason: str | None = None
    comment: str | None = None


class AnswerFeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assistant_id: uuid.UUID
    conversation_id: uuid.UUID
    message_id: uuid.UUID
    rating: str
    reason: str | None
    comment: str | None
    created_at: datetime


class UnansweredQueryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assistant_id: uuid.UUID
    conversation_id: uuid.UUID
    query_text: str
    fallback_reason: str
    frequency_count: int
    status: str
    created_at: datetime


class KnowledgeGapAnalyticsResponse(BaseModel):
    total_unanswered: int
    top_unanswered_questions: list[dict[str, Any]]
    weak_coverage_topics: list[str]
    positive_feedback_count: int
    negative_feedback_count: int
    satisfaction_rate_pct: float


class EvaluationCaseCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    question: str = Field(..., min_length=2)
    expected_answer: str = Field(..., min_length=2)
    expected_facts: list[str] = Field(default_factory=list)


class EvaluationCaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assistant_id: uuid.UUID
    name: str
    question: str
    expected_answer: str
    expected_facts: list[str]
    last_run_score: float | None = None
    last_run_result: dict[str, Any] | None = None
    last_run_at: datetime | None = None
    created_at: datetime


class HumanHandoffCreateRequest(BaseModel):
    customer_email: str | None = None
    customer_name: str | None = None
    reason: str = Field(..., min_length=2)


class HumanHandoffResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    customer_email: str | None
    customer_name: str | None
    reason: str | None
    status: str
    external_ticket_id: str | None
    created_at: datetime


# ==============================================================================
# PHASE 3: BUSINESS INTEGRATIONS & WEBHOOKS
# ==============================================================================

class BusinessIntegrationCreateRequest(BaseModel):
    provider: str = Field(..., pattern="^(shopify|zendesk|gorgias|google_drive|notion)$")
    display_name: str = Field(..., min_length=2, max_length=255)
    credentials: dict[str, Any] = Field(..., description="API tokens, secrets, or OAuth credentials")
    config: dict[str, Any] = Field(default_factory=dict)


class BusinessIntegrationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    provider: str
    display_name: str
    is_active: bool
    config: dict[str, Any]
    last_synced_at: datetime | None
    sync_status: str
    last_error: str | None
    created_at: datetime


class WebhookSubscriptionCreateRequest(BaseModel):
    target_url: str = Field(..., min_length=8, max_length=1024)
    events: list[str] = Field(..., min_length=1)


class WebhookSubscriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    target_url: str
    events: list[str]
    is_active: bool
    failure_count: int
    secret_key: str | None = None  # Returned once upon creation
    created_at: datetime


# ==============================================================================
# PHASE 4: MONETIZATION & USAGE
# ==============================================================================

class WorkspacePlanEntitlementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    workspace_id: uuid.UUID
    plan_tier: str
    max_assistants: int
    max_knowledge_sources: int
    monthly_chat_turns_limit: int
    max_storage_mb: int
    allow_custom_branding: bool
    allow_overage: bool
    overage_rate_cents: int
    data_retention_days: int
    current_period_chat_turns: int
    period_start: datetime
    period_end: datetime | None


class UpdateOverageRequest(BaseModel):
    allow_overage: bool


# ==============================================================================
# PHASE 5: ENTERPRISE BYOK
# ==============================================================================

class WorkspaceBYOKCreateRequest(BaseModel):
    provider_name: str = Field(..., pattern="^(openai|anthropic|azure_openai)$")
    api_key: str = Field(..., min_length=8)
    api_endpoint: str | None = None  # Required for Azure OpenAI
    deployment_id: str | None = None  # Required for Azure OpenAI
    api_version: str | None = None


class WorkspaceBYOKResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    provider_name: str
    api_endpoint: str | None
    deployment_id: str | None
    key_prefix: str
    is_active: bool
    created_at: datetime


# ==============================================================================
# DEPLOYMENT & API CREDENTIALS
# ==============================================================================

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
    raw_api_key: str | None = None
