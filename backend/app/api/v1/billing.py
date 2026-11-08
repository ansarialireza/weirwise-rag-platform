"""Comprehensive Production Billing, Subscription, Checkout, and Webhook Endpoints."""

import uuid
from decimal import Decimal

from backend.app.api.dependencies import WorkspaceContext, get_current_user, require_workspace
from backend.app.core.logging import logger
from backend.app.db.session import get_db_session
from backend.app.models.auth import User, WorkspaceRole
from backend.app.models.billing import (
    BillingCycle,
    BillingOrder,
    BillingPayment,
    BillingSubscription,
    OrderStatus,
    PaymentStatus,
    SubscriptionStatus,
)
from backend.app.schemas.billing import (
    CheckoutInitiateRequest,
    CheckoutResponse,
    CheckoutStatusResponse,
    InvoiceResponse,
    PlanResponse,
    WorkspaceBillingOverviewResponse,
)
from backend.app.services.billing_engine import billing_engine
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["Billing & Subscriptions"])


# ==========================================================
# 1. PUBLIC PLAN LISTING
# ==========================================================


@router.get("/plans", response_model=list[PlanResponse])
@router.get("/billing/plans", response_model=list[PlanResponse])
async def list_public_plans(
    db: AsyncSession = Depends(get_db_session),
) -> list[PlanResponse]:
    """Public listing of commercial plans and entitlements from database."""
    plans = await billing_engine.list_plans(db, public_only=True)
    return [
        PlanResponse(
            id=p.id,
            code=p.code,
            tier=p.code,
            name=p.name,
            description=p.description,
            monthly_price=float(p.monthly_price),
            monthly_price_usd=int(p.monthly_price),
            yearly_price=float(p.yearly_price),
            currency=p.currency,
            is_active=p.is_active,
            is_recommended=p.is_recommended,
            sort_order=p.sort_order,
            max_assistants=p.max_assistants,
            max_documents=p.max_documents,
            max_chat_turns_monthly=p.max_chat_turns_monthly,
            max_storage_mb=p.max_storage_mb,
            max_file_size_mb=p.max_file_size_mb,
            allowed_models=p.allowed_models,
            features=p.features,
            allow_custom_branding=p.allow_custom_branding,
            allow_api_access=p.allow_api_access,
        )
        for p in plans
    ]


# ==========================================================
# 2. USER ACCOUNT BILLING OVERVIEW
# ==========================================================


@router.get(
    "/billing",
    response_model=WorkspaceBillingOverviewResponse,
)
async def get_user_billing(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> WorkspaceBillingOverviewResponse:
    """Retrieve full dynamic billing overview, active plan, quotas and real usage for authenticated user."""
    overview = await billing_engine.get_user_billing_overview(db, current_user)
    return WorkspaceBillingOverviewResponse(**overview)


@router.get(
    "/workspaces/{workspace_id}/billing",
    response_model=WorkspaceBillingOverviewResponse,
)
async def get_workspace_billing(
    workspace_id: uuid.UUID,
    context: WorkspaceContext = Depends(
        require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])
    ),
    db: AsyncSession = Depends(get_db_session),
) -> WorkspaceBillingOverviewResponse:
    """Retrieve full dynamic billing overview for backward-compatibility."""
    overview = await billing_engine.get_workspace_billing_overview(db, context.workspace)
    return WorkspaceBillingOverviewResponse(**overview)


class LegacyPlanChangeRequest(BaseModel):
    target_tier: str


@router.post(
    "/billing/change-plan",
    response_model=WorkspaceBillingOverviewResponse,
)
async def change_user_plan_free_or_direct(
    payload: LegacyPlanChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> WorkspaceBillingOverviewResponse:
    """Account endpoint for changing plan. Free plans execute directly; paid require checkout."""
    plan = await billing_engine.get_plan_by_code(db, payload.target_tier)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan tier '{payload.target_tier}'.",
        )

    if plan.monthly_price > Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Plan '{plan.name}' requires payment. Please use checkout.",
        )

    from backend.app.services.metering import metering_service

    ent = await metering_service.get_or_create_entitlements(db, user_id=current_user.id)
    ent.plan_tier = plan.code
    ent.max_assistants = plan.max_assistants
    ent.max_knowledge_sources = plan.max_knowledge_sources
    ent.monthly_chat_turns_limit = plan.max_chat_turns_monthly
    ent.max_storage_mb = plan.max_storage_mb
    ent.allow_custom_branding = plan.allow_custom_branding
    ent.allow_overage = plan.allow_overage

    prev_subs = (
        (
            await db.execute(
                select(BillingSubscription).where(
                    BillingSubscription.user_id == current_user.id,
                    BillingSubscription.status == SubscriptionStatus.ACTIVE.value,
                )
            )
        )
        .scalars()
        .all()
    )
    for ps in prev_subs:
        ps.status = SubscriptionStatus.CANCELLED.value
        ps.ended_at = func.now()

    sub = BillingSubscription(
        user_id=current_user.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE.value,
        billing_cycle=BillingCycle.MONTHLY.value,
        current_period_start=func.now(),
        current_period_end=func.now(),
    )
    db.add(sub)
    await db.commit()

    overview = await billing_engine.get_user_billing_overview(db, current_user)
    return WorkspaceBillingOverviewResponse(**overview)


