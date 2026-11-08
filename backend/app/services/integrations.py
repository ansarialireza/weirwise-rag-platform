"""Secure, Fernet-encrypted external integrations manager for Shopify, Zendesk, Gorgias, Google Drive, Notion."""

import json
import uuid
from typing import Any

from backend.app.core.logging import logger
from backend.app.models.assistant import BusinessIntegration
from backend.app.services.vault import CredentialVaultService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class IntegrationsService:
    """Manages credentials, synchronization, and webhook dispatch for third-party business systems."""

    @staticmethod
    async def create_or_update_integration(
        db: AsyncSession,
        user_id: uuid.UUID,
        provider: str,
        display_name: str,
        credentials: dict[str, Any],
        config: dict[str, Any],
    ) -> BusinessIntegration:
        """Encrypt credentials at rest and persist integration."""
        encrypted_blob = CredentialVaultService.encrypt_secret(json.dumps(credentials))

        # Check existing
        stmt = select(BusinessIntegration).where(
            BusinessIntegration.user_id == user_id,
            BusinessIntegration.provider == provider,
        )
        res = await db.execute(stmt)
        integration = res.scalar_one_or_none()

        if integration:
            integration.display_name = display_name
            integration.encrypted_credentials = encrypted_blob
            integration.config = config
            integration.is_active = True
        else:
            integration = BusinessIntegration(
                user_id=user_id,
                provider=provider,
                display_name=display_name,
                encrypted_credentials=encrypted_blob,
                config=config,
                is_active=True,
            )
            db.add(integration)

        await db.commit()
        await db.refresh(integration)
        return integration

    @staticmethod
    def get_decrypted_credentials(integration: BusinessIntegration) -> dict[str, Any]:
        """Safely decrypt credentials in memory without logging or returning in API."""
        try:
            raw_json = CredentialVaultService.decrypt_secret(integration.encrypted_credentials)
            return json.loads(raw_json)
        except Exception as e:
            logger.error(f"Failed to decrypt credentials for integration {integration.id}: {e!s}")
            return {}

    @staticmethod
    async def sync_integration_knowledge(db: AsyncSession, integration_id: uuid.UUID) -> dict[str, Any]:
        """Report sync availability without fabricating imported items.

        Credentials are stored, but no provider-specific import adapter exists yet.
        Returning a truthful status is preferable to inventing item counts.
        """
        stmt = select(BusinessIntegration).where(BusinessIntegration.id == integration_id)
        res = await db.execute(stmt)
        integration = res.scalar_one_or_none()
        if not integration:
            return {"status": "error", "message": "Integration not found"}

        creds = IntegrationsService.get_decrypted_credentials(integration)
        if not creds:
            integration.sync_status = "failed"
            integration.last_error = "Invalid or missing credentials."
            await db.commit()
            return {"status": "failed", "error": integration.last_error}

        provider = integration.provider.lower()
        logger.info(f"Sync requested for provider '{provider}' for user {integration.user_id}")

        integration.sync_status = "unsupported"
        integration.last_error = "Automatic content import is not available for this provider yet."
        await db.commit()

        return {
            "status": "not_implemented",
            "provider": provider,
            "items_synced": 0,
            "message": integration.last_error,
        }


integrations_service = IntegrationsService()
