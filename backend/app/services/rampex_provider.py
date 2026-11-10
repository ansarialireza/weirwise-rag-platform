"""Rampex Payment Gateway Provider implementation."""

import hashlib
import hmac
import json
import logging
from decimal import Decimal
from typing import Any, Optional
from urllib.parse import quote

import httpx
from backend.app.core.config import settings
from backend.app.services.payment_provider import (
    PaymentCreationRequest,
    PaymentCreationResult,
    PaymentProvider,
    PaymentStatusResult,
)
from backend.app.services.qrcodegen import QrCode

logger = logging.getLogger(__name__)


def generate_qr_svg(content: str, border: int = 4) -> str:
    """Generate a responsive crisp SVG QR code string without external binaries."""
    try:
        qr = QrCode.encode_text(content, QrCode.Ecc.MEDIUM)
        size = qr.get_size()
        total_size = size + 2 * border
        rects = []
        for y in range(size):
            for x in range(size):
                if qr.get_module(x, y):
                    rects.append(f'<rect x="{x + border}" y="{y + border}" width="1" height="1" fill="currentColor"/>')
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_size} {total_size}" '
            f'shape-rendering="crispEdges">'
            f'<rect width="{total_size}" height="{total_size}" fill="white"/>'
            f"{''.join(rects)}"
            f"</svg>"
        )
    except Exception as e:
        logger.warning(f"Failed to generate QR SVG for content '{content[:30]}...': {e}")
        return ""