@router.post(
    "/workspaces/{workspace_id}/billing/change-plan",
    response_model=WorkspaceBillingOverviewResponse,
)
async def change_workspace_plan_free_or_direct(
    workspace_id: uuid.UUID,
    payload: LegacyPlanChangeRequest,
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[WorkspaceRole.OWNER])),
    db: AsyncSession = Depends(get_db_session),
) -> WorkspaceBillingOverviewResponse:
    """Owner endpoint for changing plan backward-compatibility."""
    ws = context.workspace
    plan = await billing_engine.get_plan_by_code(db, payload.target_tier)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan tier '{payload.target_tier}'.",
        )

    ws.plan_tier = plan.code
    from backend.app.services.metering import metering_service

    ent = await metering_service.get_or_create_entitlements(db, ws.id)
    ent.plan_tier = plan.code
    ent.max_assistants = plan.max_assistants
    ent.max_knowledge_sources = plan.max_knowledge_sources
    ent.monthly_chat_turns_limit = plan.max_chat_turns_monthly
    ent.max_storage_mb = plan.max_storage_mb
    ent.allow_custom_branding = plan.allow_custom_branding
    ent.allow_overage = plan.allow_overage

    sub = BillingSubscription(
        workspace_id=ws.id,
        user_id=context.user.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE.value,
        billing_cycle=BillingCycle.MONTHLY.value,
        current_period_start=func.now(),
        current_period_end=func.now(),
    )
    db.add(sub)
    await db.commit()

    overview = await billing_engine.get_workspace_billing_overview(db, ws)
    return WorkspaceBillingOverviewResponse(**overview)


# ==========================================================
# 3. CHECKOUT FLOW
# ==========================================================


@router.post(
    "/billing/checkout",
    response_model=CheckoutResponse,
)
async def create_user_checkout_session(
    payload: CheckoutInitiateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> CheckoutResponse:
    """Create internal Order and initiate Rampex payment instructions for user account."""
    try:
        order, payment, plan_name = await billing_engine.create_checkout_order(
            db=db,
            workspace=None,
            user=current_user,
            plan_code=payload.plan_code,
            billing_cycle=payload.billing_cycle,
            customer_email=payload.customer_email or current_user.email,
        )

        return CheckoutResponse(
            order_id=order.id,
            order_number=order.order_number,
            plan_name=plan_name,
            amount=float(payment.amount),
            currency=payment.currency,
            status=payment.status,
            provider=payment.provider,
            provider_payment_id=payment.provider_payment_id or "",
            payment_url=payment.payment_url,
            payment_address=payment.payment_address,
            qr_code_svg=payment.qr_code_svg,
            expires_at=payment.expires_at.isoformat() if payment.expires_at else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Checkout error: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Payment provider integration error: {e}",
        )


@router.post(
    "/workspaces/{workspace_id}/billing/checkout",
    response_model=CheckoutResponse,
)
async def create_checkout_session(
    workspace_id: uuid.UUID,
    payload: CheckoutInitiateRequest,
    context: WorkspaceContext = Depends(require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN])),
    db: AsyncSession = Depends(get_db_session),
) -> CheckoutResponse:
    """Create internal Order and initiate Rampex payment instructions for workspace."""
    try:
        order, payment, plan_name = await billing_engine.create_checkout_order(
            db=db,
            workspace=context.workspace,
            user=context.user,
            plan_code=payload.plan_code,
            billing_cycle=payload.billing_cycle,
            customer_email=payload.customer_email,
        )

        return CheckoutResponse(
            order_id=order.id,
            order_number=order.order_number,
            plan_name=plan_name,
            amount=float(payment.amount),
            currency=payment.currency,
            status=payment.status,
            provider=payment.provider,
            provider_payment_id=payment.provider_payment_id or "",
            payment_url=payment.payment_url,
            payment_address=payment.payment_address,
            qr_code_svg=payment.qr_code_svg,
            expires_at=payment.expires_at.isoformat() if payment.expires_at else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Checkout error: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Payment provider integration error: {e}",
        )


