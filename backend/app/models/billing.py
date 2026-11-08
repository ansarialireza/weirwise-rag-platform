"""Billing, Subscription, Payment, and Entitlement database models."""

import enum
import uuid
from decimal import Decimal

from backend.app.db.base import GUID, Base, CompatibleJSON, utc_now
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship


class BillingCycle(str, enum.Enum):
    MONTHLY = "monthly"
    YEARLY = "yearly"


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    TRIALING = "trialing"


class OrderStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    PAID = "paid"
    FAILED = "failed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
    UNDER_REVIEW = "under_review"


class PaymentStatus(str, enum.Enum):
    CREATING = "creating"
    WAITING_FOR_PAYMENT = "waiting_for_payment"
    PROCESSING = "processing"
    CONFIRMING = "confirming"
    COMPLETED = "completed"
    EXPIRED = "expired"
    FAILED = "failed"
    UNDER_REVIEW = "under_review"


class InvoiceStatus(str, enum.Enum):
    DRAFT = "draft"
    OPEN = "open"
    PAID = "paid"
    VOID = "void"
    UNCOLLECTIBLE = "uncollectible"


class BillingPlan(Base):
    """Dynamic commercial billing plan definitions managed by admins."""

    __tablename__ = "billing_plans"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True, nullable=False, index=True)  # e.g., "free", "starter", "pro", "enterprise"
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    monthly_price = Column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    yearly_price = Column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    currency = Column(String(10), default="USD", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_public = Column(Boolean, default=True, nullable=False)
    is_recommended = Column(Boolean, default=False, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)

    # Entitlement limits
    max_assistants = Column(Integer, default=2, nullable=False)
    max_documents = Column(Integer, default=10, nullable=False)
    max_chat_turns_monthly = Column(Integer, default=100, nullable=False)
    max_storage_mb = Column(Integer, default=50, nullable=False)
    max_file_size_mb = Column(Integer, default=10, nullable=False)
    max_knowledge_sources = Column(Integer, default=6, nullable=False)

    # Product capabilities flags
    allowed_models = Column(CompatibleJSON, default=lambda: ["Auto", "Fast"], nullable=False)
    features = Column(CompatibleJSON, default=list, nullable=False)
    allow_custom_branding = Column(Boolean, default=False, nullable=False)
    allow_api_access = Column(Boolean, default=True, nullable=False)
    allow_overage = Column(Boolean, default=False, nullable=False)
    overage_rate_cents = Column(Integer, default=5, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    subscriptions = relationship("BillingSubscription", back_populates="plan")
    orders = relationship("BillingOrder", back_populates="plan")


class BillingSubscription(Base):
    """User active or past SaaS subscription."""

    __tablename__ = "billing_subscriptions"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    workspace_id = Column(GUID, ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True, index=True)
    plan_id = Column(GUID, ForeignKey("billing_plans.id", ondelete="RESTRICT"), nullable=False, index=True)
    status = Column(String(50), default=SubscriptionStatus.ACTIVE.value, nullable=False, index=True)
    billing_cycle = Column(String(20), default=BillingCycle.MONTHLY.value, nullable=False)

    current_period_start = Column(DateTime(timezone=True), nullable=False)
    current_period_end = Column(DateTime(timezone=True), nullable=False)
    cancel_at_period_end = Column(Boolean, default=False, nullable=False)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User")
    workspace = relationship("Workspace")
    plan = relationship("BillingPlan", back_populates="subscriptions")
    orders = relationship("BillingOrder", back_populates="subscription")
    invoices = relationship("BillingInvoice", back_populates="subscription")


class BillingOrder(Base):
    """Internal purchase checkout order."""

    __tablename__ = "billing_orders"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    order_number = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    workspace_id = Column(GUID, ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True, index=True)
    plan_id = Column(GUID, ForeignKey("billing_plans.id", ondelete="RESTRICT"), nullable=False, index=True)
    subscription_id = Column(
        GUID, ForeignKey("billing_subscriptions.id", ondelete="SET NULL"), nullable=True, index=True
    )

    billing_cycle = Column(String(20), default=BillingCycle.MONTHLY.value, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(10), default="USD", nullable=False)
    status = Column(String(50), default=OrderStatus.PENDING.value, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User")
    workspace = relationship("Workspace")
    plan = relationship("BillingPlan", back_populates="orders")
    subscription = relationship("BillingSubscription", back_populates="orders")
    payments = relationship("BillingPayment", back_populates="order")
    invoice = relationship("BillingInvoice", back_populates="order", uselist=False)


class BillingPayment(Base):
    """Payment transaction attempt across Rampex or future gateways."""

    __tablename__ = "billing_payments"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    order_id = Column(GUID, ForeignKey("billing_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(50), default="rampex", nullable=False, index=True)
    provider_payment_id = Column(String(255), nullable=True, index=True)  # link_id or txn ID
    provider_session_id = Column(String(255), nullable=True)

    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(10), default="USD", nullable=False)

    received_amount = Column(Numeric(18, 6), nullable=True)
    received_currency = Column(String(20), nullable=True)
    payout_amount = Column(Numeric(18, 6), nullable=True)
    payout_currency = Column(String(20), nullable=True)

    status = Column(String(50), default=PaymentStatus.WAITING_FOR_PAYMENT.value, nullable=False, index=True)
    payment_url = Column(String(1024), nullable=True)
    payment_address = Column(String(255), nullable=True)  # Crypto destination address
    qr_code_svg = Column(Text, nullable=True)
    blockchain_txid = Column(String(255), nullable=True, index=True)

    expires_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    raw_response = Column(CompatibleJSON, default=dict, nullable=False)

    review_reason = Column(String(255), nullable=True)
    resolved_by = Column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    order = relationship("BillingOrder", back_populates="payments")
    events = relationship("BillingPaymentEvent", back_populates="payment", cascade="all, delete-orphan")


class BillingPaymentEvent(Base):
    """Auditable log of provider webhooks and status transitions."""

    __tablename__ = "billing_payment_events"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    payment_id = Column(GUID, ForeignKey("billing_payments.id", ondelete="CASCADE"), nullable=True, index=True)
    provider = Column(String(50), default="rampex", nullable=False)
    event_type = Column(String(100), nullable=False, index=True)
    event_id = Column(String(255), nullable=True, unique=True, index=True)  # For webhook idempotency
    payload = Column(CompatibleJSON, default=dict, nullable=False)
    signature = Column(String(255), nullable=True)
    is_valid = Column(Boolean, default=True, nullable=False)
    processed = Column(Boolean, default=False, nullable=False)
    processing_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    payment = relationship("BillingPayment", back_populates="events")


class BillingInvoice(Base):
    """Auditable SaaS invoice records with printable/downloadable details."""

    __tablename__ = "billing_invoices"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    invoice_number = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    workspace_id = Column(GUID, ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True, index=True)
    subscription_id = Column(
        GUID, ForeignKey("billing_subscriptions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    order_id = Column(GUID, ForeignKey("billing_orders.id", ondelete="SET NULL"), nullable=True, index=True)

    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(10), default="USD", nullable=False)
    status = Column(String(50), default=InvoiceStatus.PAID.value, nullable=False, index=True)

    billing_period_start = Column(DateTime(timezone=True), nullable=False)
    billing_period_end = Column(DateTime(timezone=True), nullable=False)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    line_items = Column(CompatibleJSON, default=list, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User")
    workspace = relationship("Workspace")
    subscription = relationship("BillingSubscription", back_populates="invoices")
    order = relationship("BillingOrder", back_populates="invoice")


class PaymentProviderConfig(Base):
    """Dynamic administrative payment gateway configuration."""

    __tablename__ = "payment_provider_configs"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    provider_name = Column(String(50), unique=True, nullable=False, index=True)  # "rampex"
    display_name = Column(String(100), nullable=False)
    is_enabled = Column(Boolean, default=False, nullable=False)
    api_base_url = Column(String(255), default="https://api.rampex.io", nullable=False)
    encrypted_api_key = Column(Text, nullable=True)
    encrypted_webhook_secret = Column(Text, nullable=True)
    key_prefix = Column(String(32), nullable=True)  # Masked display, e.g. "rpx_qs...662"
    supported_currencies = Column(CompatibleJSON, default=lambda: ["USD", "EUR", "GBP"], nullable=False)
    extra_settings = Column(CompatibleJSON, default=dict, nullable=False)
    last_verified_at = Column(DateTime(timezone=True), nullable=True)
    verification_status = Column(String(50), default="untested", nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