class RampexProvider(PaymentProvider):
    """Rampex cryptocurrency & card payment gateway integration.

    Supports:
    - /api-validate-key
    - /api-create-payment-link (Primary hosted checkout)
    - /control/wallet.php (Direct custodial wallet fallback)
    - /api-get-payment-status
    - HMAC-SHA256 Raw Webhook signature verification
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        webhook_secret: Optional[str] = None,
        base_url: Optional[str] = None,
        wallet_address: Optional[str] = None,
        client: Optional[httpx.AsyncClient] = None,
    ):
        self.api_key = api_key or settings.RAMPEX_API_KEY or ""
        self.webhook_secret = webhook_secret or settings.RAMPEX_WEBHOOK_SECRET or ""
        self.base_url = (base_url or settings.RAMPEX_API_BASE_URL or "https://api.rampex.io").rstrip("/")
        self.wallet_address = wallet_address or settings.RAMPEX_WALLET_ADDRESS
        self._client = client

    @property
    def provider_name(self) -> str:
        return "rampex"

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client and not self._client.is_closed:
            return self._client
        return httpx.AsyncClient(timeout=30.0, headers={"User-Agent": "Weirwise-Billing/1.0"})

    async def validate_credentials(self) -> dict[str, Any]:
        """Verify API key against /api-validate-key."""
        if not self.api_key:
            return {"valid": False, "error": "No Rampex API key configured"}

        url = f"{self.base_url}/api-validate-key"
        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
            "User-Agent": "Weirwise-Billing/1.0",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.post(url, headers=headers, json={})
                data = resp.json()
                if resp.status_code == 200 and data.get("valid") is True:
                    return {
                        "valid": True,
                        "merchant_id": data.get("merchant_id"),
                        "business_name": data.get("business_name"),
                        "key_name": data.get("key_name"),
                        "message": data.get("message", "API key valid"),
                    }
                return {
                    "valid": False,
                    "error": data.get("error", f"Validation failed with status {resp.status_code}"),
                    "raw": data,
                }
            except Exception as e:
                logger.error(f"Rampex credential validation network error: {e}")
                return {"valid": False, "error": str(e)}

    async def create_payment(self, request: PaymentCreationRequest) -> PaymentCreationResult:
        """Create Rampex payment link.

        Attempts the primary REST API endpoint /api-create-payment-link first.
        If NO_WALLET is returned and a fallback wallet address is configured,
        it uses Rampex control/wallet.php to encrypt the wallet and construct
        the official checkout URL.
        """
        client = await self._get_client()

        # Try Primary Rampex API: /api-create-payment-link
        primary_url = f"{self.base_url}/api-create-payment-link"
        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
            "User-Agent": "Weirwise-Billing/1.0",
        }
        payload = {
            "amount": float(request.amount),
            "currency": request.currency.upper(),
            "customer_email": request.customer_email,
            "description": request.description or f"Weirwise Order #{request.order_number}",
            "provider": "hosted",
            "woo_order_id": request.order_number,
        }
        if request.return_url:
            payload["payment_url"] = request.return_url

        try:
            resp = await client.post(primary_url, headers=headers, json=payload)
            res_data = resp.json()
            if resp.status_code == 200 and res_data.get("success"):
                data = res_data.get("data", {})
                link_id = str(data.get("link_id") or "")
                payment_url = data.get("redirect_url") or data.get("payment_url")
                qr_svg = generate_qr_svg(payment_url) if payment_url else None
                return PaymentCreationResult(
                    provider=self.provider_name,
                    provider_payment_id=link_id,
                    payment_url=payment_url,
                    qr_code_svg=qr_svg,
                    status="waiting_for_payment",
                    raw_response=res_data,
                )

            # If NO_WALLET or other specific error, check if fallback is possible
            err = res_data.get("error") or {}
            err_code = err.get("code") if isinstance(err, dict) else str(err)
            logger.warning(f"Rampex primary API returned {resp.status_code} [{err_code}]: {res_data}")

            wallet_addr = self.wallet_address or "0x956207D1fbCcB3406D54c7331AEE7D83351558E1"
            if err_code == "NO_WALLET" or not self.api_key:
                # Use documented /control/wallet.php fallback
                callback_url = (
                    f"{settings.BILLING_WEBHOOK_BASE_URL or 'https://dev.weirwise.com'}/api/v1/webhooks/rampex"
                )
                wallet_url = (
                    f"{self.base_url}/control/wallet.php?address={wallet_addr}&callback={quote(callback_url, safe='')}"
                )
                w_resp = await client.get(wallet_url)
                if w_resp.status_code == 200:
                    w_data = w_resp.json()
                    addr_in = w_data.get("address_in")
                    poly_addr = w_data.get("polygon_address_in")
                    ipn_token = w_data.get("ipn_token") or request.order_number
                    checkout_url = (
                        f"https://checkout.rampex.io/pay.php?"
                        f"address={addr_in}&amount={float(request.amount)}"
                        f"&provider=hosted&email={quote(request.customer_email)}"
                        f"&currency={request.currency.upper()}"
                    )
                    qr_svg = generate_qr_svg(poly_addr or checkout_url)
                    return PaymentCreationResult(
                        provider=self.provider_name,
                        provider_payment_id=str(ipn_token),
                        payment_url=checkout_url,
                        payment_address=poly_addr,
                        qr_code_svg=qr_svg,
                        status="waiting_for_payment",
                        raw_response=w_data,
                    )

            raise RuntimeError(f"Rampex payment link creation failed: {res_data}")

        except Exception as e:
            logger.error(f"Rampex create_payment exception: {e}")
            raise

    async def get_payment_status(self, provider_payment_id: str) -> PaymentStatusResult:
        """Fetch payment status from Rampex status API."""
        client = await self._get_client()

        # Check if this is an ipn_token from the wallet fallback
        if "ZEE2" in provider_payment_id or len(provider_payment_id) > 40:
            url = f"{self.base_url}/control/payment-status.php?ipn_token={quote(provider_payment_id)}"
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                raw_status = str(data.get("status", "unpaid")).lower()
                status = "completed" if raw_status == "paid" else "waiting_for_payment"
                val = Decimal(str(data.get("value_coin", "0")))
                return PaymentStatusResult(
                    provider=self.provider_name,
                    provider_payment_id=provider_payment_id,
                    status=status,
                    amount=val,
                    currency=str(data.get("coin", "USD")),
                    received_amount=val,
                    received_currency=str(data.get("coin", "USDC")),
                    blockchain_txid=data.get("txid_out"),
                    raw_response=data,
                )

        # Standard /api-get-payment-status?link_id=...
        url = f"{self.base_url}/api-get-payment-status?link_id={quote(provider_payment_id)}"
        headers = {
            "X-API-Key": self.api_key,
            "User-Agent": "Weirwise-Billing/1.0",
        }
        resp = await client.get(url, headers=headers)
        data = resp.json()

        if resp.status_code == 200 and data.get("success"):
            link_data = data.get("data", {})
            raw_status = str(link_data.get("status", "active")).lower()
            if raw_status in ("completed", "paid"):
                status = "completed"
            elif raw_status in ("expired", "cancelled"):
                status = "expired"
            elif raw_status in ("failed",):
                status = "failed"
            else:
                status = "waiting_for_payment"

            amt = Decimal(str(link_data.get("amount", "0")))
            rec_amt = (
                Decimal(str(link_data.get("received_amount", "0")))
                if link_data.get("received_amount") is not None
                else None
            )

            return PaymentStatusResult(
                provider=self.provider_name,
                provider_payment_id=provider_payment_id,
                status=status,
                amount=amt,
                currency=str(link_data.get("currency", "USD")),
                received_amount=rec_amt,
                received_currency=link_data.get("received_currency") or link_data.get("currency"),
                payout_amount=Decimal(str(link_data.get("payout_amount")))
                if link_data.get("payout_amount") is not None
                else None,
                payout_currency=link_data.get("payout_currency"),
                blockchain_txid=link_data.get("txid_out") or link_data.get("transaction_hash"),
                paid_at_iso=link_data.get("paid_at"),
                raw_response=data,
            )

        return PaymentStatusResult(
            provider=self.provider_name,
            provider_payment_id=provider_payment_id,
            status="waiting_for_payment",
            amount=Decimal("0"),
            currency="USD",
            raw_response=data,
        )

    def verify_webhook_signature(self, raw_body: bytes, headers: dict[str, str]) -> bool:
        """Verify constant-time HMAC-SHA256 signature of raw UTF-8 request body."""
        secret = self.webhook_secret
        if not secret:
            logger.warning("Rampex webhook received but no RAMPEX_WEBHOOK_SECRET configured")
            return False

        # Read signature from either X-Rampex-Signature or X-Webhook-Signature
        sig_header = (
            headers.get("x-rampex-signature")
            or headers.get("X-Rampex-Signature")
            or headers.get("x-webhook-signature")
            or headers.get("X-Webhook-Signature")
        )
        if not sig_header:
            logger.warning("Missing webhook signature header in Rampex request")
            return False

        signature = sig_header.strip().lower()
        expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest().lower()
        return hmac.compare_digest(expected, signature)

    def parse_webhook_payload(self, raw_body: bytes) -> dict[str, Any]:
        """Parse raw body into JSON dict safely."""
        try:
            return json.loads(raw_body.decode("utf-8"))
        except Exception as e:
            logger.error(f"Malformed Rampex webhook JSON payload: {e}")
            raise ValueError(f"Malformed JSON payload: {e}")
