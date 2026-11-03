"""Assistant, Conversation, Message, Deployment, Feedback, Evaluation, and Integration models."""

import enum
import uuid

from backend.app.db.base import GUID, Base, CompatibleJSON, utc_now
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship


class AssistantStatus(str, enum.Enum):
    DRAFT = "draft"
    TESTING = "testing"
    PUBLISHED = "published"
    UNPUBLISHED = "unpublished"
    ARCHIVED = "archived"


class Assistant(Base):
    __tablename__ = "assistants"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Mapping to Weirwise Core Assistant UUID if 1:1 mapped
    core_assistant_id = Column(GUID, nullable=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    system_instructions = Column(Text, nullable=True)
    model = Column(String(100), default="Auto", nullable=False)
    engine_mode = Column(String(50), default="ai_answer", nullable=False)  # search_only | ai_answer
    temperature = Column(Float, default=0.2, nullable=False)
    max_tokens = Column(Integer, default=1024, nullable=False)
    score_threshold = Column(Float, default=0.7, nullable=False)
    top_k = Column(Integer, default=4, nullable=False)

    # Business Personality & Customization
    language = Column(String(20), default="en", nullable=False)
    tone = Column(String(50), default="professional", nullable=False)  # friendly, professional, concise, empathetic
    fallback_message = Column(
        Text,
        default=(
            "I am sorry, but I do not have enough verified information in my knowledge base to answer that accurately."
        ),
        nullable=False,
    )
    escalation_email = Column(String(255), nullable=True)

    status = Column(String(50), default=AssistantStatus.DRAFT.value, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    last_published_at = Column(DateTime(timezone=True), nullable=True)
    published_snapshot = Column(CompatibleJSON, nullable=True)  # Frozen immutable config snapshot on publish
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="assistants")
    source_links = relationship("AssistantKnowledgeSource", back_populates="assistant", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="assistant", cascade="all, delete-orphan")
    deployments = relationship("Deployment", back_populates="assistant", cascade="all, delete-orphan")
    feedback_records = relationship("AnswerFeedback", back_populates="assistant", cascade="all, delete-orphan")
    unanswered_queries = relationship("UnansweredQuery", back_populates="assistant", cascade="all, delete-orphan")
    evaluations = relationship("EvaluationCase", back_populates="assistant", cascade="all, delete-orphan")


class AssistantKnowledgeSource(Base):
    __tablename__ = "assistant_knowledge_sources"

    assistant_id = Column(GUID, ForeignKey("assistants.id", ondelete="CASCADE"), primary_key=True)
    knowledge_source_id = Column(GUID, ForeignKey("knowledge_sources.id", ondelete="CASCADE"), primary_key=True)
    priority = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    assistant = relationship("Assistant", back_populates="source_links")
    knowledge_source = relationship("KnowledgeSource", back_populates="assistant_links")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    assistant_id = Column(GUID, ForeignKey("assistants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    session_token = Column(String(128), nullable=True, index=True)  # For widget / anonymous users
    title = Column(String(255), nullable=True)
    is_escalated = Column(Boolean, default=False, nullable=False)
    escalation_reason = Column(String(255), nullable=True)
    escalation_contact = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    assistant = relationship("Assistant", back_populates="conversations")
    messages = relationship(
        "Message", back_populates="conversation", order_by="Message.created_at.asc()", cascade="all, delete-orphan"
    )
    feedback_records = relationship("AnswerFeedback", back_populates="conversation", cascade="all, delete-orphan")
    unanswered_queries = relationship("UnansweredQuery", back_populates="conversation", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    conversation_id = Column(GUID, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)
    citations = Column(CompatibleJSON, default=list, nullable=False)
    latency_ms = Column(Integer, nullable=True)
    tokens_used = Column(Integer, default=0, nullable=False)
    is_grounded = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    conversation = relationship("Conversation", back_populates="messages")
    feedback = relationship("AnswerFeedback", back_populates="message", uselist=False, cascade="all, delete-orphan")


class Deployment(Base):
    __tablename__ = "deployments"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    assistant_id = Column(GUID, ForeignKey("assistants.id", ondelete="CASCADE"), nullable=False, index=True)
    deployment_type = Column(String(50), default="widget", nullable=False)  # widget, public_api
    name = Column(String(255), nullable=False)
    public_key = Column(String(64), unique=True, nullable=False, index=True)
    allowed_domains = Column(CompatibleJSON, default=list, nullable=False)  # CORS domain whitelist
    theme_config = Column(CompatibleJSON, default=dict, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    assistant = relationship("Assistant", back_populates="deployments")


class AnswerFeedback(Base):
    """User and operator feedback loop for attribution and answer quality."""

    __tablename__ = "answer_feedback"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    assistant_id = Column(GUID, ForeignKey("assistants.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(GUID, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    message_id = Column(GUID, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
    rating = Column(Integer, nullable=False)  # 1 for positive (+1), -1 for negative (-1)
    comment = Column(Text, nullable=True)
    category = Column(String(50), nullable=True)  # incorrect, ungrounded, incomplete, tone, lag
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    assistant = relationship("Assistant", back_populates="feedback_records")
    conversation = relationship("Conversation", back_populates="feedback_records")
    message = relationship("Message", back_populates="feedback")


class UnansweredQuery(Base):
    """Gap analysis: Questions where RAG score was below threshold or fallback triggered."""

    __tablename__ = "unanswered_queries"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    assistant_id = Column(GUID, ForeignKey("assistants.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(GUID, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    query_text = Column(Text, nullable=False)
    highest_score = Column(Float, default=0.0, nullable=False)
    status = Column(String(50), default="unresolved", nullable=False)  # unresolved, reviewed, resolved
    resolution_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    assistant = relationship("Assistant", back_populates="unanswered_queries")
    conversation = relationship("Conversation", back_populates="unanswered_queries")


class EvaluationCase(Base):
    """Pre-publish automated regression evaluation test suite."""

    __tablename__ = "evaluation_cases"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    assistant_id = Column(GUID, ForeignKey("assistants.id", ondelete="CASCADE"), nullable=False, index=True)
    query = Column(Text, nullable=False)
    expected_answer_keywords = Column(CompatibleJSON, default=list, nullable=False)
    expected_grounded = Column(Boolean, default=True, nullable=False)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_passed = Column(Boolean, nullable=True)
    last_similarity_score = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    assistant = relationship("Assistant", back_populates="evaluations")


class ThirdPartyIntegration(Base):
    """External CRM / Ticketing connectors (Zendesk, Salesforce, HubSpot, Slack)."""

    __tablename__ = "third_party_integrations"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(50), nullable=False)  # zendesk, salesforce, hubspot, slack
    is_active = Column(Boolean, default=True, nullable=False)
    encrypted_credentials = Column(Text, nullable=False)  # Fernet encrypted payload
    config = Column(CompatibleJSON, default=dict, nullable=False)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    sync_status = Column(String(50), default="idle", nullable=False)  # idle, syncing, completed, failed
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_user_integration_provider"),)


class WebhookSubscription(Base):
    """HMAC-signed outbound webhooks for real-time business system automation."""

    __tablename__ = "webhook_subscriptions"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    target_url = Column(String(1024), nullable=False)
    secret_key = Column(String(128), nullable=False)
    events = Column(CompatibleJSON, default=list, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    failure_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    deliveries = relationship("WebhookDelivery", back_populates="subscription", cascade="all, delete-orphan")


class WebhookDelivery(Base):
    """Historical delivery log for outgoing webhooks."""

    __tablename__ = "webhook_deliveries"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    subscription_id = Column(
        GUID, ForeignKey("webhook_subscriptions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type = Column(String(100), nullable=False)
    payload = Column(CompatibleJSON, nullable=False)
    response_code = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    attempts = Column(Integer, default=1, nullable=False)
    status = Column(String(50), default="delivered", nullable=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    subscription = relationship("WebhookSubscription", back_populates="deliveries")


class PlanEntitlement(Base):
    """Dynamic plan limits and commercial controls for Free, Starter, Pro tiers."""

    __tablename__ = "plan_entitlements"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    plan_tier = Column(String(50), default="free", nullable=False)
    max_assistants = Column(Integer, default=1, nullable=False)
    max_knowledge_sources = Column(Integer, default=3, nullable=False)
    monthly_chat_turns_limit = Column(Integer, default=100, nullable=False)
    max_storage_mb = Column(Integer, default=50, nullable=False)
    allow_custom_branding = Column(Boolean, default=False, nullable=False)
    allow_overage = Column(Boolean, default=False, nullable=False)
    overage_rate_cents = Column(Integer, default=5, nullable=False)
    data_retention_days = Column(Integer, default=30, nullable=False)
    current_period_chat_turns = Column(Integer, default=0, nullable=False)
    period_start = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    period_end = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class UserBYOKCredential(Base):
    """Enterprise Bring-Your-Own-Key per user."""

    __tablename__ = "user_byok_credentials"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider_name = Column(String(50), nullable=False)  # openai, anthropic, azure_openai
    api_endpoint = Column(String(512), nullable=True)
    deployment_id = Column(String(255), nullable=True)
    api_version = Column(String(50), nullable=True)
    key_prefix = Column(String(32), nullable=False)
    encrypted_key = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "provider_name", name="uq_user_byok_provider"),)
