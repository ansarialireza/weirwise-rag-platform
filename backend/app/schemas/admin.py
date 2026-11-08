"""Pydantic schemas for Super Admin Control Center."""

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator


class SubscriptionTierCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    monthly_price: float = Field(0.0, ge=0.0)
    max_assistants: int = Field(2, ge=1)
    max_monthly_messages: int = Field(100, ge=0)
    max_storage_mb: int = Field(50, ge=1)


class SubscriptionTierUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    monthly_price: Optional[float] = Field(None, ge=0.0)
    max_assistants: Optional[int] = Field(None, ge=1)
    max_monthly_messages: Optional[int] = Field(None, ge=0)
    max_storage_mb: Optional[int] = Field(None, ge=1)


class SubscriptionTierResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    monthly_price: float
    max_assistants: int
    max_monthly_messages: int
    max_storage_mb: int
    created_at: datetime
    updated_at: datetime


class AIRoutingStrategyCreate(BaseModel):
    ui_name: str = Field(..., min_length=2, max_length=50)
    ui_description: str = Field(..., min_length=2, max_length=255)
    target_llm_model: str = Field(..., min_length=2, max_length=100)
    is_active: bool = True


class AIRoutingStrategyUpdate(BaseModel):
    ui_name: Optional[str] = Field(None, min_length=2, max_length=50)
    ui_description: Optional[str] = Field(None, min_length=2, max_length=255)
    target_llm_model: Optional[str] = Field(None, min_length=2, max_length=100)
    is_active: Optional[bool] = None


class AIRoutingStrategyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ui_name: str
    ui_description: str
    target_llm_model: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ProviderAccountCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_name: str = Field(..., min_length=2, max_length=50)
    display_name: str = Field(..., min_length=2, max_length=100)
    is_enabled: bool = True
    default_routing_strategy: Literal[
        "priority", "round_robin", "weighted", "least_recently_used", "least_loaded", "lowest_cost"
    ] = "round_robin"
    global_monthly_budget_usd: float = Field(5000.0, ge=0)
    supported_models: list[str] = Field(default_factory=list)
    account_rate_limit_rpm: int = Field(0, ge=0)
    account_rate_limit_tpm: int = Field(0, ge=0)
    account_max_concurrency: int = Field(0, ge=0)


class ProviderAccountUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def reject_null_values(cls, values: Any) -> Any:
        if isinstance(values, dict) and any(value is None for value in values.values()):
            raise ValueError("Provider update fields cannot be null.")
        return values

    display_name: Optional[str] = Field(None, min_length=2, max_length=100)
    is_enabled: Optional[bool] = None
    default_routing_strategy: Optional[
        Literal["priority", "round_robin", "weighted", "least_recently_used", "least_loaded", "lowest_cost"]
    ] = None
    global_monthly_budget_usd: Optional[float] = Field(None, ge=0)
    supported_models: Optional[list[str]] = None
    account_rate_limit_rpm: Optional[int] = Field(None, ge=0)
    account_rate_limit_tpm: Optional[int] = Field(None, ge=0)
    account_max_concurrency: Optional[int] = Field(None, ge=0)


class ProviderAccountResponse(BaseModel):
    id: uuid.UUID
    provider_name: str
    display_name: str
    is_enabled: bool
    default_routing_strategy: str
    global_monthly_budget_usd: float
    current_month_spend_usd: float
    supported_models: list[str]
    account_rate_limit_rpm: int = 0
    account_rate_limit_tpm: int = 0
    account_max_concurrency: int = 0
    created_at: datetime
    updated_at: datetime


class CredentialCreate(BaseModel):
    label: str = Field(..., min_length=2, max_length=100)
    secret: SecretStr = Field(..., min_length=8)
    priority: int = Field(1, ge=1)
    routing_weight: int = Field(10, ge=1)
    models_allowed: list[str] = Field(default_factory=list)
    monthly_budget_usd: float = Field(1000.0, ge=0)
    rate_limit_rpm: int = Field(500, ge=1)
    rate_limit_tpm: int = Field(100000, ge=1)
    max_concurrency: int = Field(0, ge=0)


class CredentialResponse(BaseModel):
    id: uuid.UUID
    provider_id: uuid.UUID
    label: str
    key_prefix: str  # Masked secret, never plaintext
    is_active: bool
    health_status: str
    remaining_balance: Optional[str] = None
    priority: int
    routing_weight: int
    models_allowed: list[str]
    monthly_budget_usd: float
    current_month_spend_usd: float
    warning_threshold_pct: int
    rate_limit_rpm: int
    rate_limit_tpm: int
    max_concurrency: int = 0
    total_requests_served: int
    total_tokens_served: int
    consecutive_failures: int
    last_error_reason: Optional[str]
    last_used_at: Optional[datetime]
    last_success_at: Optional[datetime] = None
    last_failure_at: Optional[datetime] = None
    last_health_check_at: Optional[datetime] = None
    cooling_down_until: Optional[datetime]
    created_at: datetime


