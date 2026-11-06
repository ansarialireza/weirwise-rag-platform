"""Super Admin API endpoints for Executive Control, AI Credentials, FinOps, and Auditing."""

import re
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import List, Optional

from backend.app.api.admin_deps import require_admin_role, require_admin_user
from backend.app.core.config import settings
from backend.app.db.session import get_db_session
from backend.app.models.admin import (
    AdminAuditLog,
    AdminControlSettings,
    AdminRole,
    AdminUserRole,
    FinancialInvoice,
    ProviderAccount,
    ProviderCredential,
    RoutingEvent,
    TokenCostLedger,
)
from backend.app.models.assistant import Assistant
from backend.app.models.auth import AIRoutingStrategy, Membership, SubscriptionTier, User, Workspace
from backend.app.models.project import Document, KnowledgeSource
from backend.app.schemas.admin import (
    AdminAccessResponse,
    AdminAuditLogResponse,
    AdminControlSettingsResponse,
    AdminControlSettingsUpdate,
    AdminUserStatusUpdate,
    AIRoutingStrategyCreate,
    AIRoutingStrategyResponse,
    AIRoutingStrategyUpdate,
    CredentialCreate,
    CredentialResponse,
    CredentialStatusUpdate,
    CredentialUpdate,
    CredentialUsageResponse,
    FinOpsSummaryResponse,
    ProviderAccountCreate,
    ProviderAccountResponse,
    ProviderAccountUpdate,
    ProviderTokensSaveRequest,
    ProviderTokenValidationRequest,
    RoutingEventResponse,
    SubscriptionTierCreate,
    SubscriptionTierResponse,
    SubscriptionTierUpdate,
    SystemMetricsResponse,
)
from backend.app.services.public_rate_limiter import PublicRateLimiter
from backend.app.services.vault import encrypt_credential_secret
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/admin", tags=["Super Admin Control Center"])


@router.get("/access", response_model=AdminAccessResponse)
async def get_admin_access(
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
) -> AdminAccessResponse:
    if current_admin.is_superuser:
        return AdminAccessResponse(is_admin=True, role=AdminRole.SUPER_ADMIN.value)

    role_assignment = (
        await db.execute(select(AdminUserRole).where(AdminUserRole.user_id == current_admin.id))
    ).scalar_one_or_none()
    if role_assignment is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return AdminAccessResponse(is_admin=True, role=role_assignment.role)


async def _get_control_settings(db: AsyncSession) -> AdminControlSettings:
    settings = (await db.execute(select(AdminControlSettings).where(AdminControlSettings.id == 1))).scalar_one_or_none()
    if settings is None:
        settings = AdminControlSettings(id=1)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


@router.get("/operations/settings", response_model=AdminControlSettingsResponse)
async def get_admin_control_settings(
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
) -> AdminControlSettings:
    return await _get_control_settings(db)


