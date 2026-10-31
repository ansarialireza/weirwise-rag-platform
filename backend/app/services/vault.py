"""Cryptographic vault for encrypting, decrypting, and masking AI API credentials."""

import base64
import hashlib

from backend.app.core.config import settings
from cryptography.fernet import Fernet


def _get_encryption_key() -> bytes:
    """Derive a deterministic 32-byte Fernet key from SECRET_KEY."""
    raw = settings.SECRET_KEY.encode("utf-8")
    derived_32 = hashlib.sha256(raw).digest()
    return base64.urlsafe_b64encode(derived_32)


def encrypt_credential_secret(secret: str) -> tuple[str, str, str]:
    """Encrypt a secret API key at rest using AES-CBC/HMAC-SHA256 (Fernet).

    Returns:
        (encrypted_secret, secret_hash, key_prefix)
    """
    fernet = Fernet(_get_encryption_key())
    encrypted = fernet.encrypt(secret.strip().encode("utf-8")).decode("utf-8")
    secret_hash = hashlib.sha256(secret.strip().encode("utf-8")).hexdigest()

    # Prefix mask (first 7 chars + ... + last 4 chars)
    s = secret.strip()
    if len(s) > 12:
        prefix = f"{s[:7]}...{s[-4:]}"
    else:
        prefix = f"{s[:3]}..."

    return encrypted, secret_hash, prefix


def decrypt_credential_secret(encrypted_secret: str) -> str:
    """Decrypt a stored API credential for backend execution only."""
    fernet = Fernet(_get_encryption_key())
    decrypted = fernet.decrypt(encrypted_secret.encode("utf-8")).decode("utf-8")
    return decrypted


class CredentialVaultService:
    @staticmethod
    def encrypt_secret(secret: str) -> str:
        fernet = Fernet(_get_encryption_key())
        return fernet.encrypt(secret.strip().encode("utf-8")).decode("utf-8")

    @staticmethod
    def decrypt_secret(encrypted_secret: str) -> str:
        return decrypt_credential_secret(encrypted_secret)

