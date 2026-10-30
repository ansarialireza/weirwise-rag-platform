"""Super Admin API endpoints for Executive Control, AI Credentials, FinOps, and Auditing."""

import uuid
from typing import List

from backend.app.api.admin_deps import require_admin_role, require_admin_user
from backend.app.db.session import get_db_session
from backend.app.models.admin import (
    AdminAuditLog,
    AdminRole,
    FinancialInvoice,
    ProviderAccount,
    ProviderCredential,
    TokenCostLedger,
)
from backend.app.models.assistant import Assistant
from backend.app.models.auth import User, Workspace
from backend.app.models.project import Document, KnowledgeSource
from backend.app.schemas.admin import (
    AdminAuditLogResponse,
    CredentialCreate,
    CredentialResponse,
    FinOpsSummaryResponse,
    ProviderAccountCreate,
    ProviderAccountResponse,
    SystemMetricsResponse,
)
from backend.app.services.vault import encrypt_credential_secret
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/admin", tags=["Super Admin Control Center"])


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
    cost_res = float((await db.execute(select(func.sum(TokenCostLedger.cost_usd)))).scalar() or 0.0)

    # Invoiced Revenue metrics
    revenue_res = float(
        (
            await db.execute(select(func.sum(FinancialInvoice.amount_usd)).where(FinancialInvoice.status == "paid"))
        ).scalar()
        or 0.0
    )

    # Calculate Gross Margin
    gross_margin = 0.0
    if revenue_res > 0:
        gross_margin = max(0.0, ((revenue_res - cost_res) / revenue_res) * 100.0)

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
        system_health="healthy",
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
        default_routing_strategy=payload.default_routing_strategy,
        global_monthly_budget_usd=payload.global_monthly_budget_usd,
        supported_models=payload.supported_models,
    )
    db.add(provider)
    await db.commit()
    await db.refresh(provider)

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

    encrypted, secret_hash, prefix = encrypt_credential_secret(payload.secret)

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
    await db.commit()
    await db.refresh(cred)

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

    await db.delete(cred)
    await db.commit()

    audit = AdminAuditLog(
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        action="credential.delete",
        target_entity="credential",
        target_id=str(credential_id),
        details={"label": cred.label},
    )
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
    total_rev = float((await db.execute(select(func.sum(FinancialInvoice.amount_usd)))).scalar() or 0.0)
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
