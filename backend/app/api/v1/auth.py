"""Authentication API endpoints: registration, login, refresh, logout, email verification, password reset."""

from datetime import UTC, datetime, timedelta

from backend.app.api.dependencies import get_current_user
from backend.app.core.config import settings
from backend.app.core.security import (
    create_jwt_token,
    generate_otp_code,
    generate_secure_token,
    hash_password,
    hash_token,
    verify_password,
)
from backend.app.db.session import get_db_session
from backend.app.models.auth import (
    EmailVerificationToken,
    Membership,
    PasswordResetToken,
    SubscriptionTier,
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
    ResendVerificationRequest,
    SendOtpLoginRequest,
    TokenResponse,
    UserLoginRequest,
    UserOtpLoginRequest,
    UserRegisterRequest,
    UserResponse,
    VerifyEmailRequest,
)
from backend.app.services.auth_rate_limiter import AuthRateLimiter, client_ip, enforce_limit
from backend.app.services.email import email_service
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=AuthMessageResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> AuthMessageResponse:
    """Register a new user account with is_verified=False, generate 6-digit OTP, and dispatch verification email."""
    ip = client_ip(request)
    enforce_limit(
        await AuthRateLimiter.check_and_record(
            "register_ip",
            ip,
            settings.AUTH_REGISTER_IP_LIMIT,
            settings.AUTH_REGISTER_IP_WINDOW_SECONDS,
        ),
        "Too many registration attempts. Please try again later.",
    )

    # Check if email exists
    existing = await db.execute(select(User).where(User.email == payload.email.lower()))
    existing_user = existing.scalar_one_or_none()
    if existing_user:
        if existing_user.is_verified:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email address already exists.",
            )
        # If unverified account exists, re-issue OTP and update password/name
        existing_user.hashed_password = hash_password(payload.password)
        if payload.full_name:
            existing_user.full_name = payload.full_name
        user = existing_user
    else:
        resolved_name = (payload.full_name or "").strip() or payload.email.split("@")[0].capitalize()
        user = User(
            email=payload.email.lower(),
            hashed_password=hash_password(payload.password),
            full_name=resolved_name,
            is_active=True,
            is_verified=False,
        )
        db.add(user)
        await db.flush()

        # Provision initial personal workspace & primary project for user
        first_name = (user.full_name or "").strip().split()[0] if user.full_name else ""
        if not first_name:
            first_name = user.email.split("@")[0].capitalize()
        ws_name = f"{first_name}'s Workspace"
        ws_slug = f"ws-{user.id.hex[:8]}"

        tier_res = await db.execute(select(SubscriptionTier).where(SubscriptionTier.name == "Free Trial"))
        default_tier = tier_res.scalar_one_or_none()
        if not default_tier:
            tier_res = await db.execute(select(SubscriptionTier).order_by(SubscriptionTier.monthly_price.asc()))
            default_tier = tier_res.scalars().first()

        workspace = Workspace(
            name=ws_name,
            slug=ws_slug,
            plan_tier=default_tier.name.lower().replace(" ", "_") if default_tier else "free",
            subscription_tier_id=default_tier.id if default_tier else None,
        )
        db.add(workspace)
        await db.flush()

        membership = Membership(
            workspace_id=workspace.id,
            user_id=user.id,
            role=WorkspaceRole.OWNER.value,
        )
        db.add(membership)

        # Provision initial intuitive project for user
        from backend.app.models.project import Project

        initial_project = Project(
            workspace_id=workspace.id,
            name="Main Project",
            slug=f"proj-{user.id.hex[:8]}",
            description="Primary workspace project for knowledge bases and assistants.",
        )
        db.add(initial_project)

    # Invalidate any prior unused OTPs for this user
    await db.execute(
        select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.is_used.is_(False),
        )
    )

    # Generate 6-digit OTP
    otp_code = generate_otp_code(4)
    otp_hash = hash_token(otp_code)
    otp_expiry = datetime.now(UTC) + timedelta(minutes=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES)

    verification_token = EmailVerificationToken(
        user_id=user.id,
        token_hash=otp_hash,
        expires_at=otp_expiry,
    )
    db.add(verification_token)
    await db.commit()

    # Trigger email service
    await email_service.send_verification_otp(user.email, otp_code)

    return AuthMessageResponse(
        message="Account created successfully. Please enter the verification code sent to your email.",
        verification_otp=otp_code if (settings.DEBUG or settings.ENVIRONMENT in ("development", "dev", "test")) else None,
    )