@router.get(
    "/billing/orders/{order_id}/status",
    response_model=CheckoutStatusResponse,
)
async def get_user_checkout_status(
    order_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> CheckoutStatusResponse:
    """Verify live payment status against both internal records and Rampex provider API."""
    order_stmt = select(BillingOrder).where(BillingOrder.id == order_id)
    order = (await db.execute(order_stmt)).scalar_one_or_none()
    if not order or (order.user_id != current_user.id and not current_user.is_superuser):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    p_stmt = select(BillingPayment).where(BillingPayment.order_id == order.id).order_by(desc(BillingPayment.created_at))
    payment = (await db.execute(p_stmt)).scalars().first()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment record not found")

    if payment.status in (PaymentStatus.WAITING_FOR_PAYMENT.value, PaymentStatus.PROCESSING.value):
        try:
            provider = billing_engine.get_provider(payment.provider)
            res = await provider.get_payment_status(payment.provider_payment_id)
            if res.status == "completed" and payment.status != PaymentStatus.COMPLETED.value:
                payment.status = PaymentStatus.COMPLETED.value
                payment.received_amount = res.received_amount or payment.amount
                payment.received_currency = res.received_currency or payment.currency
                payment.blockchain_txid = res.blockchain_txid
                payment.paid_at = func.now()
                order.status = OrderStatus.PAID.value
                await billing_engine.activate_subscription_for_order(db, order, payment)
                await db.commit()
                await db.refresh(payment)
        except Exception as e:
            logger.debug(f"Rampex status polling skipped or failed: {e}")

    is_active = order.status == OrderStatus.PAID.value and payment.status == PaymentStatus.COMPLETED.value

    return CheckoutStatusResponse(
        order_id=order.id,
        order_number=order.order_number,
        status=payment.status,
        amount=float(payment.amount),
        currency=payment.currency,
        received_amount=float(payment.received_amount) if payment.received_amount is not None else None,
        received_currency=payment.received_currency,
        blockchain_txid=payment.blockchain_txid,
        payment_url=payment.payment_url,
        payment_address=payment.payment_address,
        qr_code_svg=payment.qr_code_svg,
        is_subscription_active=is_active,
    )


@router.get(
    "/workspaces/{workspace_id}/billing/orders/{order_id}/status",
    response_model=CheckoutStatusResponse,
)
async def get_checkout_status(
    workspace_id: uuid.UUID,
    order_id: uuid.UUID,
    context: WorkspaceContext = Depends(
        require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])
    ),
    db: AsyncSession = Depends(get_db_session),
) -> CheckoutStatusResponse:
    """Verify live payment status against both internal records and Rampex provider API."""
    order_stmt = select(BillingOrder).where(BillingOrder.id == order_id)
    order = (await db.execute(order_stmt)).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    p_stmt = select(BillingPayment).where(BillingPayment.order_id == order.id).order_by(desc(BillingPayment.created_at))
    payment = (await db.execute(p_stmt)).scalars().first()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment record not found")

    if payment.status in (PaymentStatus.WAITING_FOR_PAYMENT.value, PaymentStatus.PROCESSING.value):
        try:
            provider = billing_engine.get_provider(payment.provider)
            res = await provider.get_payment_status(payment.provider_payment_id)
            if res.status == "completed" and payment.status != PaymentStatus.COMPLETED.value:
                payment.status = PaymentStatus.COMPLETED.value
                payment.received_amount = res.received_amount or payment.amount
                payment.received_currency = res.received_currency or payment.currency
                payment.blockchain_txid = res.blockchain_txid
                payment.paid_at = func.now()
                order.status = OrderStatus.PAID.value
                await billing_engine.activate_subscription_for_order(db, order, payment)
                await db.commit()
                await db.refresh(payment)
        except Exception as e:
            logger.debug(f"Rampex status polling skipped or failed: {e}")

    is_active = order.status == OrderStatus.PAID.value and payment.status == PaymentStatus.COMPLETED.value

    return CheckoutStatusResponse(
        order_id=order.id,
        order_number=order.order_number,
        status=payment.status,
        amount=float(payment.amount),
        currency=payment.currency,
        received_amount=float(payment.received_amount) if payment.received_amount is not None else None,
        received_currency=payment.received_currency,
        blockchain_txid=payment.blockchain_txid,
        payment_url=payment.payment_url,
        payment_address=payment.payment_address,
        qr_code_svg=payment.qr_code_svg,
        is_subscription_active=is_active,
    )


# ==========================================================
# 4. INVOICES
# ==========================================================


