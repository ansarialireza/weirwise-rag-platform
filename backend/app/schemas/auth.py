"""Pydantic schemas for Authentication and User management."""

import re
import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field
from pydantic.functional_validators import AfterValidator

# Robust regex-based email validator independent of optional C dependencies
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


def validate_email_str(v: str) -> str:
    cleaned = v.strip().lower()
    if not EMAIL_REGEX.match(cleaned):
        raise ValueError("Invalid email address format.")
    return cleaned


EmailStrType = Annotated[str, AfterValidator(validate_email_str)]


class UserRegisterRequest(BaseModel):
    email: EmailStrType
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=255)


class UserLoginRequest(BaseModel):
    email: EmailStrType
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshTokenRequest(BaseModel):
    refresh_token: str | None = None


class PasswordResetRequest(BaseModel):
    email: EmailStrType


class PasswordResetConfirmRequest(BaseModel):
    email: EmailStrType | None = None
    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    email: EmailStrType
    otp: str = Field(..., min_length=6, max_length=64)


class ResendVerificationRequest(BaseModel):
    email: EmailStrType


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    is_active: bool
    is_verified: bool = False
    is_superuser: bool
    created_at: datetime
    updated_at: datetime


class AuthMessageResponse(BaseModel):
    message: str
    reset_token: str | None = None  # Returned in development mode when email is not configured
    verification_otp: str | None = None  # Returned in development mode