@router.post("/verify-email", response_model=AuthMessageResponse)
async def verify_email(
    payload: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db_session),
) -> AuthMessageResponse:
    """Verify user account with 6-digit OTP and set is_verified=True."""
    res = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found. Please register first.",
        )

    if user.is_verified:
        return AuthMessageResponse(message="Account is already verified. You can log in.")

    now = datetime.now(UTC)
    otp_hash = hash_token(payload.otp.strip())

    token_stmt = select(EmailVerificationToken).where(
        EmailVerificationToken.user_id == user.id,
        EmailVerificationToken.token_hash == otp_hash,
        EmailVerificationToken.is_used.is_(False),
        EmailVerificationToken.expires_at > now,
    )
    token_res = await db.execute(token_stmt)
    token_entry = token_res.scalar_one_or_none()

    if not token_entry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code.",
        )

    # Mark token used & verify user
    token_entry.is_used = True
    user.is_verified = True
    user.is_active = True
    await db.commit()

    return AuthMessageResponse(message="Email verified successfully. Your account is now active.")


@router.post("/resend-verification", response_model=AuthMessageResponse)
async def resend_verification(
    payload: ResendVerificationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> AuthMessageResponse:
    """Resend a new 6-digit verification OTP to the user's email."""
    email = payload.email.lower()
    ip = client_ip(request)
    enforce_limit(
        await AuthRateLimiter.check_and_record(
            "resend_email", email, settings.AUTH_RESET_EMAIL_LIMIT, settings.AUTH_RESET_EMAIL_WINDOW_SECONDS
        ),
        "Too many verification requests. Please try again later.",
    )
    enforce_limit(
        await AuthRateLimiter.check_and_record(
            "resend_ip", ip, settings.AUTH_RESET_IP_LIMIT, settings.AUTH_RESET_IP_WINDOW_SECONDS
        ),
        "Too many verification requests. Please try again later.",
    )

    res = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = res.scalar_one_or_none()

    if not user:
        # Avoid email enumeration
        return AuthMessageResponse(
            message="If this email is registered and unverified, a new verification code has been dispatched."
        )

    if user.is_verified:
        return AuthMessageResponse(message="Account is already verified. You can log in.")

    # Generate new 6-digit OTP
    otp_code = generate_otp_code(4)
    otp_hash = hash_token(otp_code)
    otp_expiry = datetime.now(UTC) + timedelta(minutes=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES)

    verification_token = EmailVerificationToken(
        user_id=user.id,
        token_hash=otp_hash,
        expires_at=otp_expiry,
    )
    db.add(verification_token)
    await db.commit()

    await email_service.send_verification_otp(user.email, otp_code)

    return AuthMessageResponse(
        message="A new verification code has been dispatched to your email.",
        verification_otp=otp_code if (settings.DEBUG or settings.ENVIRONMENT in ("development", "dev", "test")) else None,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: UserLoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    """Authenticate user with email and password, returning JWT access token and session refresh token."""
    email = payload.email.lower()
    ip = client_ip(request)
    account_key = f"{email}|{ip}"

    enforce_limit(
        await AuthRateLimiter.check_and_record(
            "login_ip_attempt",
            ip,
            settings.AUTH_LOGIN_IP_ATTEMPT_LIMIT,
            settings.AUTH_LOGIN_IP_WINDOW_SECONDS,
        )
    )
    enforce_limit(
        await AuthRateLimiter.check(
            "login_ip_failure", ip, settings.AUTH_LOGIN_IP_LIMIT, settings.AUTH_LOGIN_IP_WINDOW_SECONDS
        )
    )
    enforce_limit(
        await AuthRateLimiter.check(
            "login_account_failure",
            account_key,
            settings.AUTH_LOGIN_ACCOUNT_LIMIT,
            settings.AUTH_LOGIN_ACCOUNT_WINDOW_SECONDS,
        )
    )
    enforce_limit(
        await AuthRateLimiter.check(
            "login_account_global",
            email,
            settings.AUTH_LOGIN_ACCOUNT_GLOBAL_LIMIT,
            settings.AUTH_LOGIN_ACCOUNT_GLOBAL_WINDOW_SECONDS,
        )
    )

    res = await db.execute(select(User).where(User.email == email, User.is_active.is_(True)))
    user = res.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        ip_failure = await AuthRateLimiter.check_and_record(
            "login_ip_failure", ip, settings.AUTH_LOGIN_IP_LIMIT, settings.AUTH_LOGIN_IP_WINDOW_SECONDS
        )
        account_failure = await AuthRateLimiter.check_and_record(
            "login_account_failure",
            account_key,
            settings.AUTH_LOGIN_ACCOUNT_LIMIT,
            settings.AUTH_LOGIN_ACCOUNT_WINDOW_SECONDS,
        )
        global_failure = await AuthRateLimiter.check_and_record(
            "login_account_global",
            email,
            settings.AUTH_LOGIN_ACCOUNT_GLOBAL_LIMIT,
            settings.AUTH_LOGIN_ACCOUNT_GLOBAL_WINDOW_SECONDS,
        )
        for decision in (ip_failure, account_failure, global_failure):
            if not decision.allowed:
                enforce_limit(decision)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That email or password doesn't match. Please try again.",
        )

    await AuthRateLimiter.reset("login_account_failure", account_key)
    await AuthRateLimiter.reset("login_account_global", email)

    if not user.is_verified and not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account email is not verified. Please verify your email before logging in.",
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

    # Set secure, persistent HttpOnly cookies for browser clients (30-day session retention)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=not settings.DEBUG,
        max_age=settings.SESSION_COOKIE_MAX_AGE_SECONDS,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=raw_refresh,
        httponly=True,
        samesite="lax",
        secure=not settings.DEBUG,
        max_age=settings.SESSION_COOKIE_MAX_AGE_SECONDS,
        path="/",
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.SESSION_COOKIE_MAX_AGE_SECONDS,
    )


