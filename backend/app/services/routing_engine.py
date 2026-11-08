"""Intelligent AI Provider Credential Pool, Routing, and Failover Engine."""

import datetime
import logging
import random
import re
import uuid
from typing import Optional

from backend.app.models.admin import (
    AdminControlSettings,
    CredentialHealthStatus,
    ProviderAccount,
    ProviderCredential,
    ProviderRoutingStrategy,
    RoutingEvent,
    RoutingEventOutcome,
    TokenCostLedger,
)
from backend.app.services.routing_state import routing_state
from backend.app.services.vault import decrypt_credential_secret
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_SECRET_LIKE = re.compile(
    r"(sk-[A-Za-z0-9_\-]{8,}|jina_[A-Za-z0-9]{8,}|AIza[A-Za-z0-9_\-]{10,}|Bearer\s+[A-Za-z0-9._\-]{8,}|Token\s+[A-Za-z0-9._\-]{8,})"
)


def _redact(message: str) -> str:
    return _SECRET_LIKE.sub("[redacted]", message)


class RoutingResolution:
    def __init__(
        self,
        credential: ProviderCredential,
        raw_secret: str,
        routing_id: str,
        routing_mode: str,
        strategy: str,
        decision_reason: str,
        attempt_number: int = 1,
        is_failover: bool = False,
        limiter_keys: tuple[str, ...] = (),
    ):
        self.credential = credential
        self.raw_secret = raw_secret
        self.routing_id = routing_id
        self.routing_mode = routing_mode
        self.strategy = strategy
        self.decision_reason = decision_reason
        self.attempt_number = attempt_number
        self.is_failover = is_failover
        self.limiter_keys = limiter_keys


def _ensure_utc(dt: Optional[datetime.datetime]) -> Optional[datetime.datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.timezone.utc)
    return dt


def _strategy_label(provider: ProviderAccount, control: Optional[AdminControlSettings], automatic: bool) -> str:
    if not automatic:
        return "manual"
    if control and not control.automatic_failover:
        return "priority_no_failover"
    return provider.default_routing_strategy or ProviderRoutingStrategy.PRIORITY.value


def _classify_health(cred: ProviderCredential, now: datetime.datetime, automatic: bool, control) -> str:
    """Return a human-readable reason for skipping or selecting a credential."""
    cooling = _ensure_utc(cred.cooling_down_until)
    if cooling and cooling > now:
        return f"cooling_down_until={cooling.isoformat()}"
    if cred.health_status == CredentialHealthStatus.FAILED.value:
        return "health=failed"
    if cred.health_status == CredentialHealthStatus.EXHAUSTED.value:
        return "health=exhausted"
    return ""


def _credential_state_key(credential_id: object) -> str:
    return f"cred:{credential_id}"


def _account_state_key(provider_id: object) -> str:
    return f"acct:{provider_id}"


def _normalize_failure_category(error_category: Optional[str], error_type: Optional[str], is_rate_limit: bool) -> str:
    raw = f"{error_category or ''} {error_type or ''}".strip().lower()
    if is_rate_limit or "rate_limit" in raw or "ratelimit" in raw or "429" in raw:
        return "rate_limit"
    if "quota" in raw or "exhaust" in raw or "insufficient" in raw or "billing" in raw or "credit" in raw:
        return "quota"
    if "auth" in raw or "401" in raw or "403" in raw or "permission" in raw or "forbidden" in raw:
        return "auth"
    if "invalid" in raw or "bad_request" in raw or "400" in raw or "404" in raw or "422" in raw:
        return "invalid_request"
    if "timeout" in raw or "timed out" in raw or "408" in raw or "504" in raw:
        return "timeout"
    if "connection" in raw or "network" in raw or "503" in raw:
        return "connection"
    if "empty_response" in raw:
        return "empty_response"
    if "provider" in raw or "server" in raw or raw.startswith("5"):
        return "provider"
    return "unknown"


