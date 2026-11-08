"""Reusable payment provider abstraction and interface."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Optional


@dataclass
class PaymentCreationRequest:
    order_id: str
    order_number: str
    amount: Decimal
    currency: str
    customer_email: str
    customer_name: Optional[str] = None
    description: Optional[str] = None
    return_url: Optional[str] = None
    cancel_url: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class PaymentCreationResult:
    provider: str
    provider_payment_id: str
    payment_url: Optional[str] = None
    payment_address: Optional[str] = None
    qr_code_svg: Optional[str] = None
    expires_at_iso: Optional[str] = None
    status: str = "waiting_for_payment"
    raw_response: dict[str, Any] = field(default_factory=dict)


@dataclass
class PaymentStatusResult:
    provider: str
    provider_payment_id: str
    status: str  # waiting_for_payment, processing, confirming, completed, expired, failed, under_review
    amount: Decimal
    currency: str
    received_amount: Optional[Decimal] = None
    received_currency: Optional[str] = None
    payout_amount: Optional[Decimal] = None
    payout_currency: Optional[str] = None
    blockchain_txid: Optional[str] = None
    paid_at_iso: Optional[str] = None
    raw_response: dict[str, Any] = field(default_factory=dict)


class PaymentProvider(ABC):
    """Abstract interface for all Weirwise payment integrations."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Unique provider code, e.g. 'rampex'."""
        pass

    @abstractmethod
    async def validate_credentials(self) -> dict[str, Any]:
        """Verify API key and connectivity with upstream provider."""
        pass

    @abstractmethod
    async def create_payment(self, request: PaymentCreationRequest) -> PaymentCreationResult:
        """Create a payment session/link for customer checkout."""
        pass

    @abstractmethod
    async def get_payment_status(self, provider_payment_id: str) -> PaymentStatusResult:
        """Poll or fetch status from provider API."""
        pass

    @abstractmethod
    def verify_webhook_signature(self, raw_body: bytes, headers: dict[str, str]) -> bool:
        """Verify constant-time HMAC signature of raw webhook payload."""
        pass

    @abstractmethod
    def parse_webhook_payload(self, raw_body: bytes) -> dict[str, Any]:
        """Safely parse validated webhook payload."""
        pass
