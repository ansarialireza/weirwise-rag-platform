"""Backwards-compatibility routing shim for workspaces and projects.

Maps legacy workspace/project routes to direct user-scoped services.
"""

import uuid
from typing import Any, Dict, List, Optional

from backend.app.api.dependencies import get_current_user
from backend.app.db.session import get_db_session as get_db
from backend.app.models.assistant import AssistantKnowledgeSource
from backend.app.models.auth import User
from backend.app.models.project import KnowledgeSource
from backend.app.schemas.assistant import AssistantCreateRequest, AssistantResponse
from backend.app.schemas.knowledge import DirectSearchRequest, KnowledgeSourceCreateRequest, KnowledgeSourceResponse
from backend.app.schemas.workspace import (
    ProjectCreate,
    ProjectResponse,
    WorkspaceCreate,
    WorkspaceMemberResponse,
    WorkspaceResponse,
    WorkspaceUpdate,
)
from backend.app.services.billing_engine import billing_engine
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["workspaces-compat"], deprecated=True)


def _user_ws_id(user_id: Any) -> str:
    return str(user_id)


def _user_project_id(user_id: Any) -> str:
    return str(user_id)


@router.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    data: Optional[WorkspaceCreate] = None,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    ws_id = _user_ws_id(current_user.id)
    name = data.name if data and data.name else "Personal Workspace"
    return {
        "id": ws_id,
        "name": name,
        "slug": "personal",
        "owner_id": str(current_user.id),
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        "updated_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }


@router.get("/workspaces", response_model=List[WorkspaceResponse])
async def list_workspaces(
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    ws_id = _user_ws_id(current_user.id)
    return [
        {
            "id": ws_id,
            "name": "Personal Workspace",
            "slug": "personal",
            "owner_id": str(current_user.id),
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
            "updated_at": current_user.created_at.isoformat() if current_user.created_at else None,
        }
    ]


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return {
        "id": expected_ws_id,
        "name": "Personal Workspace",
        "slug": "personal",
        "owner_id": str(current_user.id),
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        "updated_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: str,
    data: WorkspaceUpdate,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return {
        "id": expected_ws_id,
        "name": data.name or "Personal Workspace",
        "slug": "personal",
        "owner_id": str(current_user.id),
    }


@router.get("/workspaces/{workspace_id}/members", response_model=List[WorkspaceMemberResponse])
async def list_workspace_members(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return [
        {
            "id": str(current_user.id),
            "workspace_id": expected_ws_id,
            "user_id": str(current_user.id),
            "email": current_user.email,
            "role": "owner",
        }
    ]


@router.post(
    "/workspaces/{workspace_id}/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project(
    workspace_id: str,
    data: ProjectCreate,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    proj_id = _user_project_id(current_user.id)
    return {
        "id": proj_id,
        "workspace_id": expected_ws_id,
        "name": data.name,
        "description": data.description,
    }


@router.get("/workspaces/{workspace_id}/projects", response_model=List[ProjectResponse])
async def list_projects(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    proj_id = _user_project_id(current_user.id)
    return [
        {
            "id": proj_id,
            "workspace_id": expected_ws_id,
            "name": "Default Project",
            "description": "Default user project",
        }
    ]


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    expected_proj_id = _user_project_id(current_user.id)
    if project_id != expected_proj_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return {
        "id": expected_proj_id,
        "workspace_id": _user_ws_id(current_user.id),
        "name": "Default Project",
        "description": "Default user project",
    }


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
) -> None:
    expected_proj_id = _user_project_id(current_user.id)
    if project_id != expected_proj_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return None


@router.post(
    "/projects/{project_id}/sources",
    response_model=KnowledgeSourceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def legacy_create_source(
    project_id: str,
    data: KnowledgeSourceCreateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_proj_id = _user_project_id(current_user.id)
    if project_id != expected_proj_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    from backend.app.api.v1.knowledge import create_knowledge_source

    return await create_knowledge_source(
        payload=data,
        background_tasks=background_tasks,
        current_user=current_user,
        db=db,
    )


@router.get("/projects/{project_id}/sources", response_model=List[KnowledgeSourceResponse])
async def legacy_list_sources(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_proj_id = _user_project_id(current_user.id)
    if project_id != expected_proj_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    from backend.app.api.v1.knowledge import list_knowledge_sources

    return await list_knowledge_sources(db=db, current_user=current_user)


@router.post(
    "/projects/{project_id}/assistants",
    response_model=AssistantResponse,
    status_code=status.HTTP_201_CREATED,
)
async def legacy_create_assistant(
    project_id: str,
    data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_proj_id = _user_project_id(current_user.id)
    if project_id != expected_proj_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    from backend.app.api.v1.assistants import create_assistant

    name = data.get("name", "Legacy Assistant")
    desc = data.get("description", "")
    sys_prompt = data.get("system_prompt") or data.get("system_instructions") or "You are a helpful assistant."
    model = data.get("model_name") or data.get("model") or "gpt-4o-mini"
    temp = float(data.get("temperature", 0.7))
    knowledge_source_ids = data.get("knowledge_source_ids") or []
    engine_mode = data.get("engine_mode")
    show_sources = data.get("show_sources")

    kwargs: Dict[str, Any] = {
        "name": name,
        "description": desc,
        "system_instructions": sys_prompt,
        "model": model,
        "temperature": temp,
        "knowledge_source_ids": knowledge_source_ids,
    }
    if engine_mode is not None:
        kwargs["engine_mode"] = engine_mode
    if show_sources is not None:
        kwargs["show_sources"] = show_sources
    if "top_k" in data:
        kwargs["top_k"] = int(data["top_k"])
    if "score_threshold" in data:
        kwargs["score_threshold"] = float(data["score_threshold"])
    if "tone" in data:
        kwargs["tone"] = data["tone"]
    if "language" in data:
        kwargs["language"] = data["language"]
    if "fallback_message" in data:
        kwargs["fallback_message"] = data["fallback_message"]
    if "escalation_email" in data:
        kwargs["escalation_email"] = data["escalation_email"]
    c_data = AssistantCreateRequest(**kwargs)
    resp = await create_assistant(payload=c_data, current_user=current_user, db=db)

    if not knowledge_source_ids:
        src_res = await db.execute(select(KnowledgeSource.id).where(KnowledgeSource.user_id == current_user.id))
        all_src_ids = src_res.scalars().all()
        for sid in all_src_ids:
            link = AssistantKnowledgeSource(assistant_id=resp.id, knowledge_source_id=sid)
            db.add(link)
        if all_src_ids:
            await db.commit()

    return resp


@router.get("/projects/{project_id}/assistants", response_model=List[AssistantResponse])
async def legacy_list_assistants(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_proj_id = _user_project_id(current_user.id)
    if project_id != expected_proj_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    from backend.app.api.v1.assistants import list_assistants

    return await list_assistants(db=db, current_user=current_user)


@router.get("/workspaces/{workspace_id}/billing")
async def legacy_get_billing(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.billing import get_user_billing

    b_data = await get_user_billing(db=db, current_user=current_user)
    res = dict(b_data) if isinstance(b_data, dict) else b_data.__dict__.copy()
    res["workspace_id"] = expected_ws_id
    res["plan_tier"] = res.get("plan_code", "free_trial")
    return res


@router.post("/workspaces/{workspace_id}/billing/change-plan")
async def legacy_change_plan(
    workspace_id: str,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    plan_tier = payload.get("plan_tier") or payload.get("plan_code") or payload.get("target_tier") or "free_trial"

    from backend.app.models.assistant import WorkspacePlanEntitlement

    ent = (
        await db.execute(select(WorkspacePlanEntitlement).where(WorkspacePlanEntitlement.user_id == current_user.id))
    ).scalar_one_or_none()
    tier_map = {
        "free": {"max_assistants": 2, "max_storage_mb": 50, "monthly_chat_turns_limit": 100},
        "free_trial": {"max_assistants": 2, "max_storage_mb": 50, "monthly_chat_turns_limit": 100},
        "starter": {"max_assistants": 10, "max_storage_mb": 500, "monthly_chat_turns_limit": 2500},
        "pro": {"max_assistants": 25, "max_storage_mb": 5000, "monthly_chat_turns_limit": 10000},
        "enterprise": {"max_assistants": 100, "max_storage_mb": 10240, "monthly_chat_turns_limit": 50000},
    }
    quotas = tier_map.get(
        plan_tier.lower(), {"max_assistants": 25, "max_storage_mb": 5000, "monthly_chat_turns_limit": 10000}
    )
    if not ent:
        ent = WorkspacePlanEntitlement(
            user_id=current_user.id,
            plan_tier=plan_tier,
            max_assistants=quotas["max_assistants"],
            max_storage_mb=quotas["max_storage_mb"],
            monthly_chat_turns_limit=quotas["monthly_chat_turns_limit"],
            max_knowledge_sources=20,
        )
        db.add(ent)
    else:
        ent.plan_tier = plan_tier
        ent.max_assistants = quotas["max_assistants"]
        ent.max_storage_mb = quotas["max_storage_mb"]
        ent.monthly_chat_turns_limit = quotas["monthly_chat_turns_limit"]

    from datetime import UTC, datetime, timedelta

    from backend.app.models.billing import BillingSubscription, SubscriptionStatus

    plan = await billing_engine.get_plan_by_code(db, plan_tier)
    if plan:
        sub = BillingSubscription(
            user_id=current_user.id,
            plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE.value,
            billing_cycle="monthly",
            current_period_start=datetime.now(UTC),
            current_period_end=datetime.now(UTC) + timedelta(days=30),
        )
        db.add(sub)
    await db.commit()
    from backend.app.api.v1.billing import get_user_billing

    b_data = await get_user_billing(db=db, current_user=current_user)
    data = dict(b_data) if isinstance(b_data, dict) else b_data.__dict__.copy()
    data["workspace_id"] = expected_ws_id
    data["plan_tier"] = plan_tier
    return data


@router.post("/workspaces/{workspace_id}/billing/checkout")
async def legacy_checkout(
    workspace_id: str,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.billing import create_user_checkout_session
    from backend.app.schemas.billing import CheckoutInitiateRequest

    req = CheckoutInitiateRequest(
        plan_code=payload.get("plan_code", "pro"),
        billing_cycle=payload.get("billing_cycle", "monthly"),
    )
    return await create_user_checkout_session(payload=req, current_user=current_user, db=db)


@router.get("/workspaces/{workspace_id}/billing/orders/{order_id}/status")
async def legacy_order_status(
    workspace_id: str,
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.billing import get_user_checkout_status

    oid = uuid.UUID(order_id) if isinstance(order_id, str) else order_id
    return await get_user_checkout_status(order_id=oid, current_user=current_user, db=db)


@router.get("/workspaces/{workspace_id}/billing/invoices")
async def legacy_list_invoices(
    workspace_id: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.billing import list_user_invoices

    return await list_user_invoices(current_user=current_user, db=db)


@router.post(
    "/workspaces/{workspace_id}/api-credentials",
    status_code=status.HTTP_201_CREATED,
)
async def legacy_create_credential(
    workspace_id: str,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.assistants import create_api_credential
    from backend.app.schemas.assistant import ApiCredentialCreateRequest

    req = ApiCredentialCreateRequest(
        name=payload.get("name", "API Key"),
        scopes=payload.get("scopes") or ["assistants:read", "assistants:chat"],
    )
    raw = await create_api_credential(payload=req, current_user=current_user, db=db)
    data = dict(raw) if isinstance(raw, dict) else raw.model_dump()
    data["workspace_id"] = expected_ws_id
    if "raw_key" in data and "raw_api_key" not in data:
        data["raw_api_key"] = data["raw_key"]
        data["api_key"] = data["raw_key"]
    return data


@router.get("/workspaces/{workspace_id}/api-credentials")
async def legacy_list_credentials(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.assistants import list_api_credentials

    res = await list_api_credentials(current_user=current_user, db=db)
    items = []
    for item in res:
        d = dict(item) if isinstance(item, dict) else item.model_dump()
        d["workspace_id"] = expected_ws_id
        items.append(d)
    return items


@router.post(
    "/workspaces/{workspace_id}/enterprise/byok",
    status_code=status.HTTP_201_CREATED,
)
async def legacy_create_byok(
    workspace_id: str,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.enterprise import configure_byok
    from backend.app.schemas.assistant import WorkspaceBYOKCreateRequest

    req = WorkspaceBYOKCreateRequest(**payload)
    return await configure_byok(payload=req, current_user=current_user, db=db)


@router.post(
    "/workspaces/{workspace_id}/webhooks",
    status_code=status.HTTP_201_CREATED,
)
async def legacy_create_webhook(
    workspace_id: str,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.integrations import create_webhook_subscription
    from backend.app.schemas.assistant import WebhookSubscriptionCreateRequest

    req = WebhookSubscriptionCreateRequest(**payload)
    return await create_webhook_subscription(payload=req, current_user=current_user, db=db)


@router.post(
    "/workspaces/{workspace_id}/integrations",
    status_code=status.HTTP_201_CREATED,
)
async def legacy_create_integration(
    workspace_id: str,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.integrations import connect_integration
    from backend.app.schemas.assistant import BusinessIntegrationCreateRequest

    req = BusinessIntegrationCreateRequest(**payload)
    return await connect_integration(payload=req, current_user=current_user, db=db)


@router.post(
    "/workspaces/{workspace_id}/integrations/{integration_id}/sync",
)
async def legacy_sync_integration(
    workspace_id: str,
    integration_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.integrations import trigger_integration_sync

    iid = uuid.UUID(integration_id) if isinstance(integration_id, str) else integration_id
    return await trigger_integration_sync(integration_id=iid, current_user=current_user, db=db)


@router.get(
    "/workspaces/{workspace_id}/integrations",
)
async def legacy_list_integrations(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.integrations import list_integrations

    return await list_integrations(current_user=current_user, db=db)


@router.post(
    "/workspaces/{workspace_id}/enterprise/retention/cleanup",
)
async def legacy_retention_cleanup(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.enterprise import trigger_retention_cleanup

    return await trigger_retention_cleanup(current_user=current_user, db=db)


@router.get(
    "/workspaces/{workspace_id}/enterprise/byok",
)
async def legacy_list_byok(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.enterprise import list_byok_credentials

    return await list_byok_credentials(current_user=current_user, db=db)


@router.delete(
    "/workspaces/{workspace_id}/integrations/{integration_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def legacy_delete_integration(
    workspace_id: str,
    integration_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.integrations import disconnect_integration

    iid = uuid.UUID(integration_id) if isinstance(integration_id, str) else integration_id
    await disconnect_integration(integration_id=iid, current_user=current_user, db=db)
    return None


@router.delete(
    "/workspaces/{workspace_id}/api-credentials/{credential_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def legacy_delete_credential(
    workspace_id: str,
    credential_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    expected_ws_id = _user_ws_id(current_user.id)
    if workspace_id != expected_ws_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    from backend.app.api.v1.assistants import revoke_api_credential

    cid = uuid.UUID(credential_id) if isinstance(credential_id, str) else credential_id
    await revoke_api_credential(credential_id=cid, current_user=current_user, db=db)
    return None


@router.post(
    "/projects/{project_id}/knowledge/search",
)
async def legacy_project_search(
    project_id: str,
    payload: DirectSearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    expected_proj_id = _user_project_id(current_user.id)
    if project_id != expected_proj_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    from backend.app.api.v1.knowledge import direct_knowledge_search

    return await direct_knowledge_search(payload=payload, current_user=current_user, db=db)
