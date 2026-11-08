"""Centralized Billing, Subscription, Checkout, and Entitlement Engine."""

import logging
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from backend.app.models.auth import User
from backend.app.models.billing import (
    BillingCycle,
    BillingInvoice,
    BillingOrder,
    BillingPayment,
    BillingPaymentEvent,
    BillingPlan,
    BillingSubscription,
    InvoiceStatus,
    OrderStatus,
    PaymentStatus,
    SubscriptionStatus,
)
from backend.app.services.payment_provider import (
    PaymentCreationRequest,
    PaymentProvider,
)
from backend.app.services.rampex_provider import RampexProvider
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

DEFAULT_PLANS = [
    {
        "code": "free",
        "name": "Free Trial",
        "description": "Essential features to build and evaluate intelligent knowledge assistants.",
        "monthly_price": Decimal("0.00"),
        "yearly_price": Decimal("0.00"),
        "max_assistants": 2,
        "max_documents": 10,
        "max_chat_turns_monthly": 100,
        "max_storage_mb": 50,
        "max_file_size_mb": 10,
        "max_knowledge_sources": 6,
        "allowed_models": ["Auto", "Fast"],
        "features": ["2 Assistants", "10 Documents", "100 Queries / month", "Standard Support"],
        "is_recommended": False,
        "sort_order": 1,
    },
    {
        "code": "starter",
        "name": "Team Starter",
        "description": "For small teams looking to ground custom business documentation.",
        "monthly_price": Decimal("29.00"),
        "yearly_price": Decimal("290.00"),
        "max_assistants": 10,
        "max_documents": 100,
        "max_chat_turns_monthly": 2500,
        "max_storage_mb": 500,
        "max_file_size_mb": 50,
        "max_knowledge_sources": 30,
        "allowed_models": ["Auto", "Fast", "Deep Thinking"],
        "features": [
            "10 Assistants",
            "100 Documents",
            "2,500 Queries / month",
            "Web Widget Embed",
            "Priority Support",
        ],
        "is_recommended": False,
        "sort_order": 2,
    },
    {
        "code": "pro",
        "name": "Pro",
        "description": "Expanded capacity, custom domains, and full model routing access.",
        "monthly_price": Decimal("49.00"),
        "yearly_price": Decimal("490.00"),
        "max_assistants": 25,
        "max_documents": 500,
        "max_chat_turns_monthly": 10000,
        "max_storage_mb": 5000,
        "max_file_size_mb": 50,
        "max_knowledge_sources": 100,
        "allowed_models": ["Auto", "Fast", "Deep Thinking"],
        "features": [
            "25 Assistants",
            "500 Documents",
            "10,000 Queries / month",
            "Custom Embed Domains",
            "Dedicated Support",
        ],
        "is_recommended": True,
        "sort_order": 3,
    },
    {
        "code": "enterprise",
        "name": "Business",
        "description": "High-volume querying, maximum storage, and guaranteed SLAs.",
        "monthly_price": Decimal("199.00"),
        "yearly_price": Decimal("1990.00"),
        "max_assistants": 50,
        "max_documents": 1000,
        "max_chat_turns_monthly": 20000,
        "max_storage_mb": 20000,
        "max_file_size_mb": 100,
        "max_knowledge_sources": 250,
        "allowed_models": ["Auto", "Fast", "Deep Thinking"],
        "features": [
            "50 Assistants",
            "1,000 Documents",
            "20,000 Queries / month",
            "Custom Embed Domains",
            "Dedicated Support & SLA",
        ],
        "is_recommended": False,
        "sort_order": 4,
    },
]