@router.get(
    "/billing/invoices",
    response_model=list[InvoiceResponse],
)
async def list_user_invoices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[InvoiceResponse]:
    """List billing history and downloadable invoice summaries for current user."""
    invoices = await billing_engine.list_user_invoices(db, current_user.id)
    return [
        InvoiceResponse(
            id=inv.id,
            invoice_number=inv.invoice_number,
            amount=float(inv.amount),
            currency=inv.currency,
            status=inv.status,
            billing_period_start=inv.billing_period_start.isoformat(),
            billing_period_end=inv.billing_period_end.isoformat(),
            paid_at=inv.paid_at.isoformat() if inv.paid_at else None,
            line_items=inv.line_items,
            created_at=inv.created_at.isoformat(),
        )
        for inv in invoices
    ]


@router.get(
    "/workspaces/{workspace_id}/billing/invoices",
    response_model=list[InvoiceResponse],
)
async def list_invoices(
    workspace_id: uuid.UUID,
    context: WorkspaceContext = Depends(
        require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])
    ),
    db: AsyncSession = Depends(get_db_session),
) -> list[InvoiceResponse]:
    """List billing history and downloadable invoice summaries."""
    invoices = await billing_engine.list_workspace_invoices(db, workspace_id)
    return [
        InvoiceResponse(
            id=inv.id,
            invoice_number=inv.invoice_number,
            amount=float(inv.amount),
            currency=inv.currency,
            status=inv.status,
            billing_period_start=inv.billing_period_start.isoformat(),
            billing_period_end=inv.billing_period_end.isoformat(),
            paid_at=inv.paid_at.isoformat() if inv.paid_at else None,
            line_items=inv.line_items,
            created_at=inv.created_at.isoformat(),
        )
        for inv in invoices
    ]


@router.get(
    "/billing/invoices/{invoice_number}/download",
)
async def download_user_invoice_details(
    invoice_number: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Download receipt/invoice for user account."""
    inv = await billing_engine.get_invoice_by_number(db, invoice_number)
    if not inv or (inv.user_id != current_user.id and not current_user.is_superuser):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    return {
        "invoice_number": inv.invoice_number,
        "company": "Weirwise AI Platform",
        "date": inv.created_at.strftime("%Y-%m-%d"),
        "paid_date": inv.paid_at.strftime("%Y-%m-%d") if inv.paid_at else None,
        "billing_period": (
            f"{inv.billing_period_start.strftime('%Y-%m-%d')} to "
            f"{inv.billing_period_end.strftime('%Y-%m-%d')}"
        ),
        "total": f"{inv.amount} {inv.currency}",
        "status": inv.status.upper(),
        "line_items": inv.line_items,
    }


@router.get(
    "/workspaces/{workspace_id}/billing/invoices/{invoice_number}/download",
)
async def download_invoice_details(
    workspace_id: uuid.UUID,
    invoice_number: str,
    context: WorkspaceContext = Depends(
        require_workspace(allowed_roles=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])
    ),
    db: AsyncSession = Depends(get_db_session),
):
    """Download receipt/invoice in JSON or printable text format."""
    inv = await billing_engine.get_invoice_by_number(db, invoice_number)
    if not inv or (inv.workspace_id != workspace_id and not context.user.is_superuser):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    return {
        "invoice_number": inv.invoice_number,
        "company": "Weirwise AI Platform",
        "date": inv.created_at.strftime("%Y-%m-%d"),
        "paid_date": inv.paid_at.strftime("%Y-%m-%d") if inv.paid_at else None,
        "billing_period": (
            f"{inv.billing_period_start.strftime('%Y-%m-%d')} to "
            f"{inv.billing_period_end.strftime('%Y-%m-%d')}"
        ),
        "total": f"{inv.amount} {inv.currency}",
        "status": inv.status.upper(),
        "line_items": inv.line_items,
    }


# ==========================================================
# 5. RAMPEX WEBHOOK RECEIVER
# ==========================================================


@router.post("/webhooks/rampex")
async def handle_rampex_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
):
    """Dedicated Rampex webhook receiver with HMAC-SHA256 signature verification."""
    raw_body = await request.body()
    headers = dict(request.headers)

    try:
        result = await billing_engine.process_rampex_webhook(
            db=db,
            raw_body=raw_body,
            headers=headers,
        )
        return result
    except ValueError as e:
        logger.warning(f"Rejected Rampex webhook: {e}")
        status_code = status.HTTP_401_UNAUTHORIZED if "signature" in str(e).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=str(e))
    except Exception as e:
        logger.error(f"Internal error processing Rampex webhook: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error processing payment notification",
        )
