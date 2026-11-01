"""Intelligent AI Provider Credential Pool, Routing, and Failover Engine."""

import datetime
import logging
import random
from typing import Optional

from backend.app.models.admin import (
    CredentialHealthStatus,
    ProviderAccount,
    ProviderCredential,
    ProviderRoutingStrategy,
    TokenCostLedger,
)
from backend.app.services.vault import decrypt_credential_secret
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class RoutingResolution:
    def __init__(self, credential: ProviderCredential, raw_secret: str):
        self.credential = credential
        self.raw_secret = raw_secret


def _ensure_utc(dt: Optional[datetime.datetime]) -> Optional[datetime.datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.timezone.utc)
    return dt


class IntelligentRoutingEngine:
    """Selects optimal healthy credentials based on configured policy, health, budgets, and rates."""

    @staticmethod
    async def select_credential(
        db: AsyncSession,
        provider_name: str,
        model_name: Optional[str] = None,
    ) -> Optional[RoutingResolution]:
        """Resolves the best available credential under current health, cooldown, and routing policies."""
        now = datetime.datetime.now(datetime.timezone.utc)

        # 1. Fetch provider account
        p_stmt = select(ProviderAccount).where(
            ProviderAccount.provider_name == provider_name,
            ProviderAccount.is_enabled.is_(True),
        )
        p_res = await db.execute(p_stmt)
        provider = p_res.scalar_one_or_none()
        if not provider:
            logger.warning(f"Provider {provider_name} is disabled or does not exist.")
            return None

        # 2. Check global budget
        if provider.current_month_spend_usd >= provider.global_monthly_budget_usd:
            logger.error(f"Global monthly budget exceeded for provider {provider_name}.")
            return None

        # 3. Fetch candidate credentials
        c_stmt = (
            select(ProviderCredential)
            .where(
                ProviderCredential.provider_id == provider.id,
                ProviderCredential.is_active.is_(True),
            )
            .order_by(ProviderCredential.priority.desc())
        )
        c_res = await db.execute(c_stmt)
        candidates = c_res.scalars().all()
        if not candidates:
            return None

        # 4. Filter by health & cooldown
        eligible: list[ProviderCredential] = []
        for cred in candidates:
            # Check model constraint
            if model_name and cred.models_allowed and len(cred.models_allowed) > 0:
                if model_name not in cred.models_allowed:
                    continue

            # Check individual budget
            if cred.current_month_spend_usd >= cred.monthly_budget_usd:
                continue

            # Auto-recover cooldown if time passed
            cred_cooling = _ensure_utc(cred.cooling_down_until)
            if cred_cooling and cred_cooling <= now:
                cred.cooling_down_until = None
                cred.health_status = CredentialHealthStatus.HEALTHY.value
                cred.consecutive_failures = 0

            if cred.health_status in (
                CredentialHealthStatus.HEALTHY.value,
                CredentialHealthStatus.DEGRADED.value,
            ):
                eligible.append(cred)

        if not eligible:
            logger.warning(f"No eligible credentials in pool for provider {provider_name}")
            return None

        # 5. Apply Routing Strategy
        strategy = provider.default_routing_strategy
        selected: ProviderCredential

        if strategy == ProviderRoutingStrategy.ROUND_ROBIN.value:
            # Order by least recently used
            eligible.sort(
                key=lambda c: _ensure_utc(c.last_used_at) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
            )
            selected = eligible[0]

        elif strategy == ProviderRoutingStrategy.WEIGHTED.value:
            # Weighted random selection based on routing_weight
            weights = [max(c.routing_weight, 1) for c in eligible]
            selected = random.choices(eligible, weights=weights, k=1)[0]

        elif strategy == ProviderRoutingStrategy.LOWEST_COST.value:
            # Prefer credentials with lowest spend utilization ratio
            eligible.sort(key=lambda c: c.current_month_spend_usd / max(float(c.monthly_budget_usd), 1.0))
            selected = eligible[0]

        else:
            # Default Priority-based
            highest_priority = eligible[0].priority
            top_tier = [c for c in eligible if c.priority == highest_priority]
            top_tier.sort(
                key=lambda c: _ensure_utc(c.last_used_at) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
            )
            selected = top_tier[0]

        # Update last used timestamp
        selected.last_used_at = now
        selected.total_requests_served += 1
        await db.commit()

        raw_secret = decrypt_credential_secret(selected.encrypted_secret)
        return RoutingResolution(credential=selected, raw_secret=raw_secret)

    @staticmethod
    async def record_failure(
        db: AsyncSession,
        credential_id: str,
        error_type: str,
        reason: str,
        is_rate_limit: bool = False,
    ) -> None:
        """Records an execution failure and triggers backoff or cooldown."""
        now = datetime.datetime.now(datetime.timezone.utc)
        stmt = select(ProviderCredential).where(ProviderCredential.id == credential_id)
        res = await db.execute(stmt)
        cred = res.scalar_one_or_none()
        if not cred:
            return

        cred.consecutive_failures += 1
        cred.last_error_reason = reason[:255]

        if is_rate_limit:
            # 60s cooldown for 429 rate limits
            cred.health_status = CredentialHealthStatus.RATE_LIMITED.value
            cred.cooling_down_until = now + datetime.timedelta(seconds=60)
            logger.warning(f"Credential {cred.label} rate limited; cooling down for 60s.")
        elif cred.consecutive_failures >= 3:
            # Degrade or fail on consecutive errors
            cred.health_status = CredentialHealthStatus.FAILED.value
            cred.cooling_down_until = now + datetime.timedelta(seconds=300)
            logger.error(f"Credential {cred.label} reached 3 failures; circuit broken for 5m.")
        else:
            cred.health_status = CredentialHealthStatus.DEGRADED.value

        await db.commit()

    @staticmethod
    async def record_success(
        db: AsyncSession,
        credential_id: str,
        workspace_id: str,
        provider_name: str,
        model_name: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
        latency_ms: int,
    ) -> None:
        """Records ledger usage, spend increments, and resets failure streak."""
        stmt = select(ProviderCredential).where(ProviderCredential.id == credential_id)
        res = await db.execute(stmt)
        cred = res.scalar_one_or_none()
        if cred:
            cred.consecutive_failures = 0
            cred.health_status = CredentialHealthStatus.HEALTHY.value
            cred.current_month_spend_usd = float(cred.current_month_spend_usd) + cost_usd
            cred.total_tokens_served += input_tokens + output_tokens

        # Increment provider account spend
        p_stmt = select(ProviderAccount).where(ProviderAccount.provider_name == provider_name)
        p_res = await db.execute(p_stmt)
        provider = p_res.scalar_one_or_none()
        if provider:
            provider.current_month_spend_usd = float(provider.current_month_spend_usd) + cost_usd

        # Record audit ledger entry
        total_tokens = input_tokens + output_tokens
        ledger_entry = TokenCostLedger(
            workspace_id=workspace_id,
            credential_id=credential_id,
            provider_name=provider_name,
            model_name=model_name,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
            is_success=True,
        )
        db.add(ledger_entry)
        await db.commit()
