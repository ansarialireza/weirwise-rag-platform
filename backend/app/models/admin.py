"""Enterprise AI Provider, Credential Vault, FinOps, and Admin Audit models."""

import enum
import uuid

from backend.app.db.base import GUID, Base, CompatibleJSON, utc_now
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship


class AdminRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    PLATFORM_ADMIN = "platform_admin"
    FINANCE_ADMIN = "finance_admin"
    SUPPORT_ADMIN = "support_admin"
    READ_ONLY_ADMIN = "read_only_admin"


class CredentialHealthStatus(str, enum.Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    RATE_LIMITED = "rate_limited"
    EXHAUSTED = "exhausted"
    DISABLED = "disabled"
    FAILED = "failed"


class ProviderRoutingStrategy(str, enum.Enum):
    PRIORITY = "priority"
    ROUND_ROBIN = "round_robin"
    WEIGHTED = "weighted"
    LEAST_RECENTLY_USED = "least_recently_used"
    LOWEST_COST = "lowest_cost"


class AdminUserRole(Base):
    """Admin role assignments for staff/operators with RBAC."""

    __tablename__ = "admin_user_roles"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), default=AdminRole.READ_ONLY_ADMIN.value, nullable=False, index=True)
    assigned_by = Column(GUID, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class ProviderAccount(Base):
    """Registered AI provider (e.g. OpenAI, Anthropic, Gemini, OpenRouter)."""

    __tablename__ = "admin_provider_accounts"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    provider_name = Column(
        String(50), nullable=False, unique=True, index=True
    )  # "openai", "anthropic", "gemini", "openrouter"
    display_name = Column(String(100), nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)
    default_routing_strategy = Column(String(50), default=ProviderRoutingStrategy.ROUND_ROBIN.value, nullable=False)
    global_monthly_budget_usd = Column(Numeric(12, 6), default=5000.00, nullable=False)
    current_month_spend_usd = Column(Numeric(12, 6), default=0.00, nullable=False)
    supported_models = Column(CompatibleJSON, default=list, nullable=False)  # list of model identifiers
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    credentials = relationship("ProviderCredential", back_populates="provider", cascade="all, delete-orphan")


class ProviderCredential(Base):
    """Encrypted credential in the AI Provider Vault."""

    __tablename__ = "admin_provider_credentials"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    provider_id = Column(GUID, ForeignKey("admin_provider_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(String(100), nullable=False)  # e.g., "Prod Cluster Primary", "OpenAI Secondary Fallback"
    key_prefix = Column(String(32), nullable=False)  # e.g., "sk-proj-...a1b2"
    encrypted_secret = Column(Text, nullable=False)  # Fernet encrypted payload
    secret_hash = Column(String(64), nullable=False, index=True)  # SHA-256 hash for deduplication/verification
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    health_status = Column(String(50), default=CredentialHealthStatus.HEALTHY.value, nullable=False, index=True)
    priority = Column(Integer, default=1, nullable=False)  # Higher is higher priority
    routing_weight = Column(Integer, default=10, nullable=False)
    models_allowed = Column(CompatibleJSON, default=list, nullable=False)  # If empty, all provider models allowed

    # Financial & Limit Controls
    monthly_budget_usd = Column(Numeric(12, 6), default=1000.00, nullable=False)
    current_month_spend_usd = Column(Numeric(12, 6), default=0.00, nullable=False)
    warning_threshold_pct = Column(Integer, default=85, nullable=False)
    rate_limit_rpm = Column(Integer, default=500, nullable=False)
    rate_limit_tpm = Column(Integer, default=100000, nullable=False)

    # Operational Telemetry
    total_requests_served = Column(Integer, default=0, nullable=False)
    total_tokens_served = Column(Integer, default=0, nullable=False)
    consecutive_failures = Column(Integer, default=0, nullable=False)
    last_error_reason = Column(String(255), nullable=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    cooling_down_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    provider = relationship("ProviderAccount", back_populates="credentials")


class TokenCostLedger(Base):
    """Detailed token ledger & FinOps billing log for every AI turn and embedding."""

    __tablename__ = "admin_token_cost_ledger"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    workspace_id = Column(GUID, nullable=False, index=True)
    credential_id = Column(GUID, nullable=True, index=True)
    provider_name = Column(String(50), nullable=False, index=True)
    model_name = Column(String(100), nullable=False, index=True)
    request_type = Column(String(50), default="chat", nullable=False)  # "chat", "embedding", "reasoning"
    input_tokens = Column(Integer, default=0, nullable=False)
    output_tokens = Column(Integer, default=0, nullable=False)
    total_tokens = Column(Integer, default=0, nullable=False)
    cost_usd = Column(Numeric(12, 6), default=0.000000, nullable=False)  # 6 decimal precision for microcents
    latency_ms = Column(Integer, default=0, nullable=False)
    is_success = Column(Boolean, default=True, nullable=False)
    error_type = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    __table_args__ = (
        Index("ix_ledger_workspace_time", "workspace_id", "created_at"),
        Index("ix_ledger_provider_model_time", "provider_name", "model_name", "created_at"),
    )


class FinancialInvoice(Base):
    """Financial tracking for SaaS MRR, subscriptions, invoices, and payments."""

    __tablename__ = "admin_financial_invoices"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    workspace_id = Column(GUID, nullable=False, index=True)
    invoice_number = Column(String(64), unique=True, nullable=False, index=True)
    amount_usd = Column(Numeric(10, 2), nullable=False)
    plan_tier = Column(String(50), default="pro", nullable=False)
    status = Column(String(50), default="paid", nullable=False, index=True)  # "paid", "open", "refunded", "void"
    billing_period_start = Column(DateTime(timezone=True), nullable=False)
    billing_period_end = Column(DateTime(timezone=True), nullable=False)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class AdminAuditLog(Base):
    """Immutable, append-only security and operational audit trail."""

    __tablename__ = "admin_audit_logs"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    actor_id = Column(GUID, nullable=False, index=True)
    actor_email = Column(String(255), nullable=False)
    action = Column(String(100), nullable=False, index=True)  # e.g., "credential.create", "provider.budget_update"
    target_entity = Column(String(50), nullable=False)  # "credential", "provider", "user", "workspace"
    target_id = Column(String(100), nullable=True)
    details = Column(CompatibleJSON, default=dict, nullable=False)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
