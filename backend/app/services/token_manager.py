"""Token Failover Manager and Proactive Health Validator.

Manages token rotation across AI Providers (Jina AI, OpenAI, Deepgram, etc.),
proactively validates token balances, and handles transparent failover upon rate limits (429),
expired/unauthorized credentials (401, 403), or provider server degradation (503).
"""

import logging
import re
import uuid
from typing import Any, Optional

import httpx
from backend.app.db.session import get_db_session
from backend.app.models.admin import (
    AdminAuditLog,
    CredentialHealthStatus,
    ProviderAccount,
    ProviderCredential,
)
from backend.app.services.vault import decrypt_credential_secret, encrypt_credential_secret
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("weirwise.token_manager")


class TokenManager:
    """Smart Failover & Token Rotation Engine for external AI Provider APIs."""

    @staticmethod
    async def validate_jina_token(token: str) -> dict[str, Any]:
        """Proactively validate a Jina AI API token against the live Jina API.

        Queries the Reader/Embedding endpoint, verifies HTTP 200, and extracts
        available token balance / usage limits.
        """
        clean_token = token.strip()
        if not clean_token:
            return {"valid": False, "error": "Empty token provided."}

        url = "https://r.jina.ai"
        headers = {
            "Authorization": f"Bearer {clean_token}",
            "Accept": "application/json, text/plain",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers)

                if resp.status_code == 200:
                    body_text = resp.text
                    remaining_balance = "Active (Verified)"

                    # 1. Check response headers for usage or rate limit details
                    rate_limit_rem = resp.headers.get("x-ratelimit-remaining") or resp.headers.get("x-usage-tokens")
                    if rate_limit_rem:
                        remaining_balance = f"{rate_limit_rem} tokens remaining"
                    else:
                        # 2. Extract remaining balance pattern from Reader response if present
                        # Look for patterns like "Remaining Tokens: 4,500,000" or "Balance: 10M"
                        balance_match = re.search(r"(?:remaining|balance|tokens?):\s*([0-9.,]+[kKmMbB]?)", body_text, re.IGNORECASE)
                        if balance_match:
                            remaining_balance = f"{balance_match.group(1)} tokens left"

                    return {
                        "valid": True,
                        "status_code": 200,
                        "remaining_balance": remaining_balance,
                    }

                elif resp.status_code in (401, 403):
                    return {
                        "valid": False,
                        "status_code": resp.status_code,
                        "error": "Authentication failed: Invalid or expired API token.",
                    }
                elif resp.status_code == 429:
                    return {
                        "valid": False,
                        "status_code": 429,
                        "error": "Rate limited: API token has exhausted its quota.",
                    }
                else:
                    return {
                        "valid": False,
                        "status_code": resp.status_code,
                        "error": f"API responded with status {resp.status_code}.",
                    }

        except httpx.TimeoutException:
            return {"valid": False, "error": "Jina API validation timed out."}
        except Exception as e:
            logger.error(f"Failed to validate Jina token: {e!s}")
            return {"valid": False, "error": f"Connection error: {e!s}"}

    @staticmethod
    async def validate_and_save_provider_tokens(
        provider_name: str,
        raw_tokens_text: str,
        admin_id: uuid.UUID,
        admin_email: str,
        db: AsyncSession,
    ) -> list[dict[str, Any]]:
        """Parses multi-line/comma-separated tokens, validates them live,

        and updates the encrypted credentials pool in PostgreSQL.
        """
        # 1. Resolve or create provider account
        res = await db.execute(
            select(ProviderAccount).where(ProviderAccount.provider_name == provider_name.lower())
        )
        provider = res.scalar_one_or_none()
        if not provider:
            display_names = {
                "jina": "Jina AI Embeddings",
                "openai": "OpenAI LLM",
                "deepgram": "Deepgram Speech",
            }
            provider = ProviderAccount(
                provider_name=provider_name.lower(),
                display_name=display_names.get(provider_name.lower(), provider_name.title()),
                is_enabled=True,
            )
            db.add(provider)
            await db.flush()

        # 2. Parse input tokens (one per line, comma, or semicolon)
        tokens = [
            t.strip()
            for t in re.split(r"[\n,;]+", raw_tokens_text)
            if t.strip() and not t.strip().startswith("#")
        ]

        results = []
        for idx, token in enumerate(tokens):
            val_res: dict[str, Any] = {"token_prefix": f"{token[:6]}...{token[-4:]}" if len(token) > 10 else "..."}

            # Proactive verification for Jina AI
            if provider_name.lower() in ("jina", "jina_ai", "jinaai"):
                validation = await TokenManager.validate_jina_token(token)
                is_valid = validation.get("valid", False)
                balance = validation.get("remaining_balance", "Unknown")
                health = CredentialHealthStatus.HEALTHY.value if is_valid else CredentialHealthStatus.FAILED.value
                val_res["status"] = "active" if is_valid else "error"
                val_res["remaining_balance"] = balance
                val_res["error"] = validation.get("error")
            else:
                # Generic fallback for OpenAI/Deepgram
                is_valid = len(token) > 8
                health = CredentialHealthStatus.HEALTHY.value
                balance = "Active"
                val_res["status"] = "active" if is_valid else "error"
                val_res["remaining_balance"] = balance

            # Encrypt and persist
            encrypted_secret, secret_hash, key_prefix = encrypt_credential_secret(token)

            # Check if token exists by secret hash
            existing_cred = (
                await db.execute(
                    select(ProviderCredential).where(
                        ProviderCredential.provider_id == provider.id,
                        ProviderCredential.secret_hash == secret_hash,
                    )
                )
            ).scalar_one_or_none()

            if existing_cred:
                existing_cred.priority = idx + 1
                existing_cred.is_active = is_valid
                existing_cred.health_status = health
                existing_cred.remaining_balance = balance
                val_res["id"] = str(existing_cred.id)
            else:
                cred = ProviderCredential(
                    provider_id=provider.id,
                    label=f"{provider.display_name} Token #{idx + 1}",
                    key_prefix=key_prefix,
                    encrypted_secret=encrypted_secret,
                    secret_hash=secret_hash,
                    priority=idx + 1,
                    is_active=is_valid,
                    health_status=health,
                    remaining_balance=balance,
                )
                db.add(cred)
                await db.flush()
                val_res["id"] = str(cred.id)

            results.append(val_res)

        # Audit log
        audit = AdminAuditLog(
            actor_id=admin_id,
            actor_email=admin_email,
            action="provider.tokens_updated",
            target_entity="provider",
            target_id=str(provider.id),
            details={"provider": provider_name, "token_count": len(tokens)},
        )
        db.add(audit)
        await db.commit()
        return results

    @staticmethod
    async def execute_with_failover(
        provider_name: str,
        request_func: Any,
        db: AsyncSession,
    ) -> Any:
        """Executes an API call using the highest-priority active token.

        If a rate limit (429) or auth error (401, 403) is caught, immediately
        degrades the failing token and rotates to the next available token.
        """
        res = await db.execute(
            select(ProviderAccount).where(ProviderAccount.provider_name == provider_name.lower())
        )
        provider = res.scalar_one_or_none()
        if not provider:
            raise RuntimeError(f"No configured provider account for '{provider_name}'.")

        # Fetch active credentials in order of priority (lower number = higher priority)
        creds_res = await db.execute(
            select(ProviderCredential)
            .where(
                ProviderCredential.provider_id == provider.id,
                ProviderCredential.is_active.is_(True),
                ProviderCredential.health_status != CredentialHealthStatus.EXHAUSTED.value,
            )
            .order_by(ProviderCredential.priority.asc())
        )
        available_creds = list(creds_res.scalars().all())

        if not available_creds:
            raise RuntimeError(f"All API tokens for provider '{provider_name}' are exhausted or inactive.")

        last_error = None
        for cred in available_creds:
            token = decrypt_credential_secret(cred.encrypted_secret)
            try:
                # Attempt API request with the decrypted token
                response = await request_func(token)

                # Record success on credential
                cred.consecutive_failures = 0
                cred.health_status = CredentialHealthStatus.HEALTHY.value
                await db.commit()
                return response

            except httpx.HTTPStatusError as e:
                status_code = e.response.status_code
                logger.warning(
                    f"Token {cred.key_prefix} failed with HTTP {status_code}: {e!s}. Initiating failover..."
                )
                cred.consecutive_failures += 1
                if status_code in (401, 403):
                    cred.health_status = CredentialHealthStatus.FAILED.value
                    cred.is_active = False
                elif status_code == 429:
                    cred.health_status = CredentialHealthStatus.RATE_LIMITED.value

                cred.last_error_reason = f"HTTP {status_code}"
                await db.commit()
                last_error = e

            except Exception as e:
                logger.warning(f"Token {cred.key_prefix} encountered error: {e!s}. Retrying next token...")
                cred.consecutive_failures += 1
                cred.last_error_reason = str(e)[:250]
                await db.commit()
                last_error = e

        raise RuntimeError(
            f"All {len(available_creds)} tokens for provider '{provider_name}' failed. Last error: {last_error}"
        )
