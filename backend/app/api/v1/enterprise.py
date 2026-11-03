"""User Enterprise BYOK API endpoints."""

import uuid

from backend.app.api.dependencies import get_current_user
from backend.app.core.security import encrypt_token
from backend.app.db.session import get_db_session
from backend.app.models.assistant import UserBYOKCredential
from backend.app.models.auth import User
from backend.app.schemas.assistant import WorkspaceBYOKCreateRequest, WorkspaceBYOKResponse
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/enterprise", tags=["Enterprise & BYOK"])


@router.post("/byok", response_model=WorkspaceBYOKResponse, status_code=status.HTTP_201_CREATED)
async def create_user_byok(
    payload: WorkspaceBYOKCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> WorkspaceBYOKResponse:
    """Store encrypted BYOK credential for user."""
    encrypted_val = encrypt_token(payload.api_key)
    key_pfx = payload.api_key[:8]

    stmt = select(UserBYOKCredential).where(
        UserBYOKCredential.user_id == current_user.id,
        UserBYOKCredential.provider_name == payload.provider_name,
    )
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()

    if existing:
        existing.api_endpoint = payload.api_endpoint
        existing.deployment_id = payload.deployment_id
        existing.api_version = payload.api_version
        existing.key_prefix = key_pfx
        existing.encrypted_key = encrypted_val
        existing.is_active = True
        await db.commit()
        await db.refresh(existing)
        return WorkspaceBYOKResponse.model_validate(existing)

    byok = UserBYOKCredential(
        user_id=current_user.id,
        provider_name=payload.provider_name,
        api_endpoint=payload.api_endpoint,
        deployment_id=payload.deployment_id,
        api_version=payload.api_version,
        key_prefix=key_pfx,
        encrypted_key=encrypted_val,
    )
    db.add(byok)
    await db.commit()
    await db.refresh(byok)
    return WorkspaceBYOKResponse.model_validate(byok)


@router.get("/byok", response_model=list[WorkspaceBYOKResponse])
async def list_user_byok(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[WorkspaceBYOKResponse]:
    """List BYOK credentials configured by current user."""
    stmt = select(UserBYOKCredential).where(UserBYOKCredential.user_id == current_user.id)
    res = await db.execute(stmt)
    return [WorkspaceBYOKResponse.model_validate(c) for c in res.scalars().all()]


@router.delete("/byok/{provider_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_byok(
    provider_name: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a user BYOK credential."""
    stmt = select(UserBYOKCredential).where(
        UserBYOKCredential.user_id == current_user.id,
        UserBYOKCredential.provider_name == provider_name,
    )
    res = await db.execute(stmt)
    cred = res.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found.")
    await db.delete(cred)
    await db.commit()
