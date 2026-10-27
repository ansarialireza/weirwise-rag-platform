"""Authentication API endpoints: registration, login, refresh, logout, password reset."""

from datetime import UTC, datetime, timedelta

from backend.app.api.dependencies import get_current_user
from backend.app.core.config import settings
from backend.app.core.security import (
    create_jwt_token,
    generate_secure_token,
    hash_password,
    hash_token,
    verify_password,
)
from backend.app.db.session import get_db_session
from backend.app.models.auth import (
    Membership,
    PasswordResetToken,
    User,
    UserSession,
    Workspace,
    WorkspaceRole,
)
from backend.app.schemas.auth import (
    AuthMessageResponse,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
)
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegisterRequest, db: AsyncSession = Depends(get_db_session)) -> UserResponse:
    """Register a new user account and provision their initial personal workspace."""
    # Check if email exists
    existing = await db.execute(select(User).where(User.email == payload.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    user = User(
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
    )
    db.add(user)
    await db.flush()

    # Automatically create user's initial default workspace
    ws_slug = f"ws-{user.id.hex[:8]}"
    workspace = Workspace(
        name=f"{user.full_name}'s Workspace",
        slug=ws_slug,
    )
    db.add(workspace)
    await db.flush()

    membership = Membership(
        workspace_id=workspace.id,
        user_id=user.id,
        role=WorkspaceRole.OWNER.value,
    )
    db.add(membership)
    await db.commit()
    await db.refresh(user)

    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: UserLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    """Authenticate user with email and password, returning JWT access token and session refresh token."""
    res = await db.execute(
        select(User).where(User.email == payload.email.lower(), User.is_active.is_(True))
    )
    user = res.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # Issue access token
    access_expiry = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_jwt_token({"sub": str(user.id), "email": user.email}, access_expiry)

    # Issue secure refresh token
    raw_refresh, refresh_hash = generate_secure_token("wwp_ref_")
    refresh_expiry = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    session = UserSession(
        user_id=user.id,
        refresh_token_hash=refresh_hash,
        expires_at=refresh_expiry,
    )
    db.add(session)
    await db.commit()

    # Set secure HttpOnly cookies for browser clients
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=not settings.DEBUG,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    payload: RefreshTokenRequest,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    """Exchange a valid refresh token for a new access token and rotated refresh token."""
    ref_hash = hash_token(payload.refresh_token)
    now = datetime.now(UTC)

    stmt = select(UserSession).where(
        UserSession.refresh_token_hash == ref_hash,
        UserSession.revoked_at.is_(None),
        UserSession.expires_at > now,
    )
    res = await db.execute(stmt)
    session = res.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid, revoked, or expired refresh token.",
        )

    # Revoke old refresh token (Token Rotation)
    session.revoked_at = now

    # Issue new refresh token
    raw_refresh, new_refresh_hash = generate_secure_token("wwp_ref_")
    new_session = UserSession(
        user_id=session.user_id,
        refresh_token_hash=new_refresh_hash,
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_session)

    # Issue new access token
    u_stmt = select(User).where(User.id == session.user_id)
    u_res = await db.execute(u_stmt)
    user = u_res.scalar_one()

    access_expiry = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_jwt_token({"sub": str(user.id), "email": user.email}, access_expiry)

    await db.commit()

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=not settings.DEBUG,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", response_model=AuthMessageResponse)
async def logout(
    response: Response,
    payload: RefreshTokenRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> AuthMessageResponse:
    """Revoke active user session and clear browser auth cookies."""
    if payload and payload.refresh_token:
        ref_hash = hash_token(payload.refresh_token)
        res = await db.execute(
            select(UserSession).where(
                UserSession.refresh_token_hash == ref_hash,
                UserSession.user_id == current_user.id,
            )
        )
        session = res.scalar_one_or_none()
        if session:
            session.revoked_at = datetime.now(UTC)
            await db.commit()

    response.delete_cookie(key="access_token")
    return AuthMessageResponse(message="Successfully logged out.")


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(user: User = Depends(get_current_user)) -> UserResponse:
    """Retrieve profile of the currently authenticated user."""
    return UserResponse.model_validate(user)


@router.post("/password-reset/request", response_model=AuthMessageResponse)
async def request_password_reset(
    payload: PasswordResetRequest,
    db: AsyncSession = Depends(get_db_session),
) -> AuthMessageResponse:
    """Request a password reset link. In development mode, returns the single-use token in response."""
    res = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = res.scalar_one_or_none()

    # Always return success message to avoid email enumeration
    if not user:
        return AuthMessageResponse(
            message="If this email is registered, password reset instructions have been dispatched."
        )

    raw_token, token_hash = generate_secure_token("wwp_rst_")
    expires = datetime.now(UTC) + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)

    reset_record = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires,
    )
    db.add(reset_record)
    await db.commit()

    # Development fallback delivery
    return AuthMessageResponse(
        message="If this email is registered, password reset instructions have been dispatched.",
        reset_token=raw_token if settings.ENVIRONMENT == "development" else None,
    )


@router.post("/password-reset/confirm", response_model=AuthMessageResponse)
async def confirm_password_reset(
    payload: PasswordResetConfirmRequest,
    db: AsyncSession = Depends(get_db_session),
) -> AuthMessageResponse:
    """Confirm password reset using single-use reset token and set new password."""
    token_hash = hash_token(payload.token)
    now = datetime.now(UTC)

    stmt = select(PasswordResetToken).where(
        PasswordResetToken.token_hash == token_hash,
        PasswordResetToken.is_used.is_(False),
        PasswordResetToken.expires_at > now,
    )
    res = await db.execute(stmt)
    reset_entry = res.scalar_one_or_none()

    if not reset_entry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid, expired, or already used password reset token.",
        )

    # Invalidate token
    reset_entry.is_used = True

    # Update user password
    u_res = await db.execute(select(User).where(User.id == reset_entry.user_id))
    user = u_res.scalar_one()
    user.hashed_password = hash_password(payload.new_password)

    await db.commit()
    return AuthMessageResponse(message="Password has been successfully updated.")
