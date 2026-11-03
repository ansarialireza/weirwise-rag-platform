"""Super Admin API endpoints for Executive Control, AI Credentials, FinOps, and Auditing."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import List, Optional

from backend.app.api.admin_deps import require_admin_role, require_admin_user
from backend.app.db.session import get_db_session
from backend.app.models.admin import (
    AdminAuditLog,
    AdminControlSettings,
    AdminRole,
    AdminUserRole,
    FinancialInvoice,
    ProviderAccount,
    ProviderCredential,
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
    FinOpsSummaryResponse,
    ProviderAccountCreate,
    ProviderAccountResponse,
    ProviderAccountUpdate,
    ProviderTokensSaveRequest,
    ProviderTokenValidationRequest,
    SubscriptionTierCreate,
    SubscriptionTierResponse,
    SubscriptionTierUpdate,
    SystemMetricsResponse,
)
from backend.app.services.vault import encrypt_credential_secret
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
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
    limit: int = Query(50, le=100),
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieves immutable admin operational audit trails."""
    stmt = select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(limit)
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
