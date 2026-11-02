"""Pydantic schemas for Super Admin Control Center."""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


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
    provider_name: str = Field(..., min_length=2, max_length=50)
    display_name: str = Field(..., min_length=2, max_length=100)
    default_routing_strategy: str = "round_robin"
    global_monthly_budget_usd: float = 5000.0
    supported_models: list[str] = []


class ProviderAccountResponse(BaseModel):
    id: uuid.UUID
    provider_name: str
    display_name: str
    is_enabled: bool
    default_routing_strategy: str
    global_monthly_budget_usd: float
    current_month_spend_usd: float
    supported_models: list[str]
    created_at: datetime
    updated_at: datetime


class CredentialCreate(BaseModel):
    label: str = Field(..., min_length=2, max_length=100)
    secret: str = Field(..., min_length=8)  # Plain secret received once, encrypted immediately
    priority: int = 1
    routing_weight: int = 10
    models_allowed: list[str] = []
    monthly_budget_usd: float = 1000.0
    rate_limit_rpm: int = 500
    rate_limit_tpm: int = 100000


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
    total_requests_served: int
    total_tokens_served: int
    consecutive_failures: int
    last_error_reason: Optional[str]
    last_used_at: Optional[datetime]
    cooling_down_until: Optional[datetime]
    created_at: datetime


class SystemMetricsResponse(BaseModel):
    total_users: int
    active_users: int
    total_workspaces: int
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
