"""Password hashing (PBKDF2-HMAC-SHA256) and JWT token operations."""

import base64
import hashlib
import hmac
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from backend.app.core.config import settings


def hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with a cryptographically secure random salt."""
    salt = os.urandom(16)
    iterations = 100_000
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    salt_b64 = base64.b64encode(salt).decode("ascii")
    derived_b64 = base64.b64encode(derived).decode("ascii")
    return f"pbkdf2_sha256${iterations}${salt_b64}${derived_b64}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against the stored PBKDF2-HMAC-SHA256 hash."""
    try:
        parts = hashed_password.split("$")
        if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
            return False
        iterations = int(parts[1])
        salt = base64.b64decode(parts[2].encode("ascii"))
        expected_derived = base64.b64decode(parts[3].encode("ascii"))

        derived = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(derived, expected_derived)
    except Exception:
        return False


_COMMON_PASSWORDS = {
    "password",
    "password1",
    "password123",
    "password1234",
    "passw0rd",
    "qwertyuiop",
    "qwerty123",
    "123456789012",
    "1234567890123",
    "letmein12345",
    "welcome12345",
    "admin123456",
    "changeme1234",
    "iloveyou1234",
    "weirwise1234",
}


def password_policy_error(password: str) -> str | None:
    """Return a human-readable policy violation, or None when the password is acceptable."""
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        return f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters long."
    if len(password) > 128:
        return "Password must be at most 128 characters long."
    if password.strip().lower() in _COMMON_PASSWORDS:
        return "Password is too common. Choose a less predictable password."
    classes = sum(
        (
            any(c.islower() for c in password),
            any(c.isupper() for c in password),
            any(c.isdigit() for c in password),
            any(not c.isalnum() for c in password),
        )
    )
    if classes < settings.PASSWORD_MIN_CHARACTER_CLASSES:
        return (
            "Password must include at least "
            f"{settings.PASSWORD_MIN_CHARACTER_CLASSES} of: lowercase letters, uppercase letters, digits, symbols."
        )
    return None


def hash_token(token: str) -> str:
    """Hash a sensitive token (refresh token, reset token, API key) with SHA-256 for database storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_secure_token(prefix: str = "wwp_") -> tuple[str, str]:
    """Generate a raw secure token and its SHA-256 hash.
    The raw token is returned once to the caller; only the hash is persisted in the database.
    """
    raw = f"{prefix}{secrets.token_hex(24)}"
    hashed = hash_token(raw)
    return raw, hashed


def generate_otp_code(length: int = 6) -> str:
    """Generate a cryptographically secure numeric OTP code (e.g. 6-digit)."""
    return "".join(secrets.choice("0123456789") for _ in range(length))


def create_jwt_token(data: dict[str, Any], expires_delta: timedelta) -> str:
    """Create a signed JWT token with explicit expiration and standard claims."""
    now = datetime.now(UTC)
    to_encode = data.copy()
    to_encode.update(
        {
            "iat": now,
            "exp": now + expires_delta,
            "jti": secrets.token_hex(16),
        }
    )
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_jwt_token(token: str) -> dict[str, Any] | None:
    """Decode and verify a signed JWT token. Returns None on signature mismatch or expiration."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
