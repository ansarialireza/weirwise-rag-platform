"""Pydantic schemas for SaaS billing, plans, checkout, and admin financial center."""

import uuid
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, Field


class PlanResponse(BaseModel):
    id: uuid.UUID
    code: str
    tier: Optional[str] = None  # Backward-compatibility alias
    name: str
    description: Optional[str] = None
    monthly_price: float
    monthly_price_usd: Optional[int] = None  # Backward-compatibility alias
    yearly_price: float
    currency: str
    is_active: bool
    is_recommended: bool
    sort_order: int
    max_assistants: int
    max_documents: int
    max_chat_turns_monthly: int
    max_storage_mb: int
    max_file_size_mb: int
    allowed_models: list[str]
    features: list[str]
    allow_custom_branding: bool
    allow_api_access: bool


class PlanCreateRequest(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    monthly_price: Decimal = Decimal("0.00")
    yearly_price: Decimal = Decimal("0.00")
    currency: str = "USD"
    is_active: bool = True
    is_public: bool = True
    is_recommended: bool = False
    sort_order: int = 0
    max_assistants: int = 2
    max_documents: int = 10
    max_chat_turns_monthly: int = 100
    max_storage_mb: int = 50
    max_file_size_mb: int = 10
    max_knowledge_sources: int = 6
    allowed_models: list[str] = Field(default_factory=lambda: ["Auto", "Fast"])
    features: list[str] = Field(default_factory=list)
    allow_custom_branding: bool = False
    allow_api_access: bool = True


class PlanUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    monthly_price: Optional[Decimal] = None
    yearly_price: Optional[Decimal] = None
    is_active: Optional[bool] = None
    is_public: Optional[bool] = None
    is_recommended: Optional[bool] = None
    sort_order: Optional[int] = None
    max_assistants: Optional[int] = None
    max_documents: Optional[int] = None
    max_chat_turns_monthly: Optional[int] = None
    max_storage_mb: Optional[int] = None
    max_file_size_mb: Optional[int] = None
    max_knowledge_sources: Optional[int] = None
    allowed_models: Optional[list[str]] = None
    features: Optional[list[str]] = None
    allow_custom_branding: Optional[bool] = None
    allow_api_access: Optional[bool] = None


class AccountBillingOverviewResponse(BaseModel):
    user_id: Optional[uuid.UUID] = None
    workspace_id: Optional[uuid.UUID] = None  # Backward-compatibility alias
    plan_code: str
    plan_tier: Optional[str] = None  # Backward-compatibility alias
    plan_name: str
    monthly_price: float
    monthly_price_usd: Optional[int] = None  # Backward-compatibility alias
    yearly_price: float
    currency: str
    billing_cycle: str
    status: str
    billing_status: Optional[str] = None  # Backward-compatibility alias
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    cancel_at_period_end: bool
    chat_turns_used: int
    chat_turns_limit: int
    documents_indexed: int
    documents_limit: int
    assistants_limit: int
    storage_mb_limit: int
    allowed_models: list[str]
    features: list[str]


# Backward compatibility alias
WorkspaceBillingOverviewResponse = AccountBillingOverviewResponse


class CheckoutInitiateRequest(BaseModel):
    plan_code: str
    billing_cycle: str = "monthly"  # "monthly" or "yearly"
    customer_email: Optional[str] = None


class CheckoutResponse(BaseModel):
    order_id: uuid.UUID
    order_number: str
    plan_name: str
    amount: float
    currency: str
    status: str
    provider: str
    provider_payment_id: str
    payment_url: Optional[str] = None
    payment_address: Optional[str] = None
    qr_code_svg: Optional[str] = None
    expires_at: Optional[str] = None


class CheckoutStatusResponse(BaseModel):
    order_id: uuid.UUID
    order_number: str
    status: str  # pending, paid, waiting_for_payment, processing, confirming, completed, failed, expired, under_review
    amount: float
    currency: str
    received_amount: Optional[float] = None
    received_currency: Optional[str] = None
    blockchain_txid: Optional[str] = None
    payment_url: Optional[str] = None
    payment_address: Optional[str] = None
    qr_code_svg: Optional[str] = None
    is_subscription_active: bool = False


class InvoiceResponse(BaseModel):
    id: uuid.UUID
    invoice_number: str
    amount: float
    currency: str
    status: str
    billing_period_start: str
    billing_period_end: str
    paid_at: Optional[str] = None
    line_items: list[dict[str, Any]]
    created_at: str


class AdminSubscriptionAdjustmentRequest(BaseModel):
    target_plan_code: str
    extend_days: Optional[int] = None
    reason: str


class ProviderConfigUpdateRequest(BaseModel):
    is_enabled: Optional[bool] = None
    api_key: Optional[str] = None
    webhook_secret: Optional[str] = None
    wallet_address: Optional[str] = None
    api_base_url: Optional[str] = None


class ProviderConfigResponse(BaseModel):
    provider_name: str
    display_name: str
    is_enabled: bool
    api_base_url: str
    key_prefix: Optional[str] = None
    wallet_address: Optional[str] = None
    supported_currencies: list[str]
    verification_status: str
    last_verified_at: Optional[str] = None


class ManualPaymentReviewRequest(BaseModel):
    action: str  # "approve" or "reject"
    notes: str