class BillingEngine:
    """Centralized billing, subscription lifecycle, checkout, and entitlement engine."""

    def __init__(self):
        self._providers: dict[str, PaymentProvider] = {}
        # Register default Rampex provider
        self.register_provider(RampexProvider())

    def register_provider(self, provider: PaymentProvider) -> None:
        self._providers[provider.provider_name] = provider

    def get_provider(self, name: str = "rampex") -> PaymentProvider:
        if name not in self._providers:
            raise ValueError(f"Payment provider '{name}' is not registered.")
        return self._providers[name]

    # ==========================================================
    # 1. PLAN MANAGEMENT
    # ==========================================================

    async def ensure_default_plans(self, db: AsyncSession) -> list[BillingPlan]:
        """Seed default plans if billing_plans table is empty."""
        stmt = select(BillingPlan).order_by(BillingPlan.sort_order.asc())
        res = await db.execute(stmt)
        plans = res.scalars().all()
        if plans:
            return list(plans)

        created = []
        for pdata in DEFAULT_PLANS:
            plan = BillingPlan(**pdata)
            db.add(plan)
            created.append(plan)

        await db.commit()
        for p in created:
            await db.refresh(p)
        return created

    async def list_plans(self, db: AsyncSession, public_only: bool = True) -> list[BillingPlan]:
        await self.ensure_default_plans(db)
        query = select(BillingPlan)
        if public_only:
            query = query.where(BillingPlan.is_active.is_(True), BillingPlan.is_public.is_(True))
        query = query.order_by(BillingPlan.sort_order.asc())
        res = await db.execute(query)
        return list(res.scalars().all())

    async def get_plan_by_code(self, db: AsyncSession, code: str) -> Optional[BillingPlan]:
        await self.ensure_default_plans(db)
        stmt = select(BillingPlan).where(func.lower(BillingPlan.code) == code.lower().strip())
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    async def get_plan_by_id(self, db: AsyncSession, plan_id: uuid.UUID) -> Optional[BillingPlan]:
        stmt = select(BillingPlan).where(BillingPlan.id == plan_id)
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    # ==========================================================
    # 2. SUBSCRIPTION MANAGEMENT & CURRENT STATUS
    # ==========================================================

    async def get_user_billing_overview(self, db: AsyncSession, user: User) -> dict[str, Any]:
        """Build unified user-facing account billing & subscription status payload."""
        await self.ensure_default_plans(db)

        # 1. Fetch user active subscription
        sub = await self.get_active_subscription(db, user_id=user.id)

        plan = None
        if sub:
            plan = (await db.execute(select(BillingPlan).where(BillingPlan.id == sub.plan_id))).scalar_one_or_none()
        if not plan:
            plan = await self.get_plan_by_code(db, "free")
        if not plan:
            plan = (await self.list_plans(db, public_only=True))[0]

        # 2. Entitlement check
        from backend.app.services.metering import metering_service

        ent = await metering_service.get_or_create_entitlements(db, user_id=user.id)

        # 3. Usage numbers directly for user resources
        from backend.app.services.subscription import subscription_service

        usage = await subscription_service.get_user_usage(user.id, db)

        return {
            "user_id": user.id,
            "plan_code": plan.code,
            "plan_tier": plan.code,
            "plan_name": plan.name,
            "monthly_price": float(plan.monthly_price),
            "yearly_price": float(plan.yearly_price),
            "currency": plan.currency,
            "billing_cycle": sub.billing_cycle if sub else "monthly",
            "status": sub.status if sub else ("active" if user.is_active else "suspended"),
            "period_start": sub.current_period_start.isoformat()
            if sub
            else (ent.period_start.isoformat() if ent else None),
            "period_end": sub.current_period_end.isoformat()
            if sub
            else (ent.period_end.isoformat() if ent and ent.period_end else None),
            "cancel_at_period_end": sub.cancel_at_period_end if sub else False,
            "chat_turns_used": usage.get("chat_turn", 0),
            "chat_turns_limit": plan.max_chat_turns_monthly,
            "documents_indexed": usage.get("document_indexed", 0),
            "documents_limit": plan.max_documents,
            "assistants_limit": plan.max_assistants,
            "storage_mb_limit": plan.max_storage_mb,
            "allowed_models": plan.allowed_models,
            "features": plan.features,
        }

    async def get_active_subscription(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> Optional[BillingSubscription]:
        """Fetch current active subscription for a user."""
        now = datetime.now(UTC)
        conditions = [
            BillingSubscription.status.in_([SubscriptionStatus.ACTIVE.value, SubscriptionStatus.TRIALING.value]),
            BillingSubscription.current_period_end > now,
            BillingSubscription.user_id == user_id,
        ]

        stmt = select(BillingSubscription).where(*conditions).order_by(desc(BillingSubscription.created_at))
        res = await db.execute(stmt)
        return res.scalars().first()

    # ==========================================================
    # 3. CHECKOUT & ORDER CREATION
    # ==========================================================

    async def create_checkout_order(
        self,
        db: AsyncSession,
        user: User,
        plan_code: str,
        billing_cycle: str = "monthly",
        customer_email: Optional[str] = None,
    ) -> tuple[BillingOrder, BillingPayment, str]:
        """Create internal BillingOrder and initiate payment link with Rampex provider."""
        plan = await self.get_plan_by_code(db, plan_code)
        if not plan:
            raise ValueError(f"Plan '{plan_code}' not found.")

        cycle = BillingCycle.YEARLY.value if billing_cycle.lower() == "yearly" else BillingCycle.MONTHLY.value
        amount = plan.yearly_price if cycle == BillingCycle.YEARLY.value else plan.monthly_price

        if amount <= Decimal("0.00"):
            raise ValueError("Free plans do not require a payment checkout. Upgrade directly.")

        order_number = f"WW-ORD-{int(datetime.now(UTC).timestamp())}-{uuid.uuid4().hex[:6].upper()}"
        order = BillingOrder(
            order_number=order_number,
            user_id=user.id,
            plan_id=plan.id,
            billing_cycle=cycle,
            amount=amount,
            currency=plan.currency,
            status=OrderStatus.PENDING.value,
        )
        db.add(order)
        await db.flush()

        base_url = "https://dev.weirwise.com"
        return_url = f"{base_url}/checkout?order_id={order.id}"

        # Send request to PaymentProvider (Rampex)
        provider = self.get_provider("rampex")
        req = PaymentCreationRequest(
            order_id=str(order.id),
            order_number=order.order_number,
            amount=amount,
            currency=plan.currency,
            customer_email=customer_email or user.email,
            customer_name=user.full_name or user.email.split("@")[0],
            description=f"Weirwise {plan.name} ({cycle.capitalize()})",
            return_url=return_url,
        )

        res = await provider.create_payment(req)

        payment = BillingPayment(
            order_id=order.id,
            provider=provider.provider_name,
            provider_payment_id=res.provider_payment_id,
            amount=amount,
            currency=plan.currency,
            status=PaymentStatus.WAITING_FOR_PAYMENT.value,
            payment_url=res.payment_url,
            payment_address=res.payment_address,
            qr_code_svg=res.qr_code_svg,
            raw_response=res.raw_response,
            expires_at=datetime.now(UTC) + timedelta(hours=24),
        )
        db.add(payment)
        await db.commit()
        await db.refresh(order)
        await db.refresh(payment)

        return order, payment, plan.name

    # ==========================================================
    # 4. PAYMENT VERIFICATION & WEBHOOK PROCESSING
    # ==========================================================

    async def process_rampex_webhook(
        self,
        db: AsyncSession,
        raw_body: bytes,
        headers: dict[str, str],
    ) -> dict[str, Any]:
        """Idempotent, constant-time verified webhook processing for Rampex."""
        provider = self.get_provider("rampex")

        # 1. Verify HMAC-SHA256 signature
        if not provider.verify_webhook_signature(raw_body, headers):
            logger.warning("Rampex webhook rejected: Invalid signature")
            raise ValueError("Invalid webhook signature")

        # 2. Parse payload safely
        payload = provider.parse_webhook_payload(raw_body)
        event_name = str(payload.get("event") or headers.get("X-Rampex-Event") or "payment.completed")
        link_id = str(payload.get("link_id") or payload.get("payment_link_id") or "")
        event_id = str(
            payload.get("event_id")
            or f"{event_name}_{link_id}_{payload.get('paid_at') or payload.get('timestamp') or uuid.uuid4().hex}"
        )

        # 3. Idempotency check on BillingPaymentEvent
        existing_event_stmt = select(BillingPaymentEvent).where(BillingPaymentEvent.event_id == event_id)
        existing_event = (await db.execute(existing_event_stmt)).scalar_one_or_none()
        if existing_event and existing_event.processed:
            logger.info(f"Duplicate Rampex webhook event '{event_id}' safely acknowledged without re-processing.")
            return {"status": "already_processed", "event_id": event_id, "result": {"status": "already_processed"}}

        # 4. Find payment by provider_payment_id or order_number
        woo_order_id = payload.get("woo_order_id")
        payment = None
        if link_id:
            p_stmt = (
                select(BillingPayment).join(BillingPayment.order).where(BillingPayment.provider_payment_id == link_id)
            )
            payment = (await db.execute(p_stmt)).scalars().first()

        if not payment and woo_order_id:
            ord_stmt = select(BillingOrder).where(BillingOrder.order_number == str(woo_order_id))
            ord_obj = (await db.execute(ord_stmt)).scalar_one_or_none()
            if ord_obj:
                p_stmt = select(BillingPayment).where(BillingPayment.order_id == ord_obj.id)
                payment = (await db.execute(p_stmt)).scalars().first()

        # Record audit event
        pevent = existing_event or BillingPaymentEvent(
            payment_id=payment.id if payment else None,
            provider="rampex",
            event_type=event_name,
            event_id=event_id,
            payload=payload,
            signature=headers.get("x-rampex-signature") or headers.get("x-webhook-signature"),
            is_valid=True,
            processed=False,
        )
        if not existing_event:
            db.add(pevent)
            await db.flush()

        if not payment:
            pevent.processing_error = (
                f"No internal payment found matching link_id '{link_id}' or order '{woo_order_id}'"
            )
            await db.commit()
            logger.error(pevent.processing_error)
            return {"status": "unmatched_order", "reason": pevent.processing_error}

        # Explicitly fetch order and plan to prevent MissingGreenlet lazy-loading
        ord_stmt = select(BillingOrder).where(BillingOrder.id == payment.order_id)
        order = (await db.execute(ord_stmt)).scalar_one()

        plan_stmt = select(BillingPlan).where(BillingPlan.id == order.plan_id)
        plan = (await db.execute(plan_stmt)).scalar_one()

        # 5. Amount & Currency validation
        rec_amount = Decimal(str(payload.get("amount") or payload.get("received_amount") or payment.amount))
        rec_currency = str(payload.get("currency") or payment.currency).upper()

        if rec_amount < payment.amount:
            payment.status = PaymentStatus.UNDER_REVIEW.value
            payment.review_reason = (
                f"Underpaid: expected {payment.amount} {payment.currency}, received {rec_amount} {rec_currency}"
            )
            pevent.processing_error = payment.review_reason
            pevent.processed = True
            await db.commit()
            return {"status": "under_review", "reason": payment.review_reason}

        # 6. Mark payment completed and activate subscription
        payment.status = PaymentStatus.COMPLETED.value
        payment.received_amount = rec_amount
        payment.received_currency = str(
            payload.get("received_currency") or payload.get("received_asset") or rec_currency
        )
        if payload.get("payout_amount"):
            payment.payout_amount = Decimal(str(payload.get("payout_amount")))
        if payload.get("payout_currency"):
            payment.payout_currency = str(payload.get("payout_currency"))
        payment.blockchain_txid = payload.get("transaction_hash") or payload.get("txid_out") or payload.get("txid_in")
        payment.paid_at = datetime.now(UTC)

        order.status = OrderStatus.PAID.value

        # Activate subscription and grant real entitlements
        sub, inv = await self.activate_subscription_for_order(db, order, plan, payment)

        pevent.processed = True
        await db.commit()
        logger.info(f"Payment {payment.id} verified and subscription {sub.id} activated successfully.")

        return {
            "success": True,
            "status": "success",
            "payment_id": str(payment.id),
            "order_id": str(order.id),
            "subscription_id": str(sub.id),
            "invoice_number": inv.invoice_number,
        }

    # ==========================================================
    # 5. SUBSCRIPTION ACTIVATION & ENTITLEMENT GRANTS
    # ==========================================================

    async def activate_subscription_for_order(
        self,
        db: AsyncSession,
        order: BillingOrder,
        plan: Optional[BillingPlan] = None,
        payment: Optional[BillingPayment] = None,
    ) -> tuple[BillingSubscription, BillingInvoice]:
        """Activate subscription and synchronize entitlements with application enforcement."""
        now = datetime.now(UTC)
        duration_days = 365 if order.billing_cycle == BillingCycle.YEARLY.value else 30
        period_end = now + timedelta(days=duration_days)

        # Deactivate any previous active subscription for this user
        conditions = [
            BillingSubscription.status == SubscriptionStatus.ACTIVE.value,
            BillingSubscription.user_id == order.user_id,
        ]

        prev_subs = (await db.execute(select(BillingSubscription).where(*conditions))).scalars().all()
        for ps in prev_subs:
            ps.status = SubscriptionStatus.CANCELLED.value
            ps.ended_at = now

        if not plan:
            plan = (await db.execute(select(BillingPlan).where(BillingPlan.id == order.plan_id))).scalar_one()
        # Create new active subscription
        sub = BillingSubscription(
            user_id=order.user_id,
            plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE.value,
            billing_cycle=order.billing_cycle,
            current_period_start=now,
            current_period_end=period_end,
            cancel_at_period_end=False,
        )
        db.add(sub)
        await db.flush()

        order.subscription_id = sub.id

        # Synchronize User PlanEntitlement (Quota Enforcement)
        from backend.app.services.metering import metering_service

        entitlement = await metering_service.get_or_create_entitlements(db, user_id=order.user_id)
        entitlement.user_id = order.user_id
        entitlement.plan_tier = plan.code
        entitlement.max_assistants = plan.max_assistants
        entitlement.max_knowledge_sources = plan.max_knowledge_sources
        entitlement.monthly_chat_turns_limit = plan.max_chat_turns_monthly
        entitlement.max_storage_mb = plan.max_storage_mb
        entitlement.allow_custom_branding = plan.allow_custom_branding
        entitlement.allow_overage = plan.allow_overage
        entitlement.overage_rate_cents = plan.overage_rate_cents
        entitlement.period_start = now
        entitlement.period_end = period_end
        entitlement.current_period_chat_turns = 0

        # Generate BillingInvoice
        invoice_number = f"INV-{now.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
        invoice = BillingInvoice(
            invoice_number=invoice_number,
            user_id=order.user_id,
            subscription_id=sub.id,
            order_id=order.id,
            amount=order.amount,
            currency=order.currency,
            status=InvoiceStatus.PAID.value,
            billing_period_start=now,
            billing_period_end=period_end,
            paid_at=now,
            line_items=[
                {
                    "description": f"{plan.name} Subscription ({order.billing_cycle.capitalize()})",
                    "amount": float(order.amount),
                    "currency": order.currency,
                }
            ],
        )
        db.add(invoice)

        await db.flush()
        return sub, invoice

    # ==========================================================
    # 6. BILLING HISTORY & INVOICE LOOKUP
    # ==========================================================

    async def list_user_invoices(self, db: AsyncSession, user_id: uuid.UUID) -> list[BillingInvoice]:
        stmt = select(BillingInvoice).where(BillingInvoice.user_id == user_id).order_by(desc(BillingInvoice.created_at))
        res = await db.execute(stmt)
        return list(res.scalars().all())

    async def get_invoice_by_number(self, db: AsyncSession, invoice_number: str) -> Optional[BillingInvoice]:
        stmt = select(BillingInvoice).where(BillingInvoice.invoice_number == invoice_number)
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    # ==========================================================
    # 7. ADMIN FINANCIAL CONTROL CENTER ANALYTICS
    # ==========================================================

    async def get_admin_financial_analytics(self, db: AsyncSession) -> dict[str, Any]:
        """Aggregate actual real financial records from the database."""
        # Revenue from paid invoices
        rev_stmt = select(func.coalesce(func.sum(BillingInvoice.amount), Decimal("0.00"))).where(
            BillingInvoice.status == InvoiceStatus.PAID.value
        )
        total_revenue = (await db.execute(rev_stmt)).scalar_one()

        # Payments by status
        total_payments = (await db.execute(select(func.count(BillingPayment.id)))).scalar_one()
        successful_payments = (
            await db.execute(
                select(func.count(BillingPayment.id)).where(BillingPayment.status == PaymentStatus.COMPLETED.value)
            )
        ).scalar_one()
        pending_payments = (
            await db.execute(
                select(func.count(BillingPayment.id)).where(
                    BillingPayment.status.in_(
                        [
                            PaymentStatus.WAITING_FOR_PAYMENT.value,
                            PaymentStatus.PROCESSING.value,
                            PaymentStatus.CONFIRMING.value,
                        ]
                    )
                )
            )
        ).scalar_one()
        failed_payments = (
            await db.execute(
                select(func.count(BillingPayment.id)).where(
                    BillingPayment.status.in_([PaymentStatus.FAILED.value, PaymentStatus.EXPIRED.value])
                )
            )
        ).scalar_one()
        under_review_payments = (
            await db.execute(
                select(func.count(BillingPayment.id)).where(BillingPayment.status == PaymentStatus.UNDER_REVIEW.value)
            )
        ).scalar_one()

        # Active vs Expired Subscriptions
        now = datetime.now(UTC)
        active_subs = (
            await db.execute(
                select(func.count(BillingSubscription.id)).where(
                    BillingSubscription.status == SubscriptionStatus.ACTIVE.value,
                    BillingSubscription.current_period_end > now,
                )
            )
        ).scalar_one()
        expired_subs = (
            await db.execute(
                select(func.count(BillingSubscription.id)).where(BillingSubscription.current_period_end <= now)
            )
        ).scalar_one()

        # Revenue by Plan
        plan_rev_stmt = (
            select(BillingPlan.name, func.coalesce(func.sum(BillingInvoice.amount), Decimal("0.00")))
            .join(BillingSubscription, BillingInvoice.subscription_id == BillingSubscription.id)
            .join(BillingPlan, BillingSubscription.plan_id == BillingPlan.id)
            .where(BillingInvoice.status == InvoiceStatus.PAID.value)
            .group_by(BillingPlan.name)
        )
        revenue_by_plan = {row[0]: float(row[1]) for row in (await db.execute(plan_rev_stmt)).all()}

        # Revenue by Currency
        curr_rev_stmt = (
            select(BillingInvoice.currency, func.coalesce(func.sum(BillingInvoice.amount), Decimal("0.00")))
            .where(BillingInvoice.status == InvoiceStatus.PAID.value)
            .group_by(BillingInvoice.currency)
        )
        revenue_by_currency = {row[0]: float(row[1]) for row in (await db.execute(curr_rev_stmt)).all()}

        return {
            "total_revenue_usd": float(total_revenue),
            "total_payments": total_payments,
            "successful_payments": successful_payments,
            "pending_payments": pending_payments,
            "failed_payments": failed_payments,
            "under_review_payments": under_review_payments,
            "active_subscriptions": active_subs,
            "expired_subscriptions": expired_subs,
            "revenue_by_plan": revenue_by_plan,
            "revenue_by_currency": revenue_by_currency,
        }


billing_engine = BillingEngine()
