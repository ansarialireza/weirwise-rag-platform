"""Pydantic schemas for Super Admin Control Center."""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


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