@router.patch("/operations/settings", response_model=AdminControlSettingsResponse)
async def update_admin_control_settings(
    payload: AdminControlSettingsUpdate,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
) -> AdminControlSettings:
    settings = await _get_control_settings(db)
    updates = payload.model_dump(exclude_unset=True)
    before = {key: getattr(settings, key) for key in updates}
    for key, value in updates.items():
        setattr(settings, key, value)
    settings.updated_by = current_admin.id

    audit = AdminAuditLog(
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        action="admin.operations.settings_updated",
        target_entity="admin_control_settings",
        target_id="1",
        details={"before": before, "after": updates},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(settings)
    return settings


@router.get("/metrics", response_model=SystemMetricsResponse)
async def get_system_metrics(
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Aggregates executive telemetry and system KPIs across persisted database entities."""
    # Count totals
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active_users = (await db.execute(select(func.count(User.id)).where(User.is_active.is_(True)))).scalar() or 0
    total_workspaces = (await db.execute(select(func.count(Workspace.id)))).scalar() or 0
    total_assistants = (await db.execute(select(func.count(Assistant.id)))).scalar() or 0
    total_sources = (await db.execute(select(func.count(KnowledgeSource.id)))).scalar() or 0
    total_documents = (await db.execute(select(func.count(Document.id)))).scalar() or 0

    # Token and AI Cost ledger metrics
    tokens_res = (await db.execute(select(func.sum(TokenCostLedger.total_tokens)))).scalar() or 0
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    cost_res = float(
        (
            await db.execute(
                select(func.sum(TokenCostLedger.cost_usd)).where(TokenCostLedger.created_at >= month_start)
            )
        ).scalar()
        or 0.0
    )

    # Current recurring revenue is based on active workspaces' persisted subscription tier.
    revenue_res = float(
        (
            await db.execute(
                select(func.sum(SubscriptionTier.monthly_price))
                .join(Workspace, Workspace.subscription_tier_id == SubscriptionTier.id)
                .where(Workspace.is_active.is_(True))
            )
        ).scalar()
        or 0.0
    )

    # Calculate Gross Margin
    gross_margin = 0.0
    if revenue_res > 0:
        gross_margin = ((revenue_res - cost_res) / revenue_res) * 100.0

    active_credentials = (
        await db.execute(
            select(func.count(ProviderCredential.id)).where(
                ProviderCredential.is_active.is_(True),
                ProviderCredential.health_status.in_(("healthy", "degraded")),
            )
        )
    ).scalar() or 0
    has_failed_credentials = (
        await db.execute(
            select(func.count(ProviderCredential.id)).where(
                ProviderCredential.is_active.is_(True),
                ProviderCredential.health_status.notin_(("healthy", "degraded")),
            )
        )
    ).scalar() or 0
    control_settings = (
        await db.execute(select(AdminControlSettings).where(AdminControlSettings.id == 1))
    ).scalar_one_or_none()
    system_health = "unconfigured" if not active_credentials else "configured"
    if has_failed_credentials or (control_settings and control_settings.emergency_stop):
        system_health = "degraded"

    return SystemMetricsResponse(
        total_users=total_users,
        active_users=active_users,
        total_workspaces=total_workspaces,
        total_assistants=total_assistants,
        total_sources=total_sources,
        total_documents=total_documents,
        total_tokens_consumed=tokens_res,
        total_ai_spend_usd=cost_res,
        monthly_recurring_revenue_usd=revenue_res,
        gross_margin_pct=round(gross_margin, 1),
        system_health=system_health,
    )


# --- AI Provider & Credential Management ---


@router.get("/providers", response_model=List[ProviderAccountResponse])
async def list_providers(
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Lists registered AI provider accounts."""
    stmt = select(ProviderAccount).order_by(ProviderAccount.created_at.asc())
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/providers", response_model=ProviderAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_provider(
    payload: ProviderAccountCreate,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Registers a new AI provider account (e.g. OpenAI, Anthropic, Gemini, OpenRouter)."""
    existing = (
        await db.execute(select(ProviderAccount).where(ProviderAccount.provider_name == payload.provider_name))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Provider account already exists.")

    provider = ProviderAccount(
        provider_name=payload.provider_name,
        display_name=payload.display_name,
        is_enabled=payload.is_enabled,
        default_routing_strategy=payload.default_routing_strategy,
        global_monthly_budget_usd=payload.global_monthly_budget_usd,
        supported_models=payload.supported_models,
        account_rate_limit_rpm=payload.account_rate_limit_rpm,
        account_rate_limit_tpm=payload.account_rate_limit_tpm,
        account_max_concurrency=payload.account_max_concurrency,
    )
    db.add(provider)
    await db.flush()

    # Log audit event
    audit = AdminAuditLog(
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        action="provider.create",
        target_entity="provider",
        target_id=str(provider.id),
        details={"provider_name": provider.provider_name},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(provider)

    return provider


@router.patch("/providers/{provider_id}", response_model=ProviderAccountResponse)
async def update_provider(
    provider_id: uuid.UUID,
    payload: ProviderAccountUpdate,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    provider = (await db.execute(select(ProviderAccount).where(ProviderAccount.id == provider_id))).scalar_one_or_none()
    if provider is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider account not found.")

    updates = payload.model_dump(exclude_unset=True)
    before = {
        field: str(value) if isinstance(value := getattr(provider, field), Decimal) else value for field in updates
    }
    for field, value in updates.items():
        setattr(provider, field, value)

    db.add(
        AdminAuditLog(
            actor_id=current_admin.id,
            actor_email=current_admin.email,
            action="provider.update",
            target_entity="provider",
            target_id=str(provider_id),
            details={"before": before, "after": updates},
        )
    )
    await db.commit()
    await db.refresh(provider)
    return provider


@router.get("/providers/{provider_id}/credentials", response_model=List[CredentialResponse])
async def list_credentials(
    provider_id: uuid.UUID,
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Lists credentials in vault for a provider, masking all secret keys."""
    stmt = select(ProviderCredential).where(ProviderCredential.provider_id == provider_id)
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post(
    "/providers/{provider_id}/credentials", response_model=CredentialResponse, status_code=status.HTTP_201_CREATED
)
async def add_credential(
    provider_id: uuid.UUID,
    payload: CredentialCreate,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Encrypts and registers a secret API key into the credential pool with zero plaintext storage."""
    provider = (await db.execute(select(ProviderAccount).where(ProviderAccount.id == provider_id))).scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found.")

    from backend.app.services.token_manager import TokenManager

    secret = payload.secret.get_secret_value()
    validation = await TokenManager.validate_provider_token(provider.provider_name, secret)
    if not validation.get("valid"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=validation.get("error", "Provider credential validation failed."),
        )

    encrypted, secret_hash, prefix = encrypt_credential_secret(secret)
    duplicate = (
        await db.execute(
            select(ProviderCredential.id).where(
                ProviderCredential.provider_id == provider.id,
                ProviderCredential.secret_hash == secret_hash,
            )
        )
    ).scalar_one_or_none()
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This provider credential already exists.")

    cred = ProviderCredential(
        provider_id=provider.id,
        label=payload.label,
        key_prefix=prefix,
        encrypted_secret=encrypted,
        secret_hash=secret_hash,
        priority=payload.priority,
        routing_weight=payload.routing_weight,
        models_allowed=payload.models_allowed,
        monthly_budget_usd=payload.monthly_budget_usd,
        rate_limit_rpm=payload.rate_limit_rpm,
        rate_limit_tpm=payload.rate_limit_tpm,
        max_concurrency=payload.max_concurrency,
        last_health_check_at=datetime.now(UTC),
    )
    db.add(cred)
    await db.flush()

    # Audit log (no secret stored)
    audit = AdminAuditLog(
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        action="credential.add",
        target_entity="credential",
        target_id=str(cred.id),
        details={"label": cred.label, "provider_id": str(provider_id)},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(cred)

    return cred


@router.patch("/credentials/{credential_id}/status", response_model=CredentialResponse)
async def update_credential_status(
    credential_id: uuid.UUID,
    payload: CredentialStatusUpdate,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    cred = (
        await db.execute(select(ProviderCredential).where(ProviderCredential.id == credential_id))
    ).scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found.")

    if payload.is_active:
        provider = await db.get(ProviderAccount, cred.provider_id)
        if provider is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Credential provider no longer exists.")
        from backend.app.services.token_manager import TokenManager
        from backend.app.services.vault import decrypt_credential_secret

        validation = await TokenManager.validate_provider_token(
            provider.provider_name,
            decrypt_credential_secret(cred.encrypted_secret),
        )
        if not validation.get("valid"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=validation.get("error", "Provider credential validation failed."),
            )
        cred.last_health_check_at = datetime.now(UTC)

    cred.is_active = payload.is_active
    if payload.is_active:
        cred.health_status = "healthy"
        cred.cooling_down_until = None
        cred.consecutive_failures = 0
        cred.last_error_reason = None
    else:
        cred.health_status = "disabled"

    db.add(
        AdminAuditLog(
            actor_id=current_admin.id,
            actor_email=current_admin.email,
            action="credential.activate" if payload.is_active else "credential.deactivate",
            target_entity="credential",
            target_id=str(credential_id),
            details={"label": cred.label, "is_active": payload.is_active},
        )
    )
    await db.commit()
    await db.refresh(cred)
    return cred


@router.delete("/credentials/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    credential_id: uuid.UUID,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Permanently purges a credential from the vault."""
    cred = (
        await db.execute(select(ProviderCredential).where(ProviderCredential.id == credential_id))
    ).scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found.")

    audit = AdminAuditLog(
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        action="credential.delete",
        target_entity="credential",
        target_id=str(credential_id),
        details={"label": cred.label},
    )
    await db.delete(cred)
    db.add(audit)
    await db.commit()


_SECRET_LIKE = re.compile(
    r"(sk-[A-Za-z0-9_\-]{8,}|jina_[A-Za-z0-9]{8,}|AIza[A-Za-z0-9_\-]{10,}|Bearer\s+[A-Za-z0-9._\-]{8,}|Token\s+[A-Za-z0-9._\-]{8,})"
)


def _sanitize_error(message: Optional[str]) -> Optional[str]:
    """Strip credential-shaped substrings before surfacing provider errors."""
    if not message:
        return message
    return _SECRET_LIKE.sub("[redacted]", message)[:500]


@router.patch("/credentials/{credential_id}", response_model=CredentialResponse)
async def update_credential_metadata(
    credential_id: uuid.UUID,
    payload: CredentialUpdate,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Updates routing metadata/limits for a credential without touching its secret."""
    cred = (
        await db.execute(select(ProviderCredential).where(ProviderCredential.id == credential_id))
    ).scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found.")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No fields supplied.")
    before = {field: getattr(cred, field) for field in updates}
    for field, value in updates.items():
        setattr(cred, field, value)

    db.add(
        AdminAuditLog(
            actor_id=current_admin.id,
            actor_email=current_admin.email,
            action="credential.metadata_updated",
            target_entity="credential",
            target_id=str(credential_id),
            details={"before": {k: str(v) for k, v in before.items()}, "after": updates},
        )
    )
    await db.commit()
    await db.refresh(cred)
    return cred


@router.get("/credentials/{credential_id}/usage", response_model=CredentialUsageResponse)
async def get_credential_usage(
    credential_id: uuid.UUID,
    days: int = Query(30, ge=1, le=365),
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Per-credential usage, cost provenance, latency, and recent routing events."""
    cred = (
        await db.execute(select(ProviderCredential).where(ProviderCredential.id == credential_id))
    ).scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found.")

    since = datetime.now(UTC) - timedelta(days=days)
    ledger_rows = (
        (
            await db.execute(
                select(TokenCostLedger).where(
                    TokenCostLedger.credential_id == credential_id,
                    TokenCostLedger.created_at >= since,
                )
            )
        )
        .scalars()
        .all()
    )

    # Terminal routing events are the request-attempt record (they also cover
    # speech calls that never write a token ledger entry).
    terminal_events = (
        (
            await db.execute(
                select(RoutingEvent)
                .where(
                    RoutingEvent.credential_id == credential_id,
                    RoutingEvent.created_at >= since,
                    RoutingEvent.outcome.in_(("success", "failure")),
                )
                .order_by(RoutingEvent.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    recent_events = terminal_events[:20]
    for event in recent_events:
        event.error_message = _sanitize_error(event.error_message)

    request_count = len(terminal_events)
    success_count = sum(1 for event in terminal_events if event.outcome == "success")
    total_cost = float(sum((row.cost_usd or 0) for row in ledger_rows))
    estimated_cost = float(sum((row.cost_usd or 0) for row in ledger_rows if row.cost_source != "provider"))
    billed_cost = float(sum((row.cost_usd or 0) for row in ledger_rows if row.cost_source == "provider"))
    avg_latency = sum(event.latency_ms or 0 for event in terminal_events) / request_count if request_count else 0.0

    cost_by_model: dict[str, float] = {}
    daily_cost: dict[str, float] = {}
    for row in ledger_rows:
        cost_by_model[row.model_name] = cost_by_model.get(row.model_name, 0.0) + float(row.cost_usd or 0)
        day = row.created_at.date().isoformat()
        daily_cost[day] = daily_cost.get(day, 0.0) + float(row.cost_usd or 0)

    budget = float(cred.monthly_budget_usd or 0)
    spend = float(cred.current_month_spend_usd or 0)
    return CredentialUsageResponse(
        credential_id=cred.id,
        window_days=days,
        request_count=request_count,
        success_count=success_count,
        failure_count=request_count - success_count,
        success_rate_pct=round(success_count / request_count * 100.0, 1) if request_count else 0.0,
        input_tokens=sum(row.input_tokens or 0 for row in ledger_rows),
        output_tokens=sum(row.output_tokens or 0 for row in ledger_rows),
        total_tokens=sum(row.total_tokens or 0 for row in ledger_rows),
        total_cost_usd=round(total_cost, 6),
        estimated_cost_usd=round(estimated_cost, 6),
        provider_billed_cost_usd=round(billed_cost, 6),
        avg_latency_ms=round(avg_latency, 1),
        monthly_budget_usd=budget,
        monthly_spend_usd=round(spend, 6),
        budget_used_pct=round(spend / budget * 100.0, 1) if budget > 0 else 0.0,
        cost_by_model={key: round(value, 6) for key, value in cost_by_model.items()},
        daily_cost_usd={key: round(value, 6) for key, value in sorted(daily_cost.items())},
        recent_events=recent_events,
    )


@router.get("/routing/events", response_model=List[RoutingEventResponse])
async def list_routing_events(
    provider_name: Optional[str] = Query(None, max_length=50),
    credential_id: Optional[uuid.UUID] = Query(None),
    outcome: Optional[str] = Query(None, max_length=20),
    failures_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Chronological routing decision/failover trail without exposing secrets."""
    filters = []
    if provider_name:
        filters.append(RoutingEvent.provider_name == provider_name.strip().lower())
    if credential_id:
        filters.append(RoutingEvent.credential_id == credential_id)
    if outcome:
        filters.append(RoutingEvent.outcome == outcome)
    if failures_only:
        filters.append(RoutingEvent.outcome.in_(("failure", "no_credential")))

    events = (
        (
            await db.execute(
                select(RoutingEvent)
                .where(*filters)
                .order_by(RoutingEvent.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    for event in events:
        event.error_message = _sanitize_error(event.error_message)
    return events


@router.get("/routing/explain")
async def explain_routing_selection(
    provider_name: str = Query(..., min_length=2, max_length=50),
    model_name: Optional[str] = Query(None, max_length=100),
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Dry-run the router: which credential would serve the next request and why."""
    from backend.app.services.routing_engine import IntelligentRoutingEngine

    return await IntelligentRoutingEngine.explain_selection(db, provider_name.strip().lower(), model_name)


@router.get("/routing/overview")
async def routing_overview(
    window_hours: int = Query(24, ge=1, le=168),
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Aggregated provider/token health, failover, latency, spend, and live utilization."""
    from backend.app.services.routing_engine import _account_state_key, _credential_state_key
    from backend.app.services.routing_state import routing_state

    since = datetime.now(UTC) - timedelta(hours=window_hours)
    success_case = case((RoutingEvent.outcome == "success", 1), else_=0)
    failure_case = case((RoutingEvent.outcome == "failure", 1), else_=0)
    no_credential_case = case((RoutingEvent.outcome == "no_credential", 1), else_=0)
    rate_limit_case = case((RoutingEvent.error_category == "rate_limit", 1), else_=0)
    failover_case = case((RoutingEvent.is_failover.is_(True), 1), else_=0)

    provider_rows = (
        await db.execute(
            select(
                RoutingEvent.provider_name,
                func.count(RoutingEvent.id),
                func.sum(success_case),
                func.sum(failure_case),
                func.sum(no_credential_case),
                func.sum(rate_limit_case),
                func.sum(failover_case),
                func.avg(RoutingEvent.latency_ms),
            )
            .where(RoutingEvent.created_at >= since)
            .group_by(RoutingEvent.provider_name)
        )
    ).all()

    credential_rows = (
        await db.execute(
            select(
                RoutingEvent.credential_id,
                RoutingEvent.provider_name,
                func.count(RoutingEvent.id),
                func.sum(success_case),
                func.sum(failure_case),
                func.sum(rate_limit_case),
                func.avg(RoutingEvent.latency_ms),
            )
            .where(RoutingEvent.created_at >= since, RoutingEvent.credential_id.is_not(None))
            .group_by(RoutingEvent.credential_id, RoutingEvent.provider_name)
        )
    ).all()

    ledger_rows = (
        await db.execute(
            select(
                TokenCostLedger.provider_name,
                TokenCostLedger.credential_id,
                func.sum(TokenCostLedger.total_tokens),
                func.sum(TokenCostLedger.cost_usd),
            )
            .where(TokenCostLedger.created_at >= since)
            .group_by(TokenCostLedger.provider_name, TokenCostLedger.credential_id)
        )
    ).all()

    provider_cost: dict[str, dict[str, float]] = {}
    credential_cost: dict[str, dict[str, float]] = {}
    for provider_name, credential_id, tokens, cost in ledger_rows:
        p_bucket = provider_cost.setdefault(provider_name, {"tokens": 0.0, "cost_usd": 0.0})
        p_bucket["tokens"] += float(tokens or 0)
        p_bucket["cost_usd"] += float(cost or 0)
        if credential_id is not None:
            c_bucket = credential_cost.setdefault(str(credential_id), {"tokens": 0.0, "cost_usd": 0.0})
            c_bucket["tokens"] += float(tokens or 0)
            c_bucket["cost_usd"] += float(cost or 0)

    def _pct(numerator: float, denominator: float) -> float:
        return round((numerator / denominator) * 100, 1) if denominator else 0.0

    providers = [
        {
            "provider_name": provider_name,
            "requests": int(requests),
            "successes": int(successes or 0),
            "failures": int(failures or 0),
            "no_credential_events": int(no_credential_events or 0),
            "rate_limit_events": int(rate_limit_events or 0),
            "failovers": int(failovers or 0),
            "success_rate_pct": _pct(float(successes or 0), float(successes or 0) + float(failures or 0)),
            "avg_latency_ms": int(float(avg_latency or 0)),
            "total_tokens": int(provider_cost.get(provider_name, {}).get("tokens", 0)),
            "cost_usd": round(provider_cost.get(provider_name, {}).get("cost_usd", 0.0), 6),
        }
        for (
            provider_name,
            requests,
            successes,
            failures,
            no_credential_events,
            rate_limit_events,
            failovers,
            avg_latency,
        ) in provider_rows
    ]
    providers.sort(key=lambda item: item["requests"], reverse=True)

    aggregate = {str(row[0]): row for row in credential_rows if row[0] is not None}
    credential_records = (
        await db.execute(
            select(ProviderCredential, ProviderAccount).join(
                ProviderAccount, ProviderCredential.provider_id == ProviderAccount.id
            )
        )
    ).all()
    credentials = []
    for credential, provider in credential_records:
        key = str(credential.id)
        row = aggregate.get(key)
        live = routing_state.snapshot(_credential_state_key(credential.id))
        cost_bucket = credential_cost.get(key, {"tokens": 0.0, "cost_usd": 0.0})
        rpm_limit = int(credential.rate_limit_rpm or 0)
        tpm_limit = int(credential.rate_limit_tpm or 0)
        credentials.append(
            {
                "credential_id": key,
                "label": credential.label,
                "key_prefix": credential.key_prefix,
                "provider_name": provider.provider_name,
                "is_active": bool(credential.is_active),
                "health_status": credential.health_status,
                "cooling_down_until": credential.cooling_down_until.isoformat()
                if credential.cooling_down_until
                else None,
                "requests": int(row[2]) if row else 0,
                "successes": int(row[3] or 0) if row else 0,
                "failures": int(row[4] or 0) if row else 0,
                "rate_limit_events": int(row[5] or 0) if row else 0,
                "success_rate_pct": _pct(float(row[3] or 0), float(row[3] or 0) + float(row[4] or 0)) if row else 0.0,
                "avg_latency_ms": int(float(row[6] or 0)) if row else 0,
                "total_tokens": int(cost_bucket["tokens"]),
                "cost_usd": round(cost_bucket["cost_usd"], 6),
                "monthly_spend_usd": float(credential.current_month_spend_usd or 0),
                "monthly_budget_usd": float(credential.monthly_budget_usd or 0),
                "remaining_quota_tokens": max(0, tpm_limit - live["tpm_used"]) if tpm_limit else None,
                "in_flight": live["in_flight"],
                "max_concurrency": int(credential.max_concurrency or 0),
                "rpm_used": live["rpm_used"],
                "rpm_limit": rpm_limit,
                "rpm_utilization_pct": _pct(live["rpm_used"], rpm_limit),
                "tpm_used": live["tpm_used"],
                "tpm_limit": tpm_limit,
                "tpm_utilization_pct": _pct(live["tpm_used"], tpm_limit),
            }
        )
    credentials.sort(key=lambda item: (item["provider_name"], -item["requests"]))

    account_utilization = {}
    for provider in (await db.execute(select(ProviderAccount))).scalars():
        live = routing_state.snapshot(_account_state_key(provider.id))
        account_utilization[provider.provider_name] = {
            "in_flight": live["in_flight"],
            "account_rpm_used": live["rpm_used"],
            "account_rpm_limit": int(provider.account_rate_limit_rpm or 0),
            "account_tpm_used": live["tpm_used"],
            "account_tpm_limit": int(provider.account_rate_limit_tpm or 0),
            "account_max_concurrency": int(provider.account_max_concurrency or 0),
        }

    totals = {
        "requests": sum(item["requests"] for item in providers),
        "successes": sum(item["successes"] for item in providers),
        "failures": sum(item["failures"] for item in providers),
        "no_credential_events": sum(item["no_credential_events"] for item in providers),
        "rate_limit_events": sum(item["rate_limit_events"] for item in providers),
        "failovers": sum(item["failovers"] for item in providers),
        "total_tokens": sum(item["total_tokens"] for item in providers),
        "cost_usd": round(sum(item["cost_usd"] for item in providers), 6),
    }
    totals["success_rate_pct"] = _pct(totals["successes"], totals["successes"] + totals["failures"])

    return {
        "window_hours": window_hours,
        "generated_at": datetime.now(UTC).isoformat(),
        "totals": totals,
        "providers": providers,
        "credentials": credentials,
        "account_utilization": account_utilization,
    }


@router.post("/providers/{provider_id}/health-check")
async def health_check_provider(
    provider_id: uuid.UUID,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Probes every active token in a provider pool without exposing secrets."""
    from backend.app.services.token_manager import TokenManager
    from backend.app.services.vault import decrypt_credential_secret

    provider = (await db.execute(select(ProviderAccount).where(ProviderAccount.id == provider_id))).scalar_one_or_none()
    if provider is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider account not found.")

    credentials = (
        (await db.execute(select(ProviderCredential).where(ProviderCredential.provider_id == provider_id)))
        .scalars()
        .all()
    )
    control = (await db.execute(select(AdminControlSettings).where(AdminControlSettings.id == 1))).scalar_one_or_none()
    cooldown_seconds = int(control.rate_limit_cooldown_seconds) if control else 60
    results = []
    for credential in credentials:
        if not credential.is_active:
            results.append(
                {
                    "credential_id": str(credential.id),
                    "label": credential.label,
                    "key_prefix": credential.key_prefix,
                    "status": "skipped",
                    "error": "Credential is disabled.",
                }
            )
            continue

        validation = await TokenManager.validate_provider_token(
            provider.provider_name, decrypt_credential_secret(credential.encrypted_secret)
        )
        now = datetime.now(UTC)
        credential.last_health_check_at = now
        status_code = validation.get("status_code")
        if validation.get("valid"):
            credential.health_status = "healthy"
            credential.consecutive_failures = 0
            credential.last_error_reason = None
            credential.last_success_at = now
            outcome_status = "healthy"
            error = None
        elif status_code in (401, 403):
            credential.health_status = "failed"
            credential.is_active = False
            credential.last_failure_at = now
            credential.last_error_reason = _sanitize_error(validation.get("error"))
            outcome_status = "disabled"
            error = credential.last_error_reason
        elif status_code == 429:
            credential.health_status = "rate_limited"
            credential.cooling_down_until = now + timedelta(seconds=cooldown_seconds)
            credential.last_failure_at = now
            credential.last_error_reason = _sanitize_error(validation.get("error"))
            outcome_status = "rate_limited"
            error = credential.last_error_reason
        elif status_code is None:
            # Timeout or unreachable network: transient, leave the pool untouched.
            outcome_status = "unknown"
            error = _sanitize_error(validation.get("error"))
        else:
            credential.health_status = "degraded"
            credential.last_failure_at = now
            credential.last_error_reason = _sanitize_error(validation.get("error"))
            outcome_status = "degraded"
            error = credential.last_error_reason

        results.append(
            {
                "credential_id": str(credential.id),
                "label": credential.label,
                "key_prefix": credential.key_prefix,
                "status": outcome_status,
                "error": error,
            }
        )

    db.add(
        AdminAuditLog(
            actor_id=current_admin.id,
            actor_email=current_admin.email,
            action="provider.health_check",
            target_entity="provider",
            target_id=str(provider_id),
            details={
                "provider_name": provider.provider_name,
                "checked": len(results),
                "healthy": sum(1 for item in results if item["status"] == "healthy"),
            },
        )
    )
    await db.commit()
    return {"provider_name": provider.provider_name, "results": results}


# --- FinOps & Audit Trails ---


@router.get("/finops/summary", response_model=FinOpsSummaryResponse)
async def get_finops_summary(
    current_admin: User = Depends(
        require_admin_role([AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN, AdminRole.FINANCE_ADMIN])
    ),
    db: AsyncSession = Depends(get_db_session),
):
    """Provides consolidated FinOps economics, provider cost breakdown, and gross margin."""
    total_rev = float(
        (
            await db.execute(select(func.sum(FinancialInvoice.amount_usd)).where(FinancialInvoice.status == "paid"))
        ).scalar()
        or 0.0
    )
    total_cost = float((await db.execute(select(func.sum(TokenCostLedger.cost_usd)))).scalar() or 0.0)
    profit = total_rev - total_cost
    margin = (profit / total_rev * 100.0) if total_rev > 0 else 0.0

    # Costs by provider
    p_costs = await db.execute(
        select(TokenCostLedger.provider_name, func.sum(TokenCostLedger.cost_usd)).group_by(
            TokenCostLedger.provider_name
        )
    )
    cost_by_provider = {p: float(c or 0.0) for p, c in p_costs.fetchall()}

    # Costs by model
    m_costs = await db.execute(
        select(TokenCostLedger.model_name, func.sum(TokenCostLedger.cost_usd)).group_by(TokenCostLedger.model_name)
    )
    cost_by_model = {m: float(c or 0.0) for m, c in m_costs.fetchall()}

    # Tokens by provider
    p_tokens = await db.execute(
        select(TokenCostLedger.provider_name, func.sum(TokenCostLedger.total_tokens)).group_by(
            TokenCostLedger.provider_name
        )
    )
    tokens_by_provider = {p: int(t or 0) for p, t in p_tokens.fetchall()}

    return FinOpsSummaryResponse(
        total_revenue_usd=total_rev,
        total_cost_usd=total_cost,
        gross_profit_usd=profit,
        gross_margin_pct=round(margin, 1),
        cost_by_provider=cost_by_provider,
        cost_by_model=cost_by_model,
        tokens_by_provider=tokens_by_provider,
    )


@router.get("/audit-logs", response_model=List[AdminAuditLogResponse])
async def list_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None, max_length=255),
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieves immutable admin operational audit trails with pagination and filtering."""
    conditions = []
    if q and q.strip():
        term = f"%{q.strip()}%"
        conditions.append(
            AdminAuditLog.action.ilike(term)
            | AdminAuditLog.actor_email.ilike(term)
            | AdminAuditLog.target_entity.ilike(term)
        )
    stmt = (
        select(AdminAuditLog).where(*conditions).order_by(AdminAuditLog.created_at.desc()).limit(limit).offset(offset)
    )
    res = await db.execute(stmt)
    return res.scalars().all()


# ==============================================================================
# SUBSCRIPTION TIERS CRUD
# ==============================================================================


@router.get("/tiers", response_model=List[SubscriptionTierResponse])
async def list_subscription_tiers(
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all subscription tiers in the system."""
    res = await db.execute(select(SubscriptionTier).order_by(SubscriptionTier.monthly_price.asc()))
    return res.scalars().all()


@router.post("/tiers", response_model=SubscriptionTierResponse, status_code=status.HTTP_201_CREATED)
async def create_subscription_tier(
    payload: SubscriptionTierCreate,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new subscription tier with quota limits."""
    existing = await db.execute(select(SubscriptionTier).where(SubscriptionTier.name == payload.name))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Subscription tier '{payload.name}' already exists.",
        )

    tier = SubscriptionTier(
        name=payload.name,
        monthly_price=payload.monthly_price,
        max_assistants=payload.max_assistants,
        max_monthly_messages=payload.max_monthly_messages,
        max_storage_mb=payload.max_storage_mb,
    )
    db.add(tier)
    await db.commit()
    await db.refresh(tier)
    return tier


@router.get("/tiers/{tier_id}", response_model=SubscriptionTierResponse)
async def get_subscription_tier(
    tier_id: uuid.UUID,
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Fetch a single subscription tier by ID."""
    res = await db.execute(select(SubscriptionTier).where(SubscriptionTier.id == tier_id))
    tier = res.scalar_one_or_none()
    if not tier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription tier not found.")
    return tier


@router.patch("/tiers/{tier_id}", response_model=SubscriptionTierResponse)
async def update_subscription_tier(
    tier_id: uuid.UUID,
    payload: SubscriptionTierUpdate,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Update subscription tier parameters."""
    res = await db.execute(select(SubscriptionTier).where(SubscriptionTier.id == tier_id))
    tier = res.scalar_one_or_none()
    if not tier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription tier not found.")

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(tier, field, val)

    await db.commit()
    await db.refresh(tier)
    return tier


@router.delete("/tiers/{tier_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription_tier(
    tier_id: uuid.UUID,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete a subscription tier."""
    res = await db.execute(select(SubscriptionTier).where(SubscriptionTier.id == tier_id))
    tier = res.scalar_one_or_none()
    if not tier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription tier not found.")

    await db.delete(tier)
    await db.commit()
    return None


# ==============================================================================
# AI ROUTING STRATEGIES CRUD
# ==============================================================================


@router.get("/routing", response_model=List[AIRoutingStrategyResponse])
async def list_routing_strategies(
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all AI routing strategies configured in the system."""
    res = await db.execute(select(AIRoutingStrategy).order_by(AIRoutingStrategy.ui_name.asc()))
    return res.scalars().all()


@router.post("/routing", response_model=AIRoutingStrategyResponse, status_code=status.HTTP_201_CREATED)
async def create_routing_strategy(
    payload: AIRoutingStrategyCreate,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new AI black-box routing strategy mapping UI name to target LLM model."""
    existing = await db.execute(select(AIRoutingStrategy).where(AIRoutingStrategy.ui_name == payload.ui_name))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Routing strategy '{payload.ui_name}' already exists.",
        )

    strategy = AIRoutingStrategy(
        ui_name=payload.ui_name,
        ui_description=payload.ui_description,
        target_llm_model=payload.target_llm_model,
        is_active=payload.is_active,
    )
    db.add(strategy)
    await db.commit()
    await db.refresh(strategy)
    return strategy


@router.get("/routing/{strategy_id}", response_model=AIRoutingStrategyResponse)
async def get_routing_strategy(
    strategy_id: uuid.UUID,
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Fetch an AI routing strategy by ID."""
    res = await db.execute(select(AIRoutingStrategy).where(AIRoutingStrategy.id == strategy_id))
    strategy = res.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routing strategy not found.")
    return strategy


@router.patch("/routing/{strategy_id}", response_model=AIRoutingStrategyResponse)
async def update_routing_strategy(
    strategy_id: uuid.UUID,
    payload: AIRoutingStrategyUpdate,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Update an AI routing strategy."""
    res = await db.execute(select(AIRoutingStrategy).where(AIRoutingStrategy.id == strategy_id))
    strategy = res.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routing strategy not found.")

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(strategy, field, val)

    await db.commit()
    await db.refresh(strategy)
    return strategy


@router.delete("/routing/{strategy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_routing_strategy(
    strategy_id: uuid.UUID,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete an AI routing strategy."""
    res = await db.execute(select(AIRoutingStrategy).where(AIRoutingStrategy.id == strategy_id))
    strategy = res.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routing strategy not found.")

    await db.delete(strategy)
    await db.commit()
    return None


@router.post("/providers/validate")
async def validate_provider_token(
    payload: ProviderTokenValidationRequest,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN])),
):
    """Proactively validate a single API token live against the upstream provider API."""
    from backend.app.services.token_manager import TokenManager

    return await TokenManager.validate_provider_token(
        payload.provider,
        payload.token.get_secret_value(),
    )


@router.post("/providers/save-tokens")
async def save_provider_tokens(
    payload: ProviderTokensSaveRequest,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Save multiple API tokens for a provider with proactive validation and encryption."""
    from backend.app.services.token_manager import TokenManager

    results = await TokenManager.validate_and_save_provider_tokens(
        provider_name=payload.provider_name,
        raw_tokens_text=payload.tokens_raw.get_secret_value(),
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        db=db,
    )
    return {"status": "success", "tokens": results}


# --- Super Admin Mission Control: Users, Stats & Global Activity Ledger ---


class AdminUserItemResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: Optional[str] = None
    is_active: bool
    is_superuser: bool
    is_verified: bool
    workspaces_count: int
    created_at: datetime


class AdminActivityItemResponse(BaseModel):
    id: uuid.UUID
    actor_email: Optional[str] = None
    action: str
    description: str
    resource_type: str
    created_at: datetime


@router.get("/stats")
async def get_mission_control_stats(
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Real mission-critical metrics for the Super Admin Command Center."""
    from backend.app.models.assistant import Message

    # 1. Total Active Users
    active_users = (await db.execute(select(func.count(User.id)).where(User.is_active.is_(True)))).scalar() or 0
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0

    # 2. Total Documents Vectorized (Storage footprint)
    total_docs = (await db.execute(select(func.count(Document.id)))).scalar() or 0
    total_bytes = (await db.execute(select(func.sum(Document.file_size_bytes)))).scalar() or 0

    # 3. Total API Tokens Burned
    total_tokens = (await db.execute(select(func.sum(TokenCostLedger.total_tokens)))).scalar() or 0
    total_ai_spend = float((await db.execute(select(func.sum(TokenCostLedger.cost_usd)))).scalar() or 0.0)

    # 4. Total Queries Answered
    total_queries = (await db.execute(select(func.count(Message.id)).where(Message.role == "assistant"))).scalar() or 0

    return {
        "active_users": active_users,
        "total_users": total_users,
        "total_documents_vectorized": total_docs,
        "total_storage_bytes": total_bytes,
        "total_tokens_burned": total_tokens,
        "total_ai_spend_usd": total_ai_spend,
        "total_queries_answered": total_queries,
        "public_rate_limiting": {
            "enabled": settings.PUBLIC_RATE_LIMIT_ENABLED,
            "chat_per_ip_per_minute": settings.PUBLIC_CHAT_IP_LIMIT,
            "chat_per_deployment_per_minute": settings.PUBLIC_CHAT_DEPLOYMENT_LIMIT,
            **PublicRateLimiter.snapshot(),
        },
    }


@router.get("/users", response_model=List[AdminUserItemResponse])
async def list_admin_users(
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None, max_length=255),
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN, AdminRole.PLATFORM_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Data-dense listing of platform users with membership counts and activity status."""
    stmt = (
        select(User, func.count(Membership.id).label("ws_count"))
        .outerjoin(Membership, Membership.user_id == User.id)
        .where(
            *([User.email.ilike(f"%{q.strip()}%") | User.full_name.ilike(f"%{q.strip()}%")] if q and q.strip() else [])
        )
        .group_by(User.id)
        .order_by(User.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).all()

    items = []
    for user_obj, ws_count in rows:
        items.append(
            AdminUserItemResponse(
                id=user_obj.id,
                email=user_obj.email,
                full_name=user_obj.full_name,
                is_active=user_obj.is_active,
                is_superuser=user_obj.is_superuser,
                is_verified=user_obj.is_verified,
                workspaces_count=ws_count or 0,
                created_at=user_obj.created_at,
            )
        )
    return items


@router.patch("/users/{user_id}/status")
async def toggle_user_status(
    user_id: uuid.UUID,
    payload: AdminUserStatusUpdate,
    current_admin: User = Depends(require_admin_role([AdminRole.SUPER_ADMIN])),
    db: AsyncSession = Depends(get_db_session),
):
    """Suspend or activate a user account."""
    is_active = payload.is_active
    user_res = await db.execute(select(User).where(User.id == user_id))
    user_obj = user_res.scalar_one_or_none()
    if not user_obj:
        raise HTTPException(status_code=404, detail="User not found.")
    if user_obj.id == current_admin.id and not is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You cannot deactivate your own account.")
    if user_obj.is_superuser and user_obj.is_active and not is_active:
        active_superusers = (
            await db.execute(select(func.count(User.id)).where(User.is_superuser.is_(True), User.is_active.is_(True)))
        ).scalar() or 0
        if active_superusers <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The last active superuser cannot be deactivated.",
            )

    user_obj.is_active = is_active

    audit = AdminAuditLog(
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        action="user.suspend" if not is_active else "user.activate",
        target_entity="user",
        target_id=str(user_obj.id),
        details={"email": user_obj.email, "is_active": is_active},
    )
    db.add(audit)
    await db.commit()
    return {"status": "success", "user_id": str(user_obj.id), "is_active": is_active}


@router.get("/activity", response_model=List[AdminActivityItemResponse])
async def list_global_activity_ledger(
    limit: int = 50,
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Global Activity Ledger displaying real-time system events."""
    from backend.app.models.audit import AuditEvent

    stmt = (
        select(AuditEvent, User.email)
        .outerjoin(User, User.id == AuditEvent.user_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()

    items = []
    for event, user_email in rows:
        action_name = event.action
        desc = f"Action {action_name} executed on {event.resource_type}"
        if event.details:
            details_str = ", ".join([f"{k}: {v}" for k, v in event.details.items() if k != "password"])
            if details_str:
                desc = f"{action_name} ({details_str})"

        items.append(
            AdminActivityItemResponse(
                id=event.id,
                actor_email=user_email or "System / Anonymous",
                action=event.action,
                description=desc,
                resource_type=event.resource_type,
                created_at=event.created_at,
            )
        )
    return items