@router.post("/send-otp", response_model=AuthMessageResponse)
async def send_login_otp(
    payload: SendOtpLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> AuthMessageResponse:
    """Send an OTP code for passwordless email login."""
    ip = client_ip(request)
    email = payload.email.strip().lower()

    # Rate limiting
    ip_limit = await AuthRateLimiter.check("otp_ip", ip, 5, 300)
    if not ip_limit.allowed:
        enforce_limit(ip_limit)

    stmt = select(User).where(User.email == email)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        # Prevent user enumeration: respond generically without sending email
        return AuthMessageResponse(
            message="If an account exists with this email, a verification code has been sent.",
            verification_otp=None,
        )

    # Invalidate old email tokens
    old_tokens_stmt = select(EmailVerificationToken).where(
        EmailVerificationToken.user_id == user.id,
        EmailVerificationToken.is_used.is_(False),
    )
    old_tokens = (await db.execute(old_tokens_stmt)).scalars().all()
    for tok in old_tokens:
        tok.is_used = True

    otp_code = generate_otp_code(4)
    otp_hash = hash_token(otp_code)
    otp_expiry = datetime.now(UTC) + timedelta(minutes=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES)

    db.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=otp_hash,
            expires_at=otp_expiry,
            is_used=False,
        )
    )
    await db.commit()

    await email_service.send_verification_otp(user.email, otp_code)

    return AuthMessageResponse(
        message="Verification code sent to your email.",
        verification_otp=None,
    )


@router.post("/login-otp", response_model=TokenResponse)
async def login_with_otp(
    payload: UserOtpLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    """Authenticate and create persistent session via email OTP."""
    ip = client_ip(request)
    email = payload.email.strip().lower()

    ip_limit = await AuthRateLimiter.check("otp_login_ip", ip, 10, 300)
    if not ip_limit.allowed:
        enforce_limit(ip_limit)

    stmt = select(User).where(User.email == email)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification code.",
        )

    otp_hash = hash_token(payload.otp.strip())
    now = datetime.now(UTC)

    tok_stmt = select(EmailVerificationToken).where(
        EmailVerificationToken.user_id == user.id,
        EmailVerificationToken.token_hash == otp_hash,
        EmailVerificationToken.is_used.is_(False),
        EmailVerificationToken.expires_at > now,
    )
    tok_res = await db.execute(tok_stmt)
    token_record = tok_res.scalar_one_or_none()

    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification code.",
        )

    token_record.is_used = True
    if not user.is_verified:
        user.is_verified = True

    # Issue access token
    access_expiry = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_jwt_token({"sub": str(user.id), "email": user.email}, access_expiry)

    # Issue persistent refresh token (30 days)
    raw_refresh, refresh_hash = generate_secure_token("wwp_ref_")
    refresh_expiry = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    session = UserSession(
        user_id=user.id,
        refresh_token_hash=refresh_hash,
        expires_at=refresh_expiry,
    )
    db.add(session)
    await db.commit()

    # Set secure persistent HttpOnly cookies (30 days)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=not settings.DEBUG,
        max_age=settings.SESSION_COOKIE_MAX_AGE_SECONDS,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=raw_refresh,
        httponly=True,
        samesite="lax",
        secure=not settings.DEBUG,
        max_age=settings.SESSION_COOKIE_MAX_AGE_SECONDS,
        path="/",
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.SESSION_COOKIE_MAX_AGE_SECONDS,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    response: Response,
    payload: RefreshTokenRequest | None = None,
    refresh_token_cookie: str | None = Cookie(None, alias="refresh_token"),
    db: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    """Exchange a valid refresh token for a new access token and rotated refresh token."""
    raw_token = payload.refresh_token if (payload and payload.refresh_token) else refresh_token_cookie
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token was not provided.",
        )

    ref_hash = hash_token(raw_token)
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
        max_age=settings.SESSION_COOKIE_MAX_AGE_SECONDS,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=raw_refresh,
        httponly=True,
        samesite="lax",
        secure=not settings.DEBUG,
        max_age=settings.SESSION_COOKIE_MAX_AGE_SECONDS,
        path="/",
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.SESSION_COOKIE_MAX_AGE_SECONDS,
    )