class SystemMetricsResponse(BaseModel):
    total_users: int
    active_users: int
    total_assistants: int
    total_sources: int
    total_documents: int
    total_tokens_consumed: int
    total_ai_spend_usd: float
    monthly_recurring_revenue_usd: float
    gross_margin_pct: float
    system_health: str


class FinOpsSummaryResponse(BaseModel):
    total_revenue_usd: float
    total_cost_usd: float
    gross_profit_usd: float
    gross_margin_pct: float
    cost_by_provider: dict[str, float]
    cost_by_model: dict[str, float]
    tokens_by_provider: dict[str, int]


class AdminAuditLogResponse(BaseModel):
    id: uuid.UUID
    actor_id: uuid.UUID
    actor_email: str
    action: str
    target_entity: str
    target_id: Optional[str]
    details: dict[str, Any]
    ip_address: Optional[str]
    created_at: datetime


class AdminControlSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    management_mode: Literal["manual", "automatic"]
    emergency_stop: bool
    automatic_failover: bool
    auto_disable_unhealthy: bool
    auto_recover_credentials: bool
    rate_limit_cooldown_seconds: int
    circuit_breaker_failure_threshold: int
    circuit_breaker_cooldown_seconds: int
    updated_by: Optional[uuid.UUID]
    updated_at: datetime


class AdminControlSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def reject_null_values(cls, values: Any) -> Any:
        if isinstance(values, dict) and any(value is None for value in values.values()):
            raise ValueError("Operations settings cannot be null.")
        return values

    management_mode: Optional[Literal["manual", "automatic"]] = None
    emergency_stop: Optional[bool] = None
    automatic_failover: Optional[bool] = None
    auto_disable_unhealthy: Optional[bool] = None
    auto_recover_credentials: Optional[bool] = None
    rate_limit_cooldown_seconds: Optional[int] = Field(None, ge=10, le=3600)
    circuit_breaker_failure_threshold: Optional[int] = Field(None, ge=1, le=20)
    circuit_breaker_cooldown_seconds: Optional[int] = Field(None, ge=30, le=86400)


class AdminUserStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_active: bool


class CredentialStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_active: bool


class CredentialUpdate(BaseModel):
    """Mutable non-secret metadata for a vault credential."""

    model_config = ConfigDict(extra="forbid")

    label: Optional[str] = Field(None, min_length=2, max_length=100)
    priority: Optional[int] = Field(None, ge=1)
    routing_weight: Optional[int] = Field(None, ge=1)
    models_allowed: Optional[list[str]] = None
    monthly_budget_usd: Optional[float] = Field(None, ge=0)
    warning_threshold_pct: Optional[int] = Field(None, ge=1, le=100)
    rate_limit_rpm: Optional[int] = Field(None, ge=1)
    rate_limit_tpm: Optional[int] = Field(None, ge=1)
    max_concurrency: Optional[int] = Field(None, ge=0)


class RoutingEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    routing_id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    provider_name: str
    model_name: Optional[str]
    credential_id: Optional[uuid.UUID]
    credential_label: Optional[str]
    key_prefix: Optional[str]
    routing_mode: str
    strategy: str
    decision_reason: Optional[str]
    attempt_number: int
    is_failover: bool
    outcome: str
    error_category: Optional[str]
    error_message: Optional[str]
    retry_after_seconds: Optional[int]
    latency_ms: int
    created_at: datetime


class CredentialUsageResponse(BaseModel):
    credential_id: uuid.UUID
    window_days: int
    request_count: int
    success_count: int
    failure_count: int
    success_rate_pct: float
    input_tokens: int
    output_tokens: int
    total_tokens: int
    total_cost_usd: float
    estimated_cost_usd: float
    provider_billed_cost_usd: float
    avg_latency_ms: float
    monthly_budget_usd: float
    monthly_spend_usd: float
    budget_used_pct: float
    cost_by_model: dict[str, float]
    daily_cost_usd: dict[str, float]
    recent_events: list[RoutingEventResponse]


class ProviderTokenValidationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: Literal["jina", "openai", "anthropic", "gemini", "deepgram", "openrouter", "resend"]
    token: SecretStr = Field(..., min_length=8)


class ProviderTokensSaveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_name: Literal["jina", "openai", "anthropic", "gemini", "deepgram", "openrouter", "resend"]
    tokens_raw: SecretStr = Field(..., min_length=8)


class AdminAccessResponse(BaseModel):
    is_admin: bool
    role: Literal["super_admin", "platform_admin", "finance_admin", "support_admin", "read_only_admin"]
