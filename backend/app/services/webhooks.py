"""HMAC-signed outbound webhooks delivery service for real-time automation."""

import hashlib
import hmac
import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx
from backend.app.models.assistant import WebhookDelivery, WebhookSubscription
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class WebhookDispatcher:
    @staticmethod
    def generate_signature(secret: str, payload_bytes: bytes, timestamp: int) -> str:
        """Generate HMAC-SHA256 signature for webhook payload: t={timestamp},v1={hex_digest}."""
        import hashlib
        import hmac

        signed_payload = f"{timestamp}.".encode("utf-8") + payload_bytes
        signature = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
        return f"t={timestamp},v1={signature}"

    """Dispatches webhook payloads asynchronously with cryptographic HMAC-SHA256 signatures."""

    @classmethod
    async def dispatch(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
        event_type: str,
        payload: dict[str, Any],
    ) -> list[WebhookDelivery]:
        """Dispatch event to all active subscriptions of user listening for this event."""
        stmt = select(WebhookSubscription).where(
            WebhookSubscription.user_id == user_id,
            WebhookSubscription.is_active.is_(True),
        )
        res = await db.execute(stmt)
        subs = res.scalars().all()

        matching = [s for s in subs if event_type in s.events or "*" in s.events]
        deliveries = []

        for sub in matching:
            delivery = await cls._deliver(db, sub, event_type, payload)
            deliveries.append(delivery)

        return deliveries

    @classmethod
    async def dispatch_event(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
        event_type: str,
        payload_data: dict[str, Any],
        **kwargs: Any,
    ) -> list[WebhookDelivery]:
        """Alias for dispatch method accepting payload_data."""
        return await cls.dispatch(db=db, user_id=user_id, event_type=event_type, payload=payload_data)

    @classmethod
    async def _deliver(
        cls,
        db: AsyncSession,
        sub: WebhookSubscription,
        event_type: str,
        payload: dict[str, Any],
    ) -> WebhookDelivery:
        timestamp = int(datetime.now(UTC).timestamp())
        envelope = {
            "id": str(uuid.uuid4()),
            "event": event_type,
            "created_at": timestamp,
            "user_id": str(sub.user_id),
            "data": payload,
        }
        body = json.dumps(envelope, separators=(",", ":"))

        # Compute HMAC signature: t={timestamp},v1={sha256}
        sig_payload = f"{timestamp}.{body}".encode("utf-8")
        signature = hmac.new(sub.secret_key.encode("utf-8"), sig_payload, hashlib.sha256).hexdigest()
        sig_header = f"t={timestamp},v1={signature}"

        delivery = WebhookDelivery(
            subscription_id=sub.id,
            event_type=event_type,
            payload=envelope,
            attempts=1,
            status="pending",
        )
        db.add(delivery)
        await db.flush()

        headers = {
            "Content-Type": "application/json",
            "X-Weirwise-Signature": sig_header,
            "User-Agent": "Weirwise-Webhooks/1.0",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(sub.target_url, content=body, headers=headers)
                delivery.response_code = resp.status_code
                delivery.response_body = resp.text[:2000]

                if 200 <= resp.status_code < 300:
                    delivery.status = "delivered"
                    sub.failure_count = 0
                else:
                    delivery.status = "failed"
                    delivery.error_message = f"HTTP status {resp.status_code}"
                    sub.failure_count += 1
        except Exception as e:
            delivery.status = "failed"
            delivery.error_message = str(e)[:1000]
            sub.failure_count += 1
            logger.warning(f"Webhook dispatch failed to {sub.target_url}: {e}")

        # Disable auto-delivery after 10 consecutive failures
        if sub.failure_count >= 10:
            sub.is_active = False
            logger.error(f"Disabled webhook subscription {sub.id} due to 10 consecutive failures.")

        await db.commit()
        await db.refresh(delivery)
        return delivery


webhook_dispatcher = WebhookDispatcher()