@router.post("/logout", response_model=AuthMessageResponse)
async def logout(
    response: Response,
    payload: RefreshTokenRequest | None = None,
    refresh_token_cookie: str | None = Cookie(None, alias="refresh_token"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> AuthMessageResponse:
    """Revoke active user session and clear browser auth cookies."""
    target_refresh = (payload.refresh_token if payload and payload.refresh_token else None) or refresh_token_cookie
    if target_refresh:
        ref_hash = hash_token(target_refresh)
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

    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
    return AuthMessageResponse(message="Successfully logged out.")


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(user: User = Depends(get_current_user)) -> UserResponse:
    """Retrieve profile of the currently authenticated user."""
    return UserResponse.model_validate(user)


@router.post("/forgot-password", response_model=AuthMessageResponse)
@router.post("/password-reset/request", response_model=AuthMessageResponse)
async def request_password_reset(
    payload: PasswordResetRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> AuthMessageResponse:
    """Request a password reset code / token. Triggers email delivery."""
    email = payload.email.lower()
    ip = client_ip(request)
    enforce_limit(
        await AuthRateLimiter.check_and_record(
            "reset_email", email, settings.AUTH_RESET_EMAIL_LIMIT, settings.AUTH_RESET_EMAIL_WINDOW_SECONDS
        ),
        "Too many password reset requests. Please try again later.",
    )
    enforce_limit(
        await AuthRateLimiter.check_and_record(
            "reset_ip", ip, settings.AUTH_RESET_IP_LIMIT, settings.AUTH_RESET_IP_WINDOW_SECONDS
        ),
        "Too many password reset requests. Please try again later.",
    )

    res = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = res.scalar_one_or_none()

    # Always return generic success message to avoid email enumeration
    if not user:
        return AuthMessageResponse(
            message="If this email is registered, password reset instructions have been dispatched."
        )

    # Generate 6-digit OTP or secure token for password reset
    raw_token = generate_otp_code(4)
    token_hash = hash_token(raw_token)
    expires = datetime.now(UTC) + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)

    reset_record = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires,
    )
    db.add(reset_record)
    await db.commit()

    # Send reset email
    await email_service.send_password_reset_email(user.email, raw_token)

    return AuthMessageResponse(
        message="If this email is registered, password reset instructions have been dispatched.",
        reset_token=raw_token if (settings.DEBUG or settings.ENVIRONMENT in ("development", "dev", "test")) else None,
    )


@router.post("/reset-password", response_model=AuthMessageResponse)
@router.post("/password-reset/confirm", response_model=AuthMessageResponse)
async def confirm_password_reset(
    payload: PasswordResetConfirmRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> AuthMessageResponse:
    """Confirm password reset using single-use reset token/code and set new password."""
    ip = client_ip(request)
    token_hash = hash_token(payload.token.strip())
    enforce_limit(
        await AuthRateLimiter.check_and_record("reset_token", token_hash, 10, 900),
        "Too many reset attempts. Please request a new code.",
    )
    enforce_limit(
        await AuthRateLimiter.check_and_record(
            "reset_confirm_ip", ip, settings.AUTH_RESET_IP_LIMIT, settings.AUTH_RESET_IP_WINDOW_SECONDS
        ),
        "Too many reset attempts. Please try again later.",
    )
    now = datetime.now(UTC)

    # If email provided, narrow search to that user for extra precision
    if payload.email:
        u_res = await db.execute(select(User).where(User.email == payload.email.lower()))
        target_user = u_res.scalar_one_or_none()
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid, expired, or already used password reset code.",
            )
        stmt = select(PasswordResetToken).where(
            PasswordResetToken.user_id == target_user.id,
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.is_used.is_(False),
            PasswordResetToken.expires_at > now,
        )
    else:
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
            detail="Invalid, expired, or already used password reset code.",
        )

    # Invalidate token
    reset_entry.is_used = True

    # Update user password & ensure verified
    u_res = await db.execute(select(User).where(User.id == reset_entry.user_id))
    user = u_res.scalar_one()
    user.hashed_password = hash_password(payload.new_password)
    user.is_verified = True
    user.is_active = True

    await db.commit()
    return AuthMessageResponse(message="Password has been successfully updated. You may now log in.")
