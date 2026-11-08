"""Enterprise BYOK, Azure OpenAI Configuration, and Advanced Retention Management."""

import uuid

from backend.app.api.dependencies import get_current_user
from backend.app.db.session import get_db_session
from backend.app.models.assistant import WorkspaceBYOKCredential
from backend.app.models.auth import User
from backend.app.schemas.assistant import (
    WorkspaceBYOKCreateRequest,
    WorkspaceBYOKResponse,
)
from backend.app.services.retention import retention_service
from backend.app.services.vault import CredentialVaultService
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/enterprise", tags=["Enterprise & BYOK"])


@router.post("/byok", response_model=WorkspaceBYOKResponse, status_code=status.HTTP_201_CREATED)
async def configure_byok(
    payload: WorkspaceBYOKCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> WorkspaceBYOKResponse:
    """Store customer-managed provider API keys encrypted at rest with masked preview."""
    # Validate provider specifics
    if payload.provider_name == "azure_openai" and not (payload.api_endpoint and payload.deployment_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Azure OpenAI requires both 'api_endpoint' and 'deployment_id'.",
        )

    encrypted = CredentialVaultService.encrypt_secret(payload.api_key)
    masked_prefix = f"{payload.api_key[:4]}...{payload.api_key[-4:]}"

    # Upsert BYOK record
    stmt = select(WorkspaceBYOKCredential).where(
        WorkspaceBYOKCredential.user_id == current_user.id,
        WorkspaceBYOKCredential.provider_name == payload.provider_name,
    )
    res = await db.execute(stmt)
    byok = res.scalar_one_or_none()

    if byok:
        byok.encrypted_key = encrypted
        byok.key_prefix = masked_prefix
        byok.api_endpoint = payload.api_endpoint
        byok.deployment_id = payload.deployment_id
        byok.api_version = payload.api_version or "2024-02-15-preview"
        byok.is_active = True
    else:
        byok = WorkspaceBYOKCredential(
            user_id=current_user.id,
            provider_name=payload.provider_name,
            api_endpoint=payload.api_endpoint,
            deployment_id=payload.deployment_id,
            api_version=payload.api_version or "2024-02-15-preview",
            key_prefix=masked_prefix,
            encrypted_key=encrypted,
            is_active=True,
        )
        db.add(byok)

    await db.commit()
    await db.refresh(byok)
    return WorkspaceBYOKResponse.model_validate(byok)


@router.get("/byok", response_model=list[WorkspaceBYOKResponse])
async def list_byok_credentials(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[WorkspaceBYOKResponse]:
    """List configured BYOK providers (keys masked) for authenticated user."""
    stmt = select(WorkspaceBYOKCredential).where(WorkspaceBYOKCredential.user_id == current_user.id)
    res = await db.execute(stmt)
    return [WorkspaceBYOKResponse.model_validate(b) for b in res.scalars().all()]


@router.delete("/byok/{provider_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_byok_credential(
    provider_name: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Revoke and delete a BYOK credential."""
    stmt = select(WorkspaceBYOKCredential).where(
        WorkspaceBYOKCredential.user_id == current_user.id,
        WorkspaceBYOKCredential.provider_name == provider_name,
    )
    res = await db.execute(stmt)
    byok = res.scalar_one_or_none()
    if not byok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BYOK credential not found.")

    await db.delete(byok)
    await db.commit()


@router.post("/retention/cleanup")
async def trigger_retention_cleanup(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Execute retention policy cleanup to delete expired conversations and audit logs for authenticated user."""
    stats = await retention_service.cleanup_expired_data(db, current_user.id)
    return {"status": "success", "user_id": str(current_user.id), **stats}