def _jittered_seconds(seconds: int, ratio: float = 0.2) -> int:
    """Spread cooldown expiry so a recovered pool does not stampede the provider."""
    base = max(int(seconds), 1)
    return max(1, int(base * (1.0 + random.uniform(-ratio, ratio))))


class IntelligentRoutingEngine:
    """Selects optimal healthy credentials based on configured policy, health, budgets, and rates."""

    @staticmethod
    async def select_credential(
        db: AsyncSession,
        provider_name: str,
        model_name: Optional[str] = None,
        *,
        user_id: Optional[str] = None,
        exclude_ids: Optional[set[str]] = None,
        attempt_number: int = 1,
        is_failover: bool = False,
        estimated_tokens: int = 0,
        reserve_slot: bool = False,
    ) -> Optional[RoutingResolution]:
        """Resolves the best available credential under current health, cooldown, and routing policies.

        When ``reserve_slot`` is true, the selected credential's concurrency slot
        and rate windows are reserved atomically. Callers must release
        ``resolution.limiter_keys`` when the provider call finishes.
        """
        now = datetime.datetime.now(datetime.timezone.utc)
        exclude = exclude_ids or set()

        # 1. Fetch provider account
        p_res = await db.execute(select(ProviderAccount).where(ProviderAccount.provider_name == provider_name))
        provider = p_res.scalar_one_or_none()
        if provider is None:
            # Not configured at all: not a routing decision, so do not pollute the event trail.
            logger.debug(f"Provider {provider_name} is not configured.")
            return None
        if not provider.is_enabled:
            logger.warning(f"Provider {provider_name} is disabled.")
            await IntelligentRoutingEngine._record_no_credential(
                db, provider_name, model_name, user_id, "provider_disabled"
            )
            return None
        if model_name and provider.supported_models and model_name not in provider.supported_models:
            logger.warning("Requested model is not enabled for the configured provider.")
            await IntelligentRoutingEngine._record_no_credential(
                db, provider_name, model_name, user_id, f"model_not_allowed:{model_name}"
            )
            return None

        control = (
            await db.execute(select(AdminControlSettings).where(AdminControlSettings.id == 1))
        ).scalar_one_or_none()
        if control and control.emergency_stop:
            logger.error("Provider routing blocked by the admin emergency stop.")
            await IntelligentRoutingEngine._record_no_credential(
                db, provider_name, model_name, user_id, "emergency_stop"
            )
            return None

        automatic_mode = bool(control and control.management_mode == "automatic")

        # 2. Check global budget
        if provider.current_month_spend_usd >= provider.global_monthly_budget_usd:
            logger.error(f"Global monthly budget exceeded for provider {provider_name}.")
            await IntelligentRoutingEngine._record_no_credential(
                db, provider_name, model_name, user_id, "global_budget_exceeded"
            )
            return None

        # 2b. Account-wide limits are shared by every token. They are checked
        # before token selection so rotation can never bypass them.
        account_key = _account_state_key(provider.id)
        account_rpm = int(provider.account_rate_limit_rpm or 0)
        account_tpm = int(provider.account_rate_limit_tpm or 0)
        account_max_concurrency = int(provider.account_max_concurrency or 0)
        account_block_reason = ""
        if account_rpm > 0 and routing_state.rate_limit_retry_after(account_key, account_rpm) > 0:
            account_block_reason = "provider_account_rpm_limit"
        elif account_tpm > 0 and routing_state.token_limit_retry_after(account_key, account_tpm, estimated_tokens) > 0:
            account_block_reason = "provider_account_tpm_limit"
        elif not routing_state.concurrency_available(account_key, account_max_concurrency):
            account_block_reason = "provider_account_concurrency_limit"
        if account_block_reason:
            logger.warning(f"Provider account-wide limit blocked routing for {provider_name}.")
            await IntelligentRoutingEngine._record_no_credential(
                db, provider_name, model_name, user_id, account_block_reason
            )
            return None

        # 3. Fetch candidate credentials
        c_stmt = (
            select(ProviderCredential)
            .where(
                ProviderCredential.provider_id == provider.id,
                ProviderCredential.is_active.is_(True),
            )
            .order_by(ProviderCredential.priority.asc())
        )
        c_res = await db.execute(c_stmt)
        candidates = c_res.scalars().all()
        if not candidates:
            await IntelligentRoutingEngine._record_no_credential(
                db, provider_name, model_name, user_id, "no_active_credentials"
            )
            return None

        # 4. Filter by health, cooldown, budgets, and per-token rate limits
        request_candidates: list[ProviderCredential] = []
        eligible: list[ProviderCredential] = []
        skipped: list[str] = []
        for cred in candidates:
            if str(cred.id) in exclude:
                skipped.append(f"{cred.label}:excluded_after_failure")
                continue

            if model_name and cred.models_allowed and len(cred.models_allowed) > 0:
                if model_name not in cred.models_allowed:
                    skipped.append(f"{cred.label}:model_not_allowed")
                    continue

            if cred.current_month_spend_usd >= cred.monthly_budget_usd:
                skipped.append(f"{cred.label}:credential_budget_exceeded")
                continue

            request_candidates.append(cred)

            # Auto-recover cooldown if time passed
            cred_cooling = _ensure_utc(cred.cooling_down_until)
            if automatic_mode and control and control.auto_recover_credentials and cred_cooling and cred_cooling <= now:
                cred.cooling_down_until = None
                cred.health_status = CredentialHealthStatus.HEALTHY.value
                cred.consecutive_failures = 0

            health_reason = _classify_health(cred, now, automatic_mode, control)
            if health_reason:
                skipped.append(f"{cred.label}:{health_reason}")
                continue

            if cred.health_status in (
                CredentialHealthStatus.HEALTHY.value,
                CredentialHealthStatus.DEGRADED.value,
            ):
                eligible.append(cred)
            else:
                skipped.append(f"{cred.label}:health={cred.health_status}")

        if not eligible:
            logger.warning(f"No eligible credentials in pool for provider {provider_name}")
            await IntelligentRoutingEngine._record_no_credential(
                db,
                provider_name,
                model_name,
                user_id,
                "; ".join(skipped[-6:]) or "no_eligible_credentials",
            )
            return None

        # 5. Respect per-token RPM/TPM and concurrency limits before selection.
        rate_safe: list[ProviderCredential] = []
        for cred in eligible:
            cred_key = _credential_state_key(cred.id)
            rpm_retry_after = routing_state.rate_limit_retry_after(cred_key, int(cred.rate_limit_rpm or 0))
            tpm_retry_after = routing_state.token_limit_retry_after(
                cred_key, int(cred.rate_limit_tpm or 0), estimated_tokens
            )
            if rpm_retry_after > 0:
                skipped.append(f"{cred.label}:local_rpm_limit(retry_after={rpm_retry_after}s)")
                continue
            if tpm_retry_after > 0:
                skipped.append(f"{cred.label}:local_tpm_limit(retry_after={tpm_retry_after}s)")
                continue
            if not routing_state.concurrency_available(cred_key, int(cred.max_concurrency or 0)):
                skipped.append(f"{cred.label}:concurrency_limit")
                continue
            rate_safe.append(cred)
        if not rate_safe:
            await IntelligentRoutingEngine._record_no_credential(
                db, provider_name, model_name, user_id, "all_credentials_rate_limited"
            )
            return None
        eligible = rate_safe

        strategy = _strategy_label(provider, control, automatic_mode)
        selected: ProviderCredential
        reason: str
        limiter_keys: tuple[str, ...] = ()

        while True:
            # Manual mode pins the highest-priority token and never rotates:
            # if it is unhealthy or reserved, routing fails rather than silently
            # spending a different account token.
            if not automatic_mode:
                manual_pool = [
                    credential
                    for credential in candidates
                    if (not model_name or not credential.models_allowed or model_name in credential.models_allowed)
                    and credential.current_month_spend_usd < credential.monthly_budget_usd
                ]
                selected = min(manual_pool, key=lambda credential: credential.priority)
                if selected not in eligible or str(selected.id) in exclude:
                    logger.warning("Manual mode pinned token is unavailable; no automatic rotation performed.")
                    await IntelligentRoutingEngine._record_no_credential(
                        db,
                        provider_name,
                        model_name,
                        user_id,
                        "primary_unavailable_manual_mode",
                    )
                    return None
                reason = f"manual_priority={selected.priority}"
            elif control and not control.automatic_failover:
                selected = min(request_candidates, key=lambda credential: credential.priority)
                if selected not in eligible:
                    logger.warning("Automatic failover is disabled and the primary credential is unavailable.")
                    await IntelligentRoutingEngine._record_no_credential(
                        db,
                        provider_name,
                        model_name,
                        user_id,
                        "primary_unavailable_automatic_failover_disabled",
                    )
                    return None
                reason = f"priority_no_failover={selected.priority}"
            elif strategy == ProviderRoutingStrategy.ROUND_ROBIN.value:
                eligible.sort(
                    key=lambda c: (
                        c.total_requests_served,
                        _ensure_utc(c.last_used_at) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
                    )
                )
                selected = eligible[0]
                reason = f"round_robin(served={selected.total_requests_served})"
            elif strategy == ProviderRoutingStrategy.LEAST_RECENTLY_USED.value:
                eligible.sort(
                    key=lambda c: (
                        _ensure_utc(c.last_used_at) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
                    )
                )
                selected = eligible[0]
                reason = "least_recently_used"
            elif strategy == ProviderRoutingStrategy.WEIGHTED.value:
                weights = [max(c.routing_weight, 1) for c in eligible]
                selected = random.choices(eligible, weights=weights, k=1)[0]
                reason = f"weighted(weight={selected.routing_weight})"
            elif strategy == ProviderRoutingStrategy.LEAST_LOADED.value:
                eligible.sort(
                    key=lambda c: (
                        routing_state.in_flight(_credential_state_key(c.id)),
                        c.priority,
                        _ensure_utc(c.last_used_at) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
                    )
                )
                selected = eligible[0]
                reason = f"least_loaded(in_flight={routing_state.in_flight(_credential_state_key(selected.id))})"
            elif strategy == ProviderRoutingStrategy.LOWEST_COST.value:
                eligible.sort(key=lambda c: c.current_month_spend_usd / max(float(c.monthly_budget_usd), 1.0))
                selected = eligible[0]
                reason = "lowest_spend_utilization"
            else:
                highest_priority = eligible[0].priority
                top_tier = [c for c in eligible if c.priority == highest_priority]
                top_tier.sort(
                    key=lambda c: (
                        _ensure_utc(c.last_used_at) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
                    )
                )
                selected = top_tier[0]
                reason = f"priority={selected.priority}"

            if not reserve_slot:
                break

            cred_key = _credential_state_key(selected.id)
            rpm_limits: dict[str, int] = {}
            tpm_limits: dict[str, tuple[int, int]] = {}
            if int(selected.rate_limit_rpm or 0) > 0:
                rpm_limits[cred_key] = int(selected.rate_limit_rpm)
            if account_rpm > 0:
                rpm_limits[account_key] = account_rpm
            if int(selected.rate_limit_tpm or 0) > 0:
                tpm_limits[cred_key] = (int(selected.rate_limit_tpm), estimated_tokens)
            if account_tpm > 0:
                tpm_limits[account_key] = (account_tpm, estimated_tokens)

            reserved, limit_reason = routing_state.reserve(
                concurrency_limits={
                    cred_key: int(selected.max_concurrency or 0),
                    account_key: account_max_concurrency,
                },
                rpm_limits=rpm_limits,
                tpm_limits=tpm_limits,
            )
            if reserved:
                limiter_keys = (cred_key, account_key)
                break

            skipped.append(f"{selected.label}:reservation_{limit_reason}")
            eligible = [credential for credential in eligible if credential.id != selected.id]
            if not automatic_mode or (control and not control.automatic_failover):
                await IntelligentRoutingEngine._record_no_credential(
                    db,
                    provider_name,
                    model_name,
                    user_id,
                    f"primary_{limit_reason}_limit_manual_no_rotation",
                )
                return None
            if not eligible:
                await IntelligentRoutingEngine._record_no_credential(
                    db, provider_name, model_name, user_id, f"all_credentials_{limit_reason}_limited"
                )
                return None

        if not reserve_slot:
            routing_state.record_request(_credential_state_key(selected.id))
            if account_rpm > 0:
                routing_state.record_request(account_key)

        routing_id = str(uuid.uuid4())
        selected.last_used_at = now
        selected.total_requests_served += 1
        db.add(
            RoutingEvent(
                routing_id=routing_id,
                user_id=uuid.UUID(user_id) if user_id else None,
                provider_name=provider_name,
                model_name=model_name,
                credential_id=selected.id,
                credential_label=selected.label,
                key_prefix=selected.key_prefix,
                routing_mode="automatic" if automatic_mode else "manual",
                strategy=strategy,
                decision_reason=reason[:255],
                attempt_number=attempt_number,
                is_failover=is_failover,
                outcome=RoutingEventOutcome.SELECTED.value,
            )
        )
        await db.commit()

        raw_secret = decrypt_credential_secret(selected.encrypted_secret)
        return RoutingResolution(
            credential=selected,
            raw_secret=raw_secret,
            routing_id=routing_id,
            routing_mode="automatic" if automatic_mode else "manual",
            strategy=strategy,
            decision_reason=reason,
            attempt_number=attempt_number,
            is_failover=is_failover,
            limiter_keys=limiter_keys,
        )

    @staticmethod
    async def explain_selection(
        db: AsyncSession,
        provider_name: str,
        model_name: Optional[str] = None,
    ) -> dict:
        """Describe which credential would be selected without changing counters or events."""
        now = datetime.datetime.now(datetime.timezone.utc)
        provider = (
            await db.execute(
                select(ProviderAccount).where(
                    ProviderAccount.provider_name == provider_name,
                    ProviderAccount.is_enabled.is_(True),
                )
            )
        ).scalar_one_or_none()
        if not provider:
            return {"available": False, "reason": "provider_disabled_or_missing"}

        control = (
            await db.execute(select(AdminControlSettings).where(AdminControlSettings.id == 1))
        ).scalar_one_or_none()
        automatic = bool(control and control.management_mode == "automatic")
        strategy = _strategy_label(provider, control, automatic)

        if control and control.emergency_stop:
            return {
                "available": False,
                "mode": "automatic" if automatic else "manual",
                "strategy": strategy,
                "reason": "emergency_stop",
            }
        if model_name and provider.supported_models and model_name not in provider.supported_models:
            return {
                "available": False,
                "mode": "automatic" if automatic else "manual",
                "strategy": strategy,
                "reason": f"model_not_allowed:{model_name}",
            }
        if provider.current_month_spend_usd >= provider.global_monthly_budget_usd:
            return {
                "available": False,
                "mode": "automatic" if automatic else "manual",
                "strategy": strategy,
                "reason": "global_budget_exceeded",
            }

        account_key = _account_state_key(provider.id)
        account_rpm = int(provider.account_rate_limit_rpm or 0)
        account_tpm = int(provider.account_rate_limit_tpm or 0)
        if account_rpm > 0 and routing_state.rate_limit_retry_after(account_key, account_rpm) > 0:
            return {
                "available": False,
                "mode": "automatic" if automatic else "manual",
                "strategy": strategy,
                "reason": "provider_account_rpm_limit",
            }
        if account_tpm > 0 and routing_state.token_limit_retry_after(account_key, account_tpm, 0) > 0:
            return {
                "available": False,
                "mode": "automatic" if automatic else "manual",
                "strategy": strategy,
                "reason": "provider_account_tpm_limit",
            }
        if not routing_state.concurrency_available(account_key, int(provider.account_max_concurrency or 0)):
            return {
                "available": False,
                "mode": "automatic" if automatic else "manual",
                "strategy": strategy,
                "reason": "provider_account_concurrency_limit",
            }

        creds = (
            (
                await db.execute(
                    select(ProviderCredential)
                    .where(
                        ProviderCredential.provider_id == provider.id,
                        ProviderCredential.is_active.is_(True),
                    )
                    .order_by(ProviderCredential.priority.asc())
                )
            )
            .scalars()
            .all()
        )
        healthy = []
        for cred in creds:
            cooling = _ensure_utc(cred.cooling_down_until)
            if model_name and cred.models_allowed and model_name not in cred.models_allowed:
                continue
            if cred.current_month_spend_usd >= cred.monthly_budget_usd:
                continue
            cred_key = _credential_state_key(cred.id)
            if routing_state.rate_limit_retry_after(cred_key, int(cred.rate_limit_rpm or 0)) > 0:
                continue
            if routing_state.token_limit_retry_after(cred_key, int(cred.rate_limit_tpm or 0), 0) > 0:
                continue
            if not routing_state.concurrency_available(cred_key, int(cred.max_concurrency or 0)):
                continue
            if cred.health_status in (
                CredentialHealthStatus.HEALTHY.value,
                CredentialHealthStatus.DEGRADED.value,
            ) and not (cooling and cooling > now):
                healthy.append(cred)
        if not healthy:
            return {
                "available": False,
                "mode": "automatic" if automatic else "manual",
                "strategy": strategy,
                "reason": "no_healthy_credentials",
            }

        if not automatic:
            candidate = min(healthy, key=lambda c: c.priority)
            reason = f"manual_priority={candidate.priority}"
        elif control and not control.automatic_failover:
            candidate = min(healthy, key=lambda c: c.priority)
            reason = f"priority_no_failover={candidate.priority}"
        elif strategy == ProviderRoutingStrategy.ROUND_ROBIN.value:
            candidate = min(
                healthy,
                key=lambda c: (
                    c.total_requests_served,
                    _ensure_utc(c.last_used_at) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
                ),
            )
            reason = f"round_robin(served={candidate.total_requests_served})"
        elif strategy == ProviderRoutingStrategy.LEAST_RECENTLY_USED.value:
            candidate = min(
                healthy,
                key=lambda c: (
                    _ensure_utc(c.last_used_at) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
                ),
            )
            reason = "least_recently_used"
        elif strategy == ProviderRoutingStrategy.LEAST_LOADED.value:
            candidate = min(
                healthy,
                key=lambda c: (routing_state.in_flight(_credential_state_key(c.id)), c.priority),
            )
            reason = f"least_loaded(in_flight={routing_state.in_flight(_credential_state_key(candidate.id))})"
        elif strategy == ProviderRoutingStrategy.LOWEST_COST.value:
            candidate = min(
                healthy,
                key=lambda c: c.current_month_spend_usd / max(float(c.monthly_budget_usd), 1.0),
            )
            reason = "lowest_spend_utilization"
        elif strategy == ProviderRoutingStrategy.WEIGHTED.value:
            reason = "weighted(probabilistic)"
            candidate = healthy[0]
        else:
            candidate = min(
                healthy,
                key=lambda c: (
                    c.priority,
                    _ensure_utc(c.last_used_at) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
                ),
            )
            reason = f"priority={candidate.priority}"

        return {
            "available": True,
            "mode": "automatic" if automatic else "manual",
            "strategy": strategy,
            "reason": reason,
            "credential_id": str(candidate.id),
            "credential_label": candidate.label,
            "key_prefix": candidate.key_prefix,
            "health_status": candidate.health_status,
            "eligible_count": len(healthy),
        }

    @staticmethod
    async def _record_no_credential(
        db: AsyncSession,
        provider_name: str,
        model_name: Optional[str],
        user_id: Optional[str],
        reason: str,
    ) -> None:
        control = (
            await db.execute(select(AdminControlSettings).where(AdminControlSettings.id == 1))
        ).scalar_one_or_none()
        db.add(
            RoutingEvent(
                routing_id=str(uuid.uuid4()),
                user_id=uuid.UUID(user_id) if user_id else None,
                provider_name=provider_name,
                model_name=model_name,
                routing_mode="automatic" if control and control.management_mode == "automatic" else "manual",
                strategy="none",
                decision_reason=reason[:255],
                outcome=RoutingEventOutcome.NO_CREDENTIAL.value,
            )
        )
        await db.commit()

    @staticmethod
    async def record_failure(
        db: AsyncSession,
        credential_id: str,
        error_type: str,
        reason: str,
        is_rate_limit: bool = False,
        *,
        routing_id: Optional[str] = None,
        error_category: Optional[str] = None,
        retry_after_seconds: Optional[int] = None,
        latency_ms: int = 0,
    ) -> None:
        """Records an execution failure and triggers backoff or cooldown."""
        now = datetime.datetime.now(datetime.timezone.utc)
        stmt = select(ProviderCredential).where(ProviderCredential.id == credential_id)
        res = await db.execute(stmt)
        cred = res.scalar_one_or_none()

        control = (
            await db.execute(select(AdminControlSettings).where(AdminControlSettings.id == 1))
        ).scalar_one_or_none()
        automatic = bool(control and control.management_mode == "automatic")
        category = _normalize_failure_category(error_category, error_type, is_rate_limit)

        if cred:
            cred.last_failure_at = now
            cred.last_health_check_at = now
            if control is None or not automatic:
                logger.warning("Credential failure observed in manual mode; no automatic health changes applied.")
            elif category == "invalid_request":
                # A malformed request or missing model is not a token fault, so
                # the credential stays in rotation and is never penalized.
                cred.last_error_reason = _redact(reason)[:255]
            elif not control.auto_disable_unhealthy:
                cred.consecutive_failures += 1
                cred.last_error_reason = _redact(reason)[:255]
                cred.health_status = CredentialHealthStatus.DEGRADED.value
            elif category == "auth":
                cred.consecutive_failures += 1
                cred.last_error_reason = _redact(reason)[:255]
                cred.health_status = CredentialHealthStatus.FAILED.value
                cred.cooling_down_until = None
                cred.is_active = False
                logger.error("A provider credential was rejected by the provider and disabled pending admin review.")
            elif category == "quota":
                cred.consecutive_failures += 1
                cred.last_error_reason = _redact(reason)[:255]
                cred.health_status = CredentialHealthStatus.EXHAUSTED.value
                if retry_after_seconds:
                    cooldown = max(int(retry_after_seconds), control.rate_limit_cooldown_seconds)
                    cred.cooling_down_until = now + datetime.timedelta(
                        seconds=max(int(retry_after_seconds), _jittered_seconds(cooldown))
                    )
                    logger.warning(
                        "A provider credential exhausted its quota and is cooling down until the reset window."
                    )
                else:
                    cred.cooling_down_until = None
                    cred.is_active = False
                    logger.error("A provider credential exhausted its quota with no reset window and was disabled.")
            elif category == "rate_limit":
                cred.consecutive_failures += 1
                cred.last_error_reason = _redact(reason)[:255]
                cooldown = max(control.rate_limit_cooldown_seconds, retry_after_seconds or 0)
                cred.health_status = CredentialHealthStatus.RATE_LIMITED.value
                cred.cooling_down_until = now + datetime.timedelta(
                    seconds=max(retry_after_seconds or 0, _jittered_seconds(cooldown))
                )
                logger.warning("A provider credential was rate limited and placed on a temporary cooldown.")
            else:
                cred.consecutive_failures += 1
                cred.last_error_reason = _redact(reason)[:255]
                if cred.consecutive_failures >= control.circuit_breaker_failure_threshold:
                    cooldown = max(control.circuit_breaker_cooldown_seconds, retry_after_seconds or 0)
                    cred.health_status = CredentialHealthStatus.FAILED.value
                    cred.cooling_down_until = now + datetime.timedelta(
                        seconds=max(retry_after_seconds or 0, _jittered_seconds(cooldown))
                    )
                    logger.error("A provider credential exceeded its failure threshold and entered cooldown.")
                else:
                    cred.health_status = CredentialHealthStatus.DEGRADED.value

        if routing_id:
            events = (
                (await db.execute(select(RoutingEvent).where(RoutingEvent.routing_id == routing_id))).scalars().all()
            )
            for event in events:
                event.outcome = RoutingEventOutcome.FAILURE.value
                event.error_category = category[:50]
                event.error_message = _redact(reason)[:500]
                event.retry_after_seconds = retry_after_seconds
                event.latency_ms = latency_ms

        await db.commit()

    @staticmethod
    async def record_success_event(
        db: AsyncSession,
        credential_id: str,
        routing_id: str,
        latency_ms: int = 0,
    ) -> None:
        """Mark a routed call that has no token ledger entry (e.g. speech) as successful."""
        now = datetime.datetime.now(datetime.timezone.utc)
        cred = (
            await db.execute(select(ProviderCredential).where(ProviderCredential.id == credential_id))
        ).scalar_one_or_none()
        if cred:
            cred.consecutive_failures = 0
            cred.health_status = CredentialHealthStatus.HEALTHY.value
            cred.cooling_down_until = None
            cred.last_success_at = now
            cred.last_health_check_at = now

        events = (await db.execute(select(RoutingEvent).where(RoutingEvent.routing_id == routing_id))).scalars().all()
        for event in events:
            event.outcome = RoutingEventOutcome.SUCCESS.value
            event.latency_ms = latency_ms

        await db.commit()

    @staticmethod
    async def record_success(
        db: AsyncSession,
        credential_id: str,
        user_id: Optional[str] = None,
        provider_name: str = "",
        model_name: str = "",
        input_tokens: int = 0,
        output_tokens: int = 0,
        cost_usd: float = 0.0,
        latency_ms: int = 0,
        *,
        workspace_id: Optional[str] = None,
        routing_id: Optional[str] = None,
        cost_source: str = "estimated",
        reserved_input_tokens: int = 0,
    ) -> None:
        """Records ledger usage, spend increments, token windows, and resets failure streak."""
        now = datetime.datetime.now(datetime.timezone.utc)
        stmt = select(ProviderCredential).where(ProviderCredential.id == credential_id)
        res = await db.execute(stmt)
        cred = res.scalar_one_or_none()
        if cred:
            cred.consecutive_failures = 0
            cred.health_status = CredentialHealthStatus.HEALTHY.value
            cred.cooling_down_until = None
            cred.last_success_at = now
            cred.last_health_check_at = now
            cred.current_month_spend_usd = float(cred.current_month_spend_usd) + cost_usd
            cred.total_tokens_served += input_tokens + output_tokens

        # The selection step already reserved an input-token estimate; add the
        # difference plus the actual output so the TPM window stays accurate.
        tokens_to_record = max(0, input_tokens - max(0, reserved_input_tokens)) + output_tokens
        routing_state.record_tokens(_credential_state_key(credential_id), tokens_to_record)

        # Increment provider account spend
        p_stmt = select(ProviderAccount).where(ProviderAccount.provider_name == provider_name)
        p_res = await db.execute(p_stmt)
        provider = p_res.scalar_one_or_none()
        if provider:
            provider.current_month_spend_usd = float(provider.current_month_spend_usd) + cost_usd
            routing_state.record_tokens(_account_state_key(provider.id), tokens_to_record)

        # Record audit ledger entry
        total_tokens = input_tokens + output_tokens
        ledger_entry = TokenCostLedger(
            user_id=uuid.UUID(user_id) if user_id else (uuid.UUID(workspace_id) if workspace_id else None),
            credential_id=credential_id,
            provider_name=provider_name,
            model_name=model_name,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            cost_usd=cost_usd,
            cost_source=cost_source,
            latency_ms=latency_ms,
            is_success=True,
            routing_id=routing_id,
        )
        db.add(ledger_entry)

        if routing_id:
            events = (
                (await db.execute(select(RoutingEvent).where(RoutingEvent.routing_id == routing_id))).scalars().all()
            )
            for event in events:
                event.outcome = RoutingEventOutcome.SUCCESS.value
                event.latency_ms = latency_ms

        await db.commit()
