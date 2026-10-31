"""SSRF-safe, HMAC-signed outbound webhook dispatcher."""

import hashlib
import hmac
import json
import time
import uuid
from typing import Any

import httpx
from backend.app.core.logging import logger
from backend.app.models.assistant import WebhookDelivery, WebhookSubscription
from backend.app.services.scraper import is_ssrf_safe_url
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class WebhookDispatcher:
    """Dispatches asynchronous webhooks to customer endpoints with HMAC SHA-256 signatures."""

    @staticmethod
    def generate_signature(secret: str, payload_bytes: bytes, timestamp: int) -> str:
        """Create standard HMAC-SHA256 signature formatted as 't={timestamp},v1={hex_hash}'."""
        to_sign = f"t={timestamp}.".encode("utf-8") + payload_bytes
        signature = hmac.new(secret.encode("utf-8"), to_sign, hashlib.sha256).hexdigest()
        return f"t={timestamp},v1={signature}"

    @classmethod
    async def dispatch_event(
        cls,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        event_type: str,
        payload_data: dict[str, Any],
    ) -> list[WebhookDelivery]:
        """Dispatch event to all active subscriptions in workspace listening for this event."""
        stmt = select(WebhookSubscription).where(
            WebhookSubscription.workspace_id == workspace_id,
            WebhookSubscription.is_active == True,
        )
        res = await db.execute(stmt)
        subscriptions = res.scalars().all()

        deliveries: list[WebhookDelivery] = []

        for sub in subscriptions:
            events_list = sub.events or []
            if event_type not in events_list and "*" not in events_list:
                continue

            # Validate target URL is SSRF safe before every attempt
            if not is_ssrf_safe_url(sub.target_url):
                logger.warning(f"Blocked webhook dispatch to unsafe target URL: {sub.target_url}")
                delivery = WebhookDelivery(
                    subscription_id=sub.id,
                    event_type=event_type,
                    payload=payload_data,
                    response_code=0,
                    status="failed",
                    error_message="Destination target URL resolves to a prohibited private network address.",
                )
                db.add(delivery)
                deliveries.append(delivery)
                continue

            # Prepare payload & HMAC header
            full_payload = {
                "id": str(uuid.uuid4()),
                "event": event_type,
                "timestamp": int(time.time()),
                "workspace_id": str(workspace_id),
                "data": payload_data,
            }
            payload_bytes = json.dumps(full_payload).encode("utf-8")
            ts = int(time.time())
            sig = cls.generate_signature(sub.secret_key, payload_bytes, ts)

            headers = {
                "Content-Type": "application/json",
                "User-Agent": "Weirwise-Webhook-Dispatcher/1.0",
                "X-Weirwise-Signature": sig,
                "X-Weirwise-Event": event_type,
            }

            status_str = "delivered"
            err_msg = None
            code = 200

            try:
                async with httpx.AsyncClient(timeout=8.0, follow_redirects=False) as client:
                    resp = await client.post(sub.target_url, content=payload_bytes, headers=headers)
                    code = resp.status_code
                    if resp.status_code >= 400:
                        status_str = "failed"
                        err_msg = f"HTTP status {resp.status_code}: {resp.text[:200]}"
            except Exception as e:
                status_str = "failed"
                err_msg = str(e)
                code = 0

            delivery = WebhookDelivery(
                subscription_id=sub.id,
                event_type=event_type,
                payload=full_payload,
                response_code=code,
                status=status_str,
                error_message=err_msg,
            )
            db.add(delivery)
            deliveries.append(delivery)

        await db.commit()
        return deliveries


webhook_dispatcher = WebhookDispatcher()
