import hashlib
import uuid
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from urllib.parse import parse_qs, urlsplit

import pytest
from backend.app.api.v1.integrations import (
    complete_demo_integration_oauth,
    connect_integration,
    get_mock_integration_capabilities,
    list_mock_google_drive_items,
    trigger_integration_sync,
)
from backend.app.core.config import Settings, settings
from backend.app.schemas.assistant import BusinessIntegrationCreateRequest
from backend.app.schemas.integrations import DemoOAuthCompleteRequest, MockDriveSyncRequest
from backend.app.services import integrations as integration_service_module
from backend.app.services.mock_integrations import (
    MOCK_DRIVE_FILES,
    MockIntegrationError,
    create_demo_oauth_state,
    demo_authorization_url,
    mock_drive_files,
    mock_drive_items,
    verify_demo_oauth_state,
)
from fastapi import HTTPException
from sqlalchemy import select


@pytest.fixture
def demo_integration_settings(monkeypatch):
    monkeypatch.setattr(settings, "DEMO_INTEGRATIONS_ENABLED", True)
    monkeypatch.setattr(settings, "DEMO_INTEGRATIONS_FRONTEND_URL", "https://app.example.test")
    monkeypatch.setattr(settings, "ALLOWED_ORIGINS", ["https://app.example.test"])


def test_demo_oauth_state_is_bound_to_provider_and_user(demo_integration_settings):
    user_id = uuid.uuid4()
    state = create_demo_oauth_state(user_id, "google_drive")

    assert verify_demo_oauth_state(state, "google_drive") == user_id
    with pytest.raises(MockIntegrationError):
        verify_demo_oauth_state(state, "shopify")


def test_demo_oauth_state_and_mock_data_are_unavailable_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "DEMO_INTEGRATIONS_ENABLED", False)

    with pytest.raises(MockIntegrationError, match="disabled"):
        create_demo_oauth_state(uuid.uuid4(), "shopify")
    with pytest.raises(MockIntegrationError, match="disabled"):
        mock_drive_items(None)


def test_production_configuration_rejects_enabled_demo_integrations():
    with pytest.raises(ValueError, match="must remain disabled"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="a-production-secret-key-long-enough-for-validation",
            DEMO_INTEGRATIONS_ENABLED=True,
        )


def test_demo_authorization_url_uses_only_the_configured_first_party_origin(demo_integration_settings):
    user_id = uuid.uuid4()
    state = create_demo_oauth_state(user_id, "shopify")
    url = demo_authorization_url("shopify", state)
    parsed = urlsplit(url)

    assert parsed.scheme == "https"
    assert parsed.netloc == "app.example.test"
    assert parsed.path == "/demo-integrations/authorize"
    assert parse_qs(parsed.query) == {"provider": ["shopify"], "state": [state]}

    settings.ALLOWED_ORIGINS = ["https://other.example.test"]
    with pytest.raises(MockIntegrationError, match="not allowed"):
        demo_authorization_url("shopify", state)


def test_demo_drive_browser_and_file_selection_are_fixture_bounded(demo_integration_settings):
    root_items = mock_drive_items(None)
    policies = next(item for item in root_items if item["id"] == "demo-drive-folder-policies")
    folder_items = mock_drive_items(policies["id"])

    assert {item["id"] for item in root_items} == {
        "demo-drive-folder-policies",
        "demo-drive-folder-products",
        "demo-drive-file-support",
    }
    assert {item["id"] for item in folder_items} == {
        "demo-drive-file-returns",
        "demo-drive-file-shipping",
    }
    assert [file.id for file in mock_drive_files(["demo-drive-file-returns"])] == ["demo-drive-file-returns"]
    assert mock_drive_files([]) == []
    with pytest.raises(MockIntegrationError, match="valid, unique"):
        mock_drive_files(["demo-drive-file-not-real"])


@pytest.mark.asyncio
async def test_demo_shopify_oauth_persists_a_disjoint_simulated_connection(
    demo_integration_settings,
    monkeypatch,
):
    user_id = uuid.uuid4()
    state = create_demo_oauth_state(user_id, "shopify")
    integration = SimpleNamespace(id=uuid.uuid4())
    create_or_update = AsyncMock(return_value=integration)
    monkeypatch.setattr(
        integration_service_module.integrations_service,
        "create_or_update_integration",
        create_or_update,
    )

    response = await complete_demo_integration_oauth(
        "shopify",
        DemoOAuthCompleteRequest(state=state, approved=True),
        SimpleNamespace(id=user_id),
        SimpleNamespace(),
    )

    assert response.status == "connected"
    assert response.integration_id == integration.id
    kwargs = create_or_update.await_args.kwargs
    assert kwargs["connection_key"] == "demo-shopify"
    assert kwargs["credentials"] == {"mode": "demo", "fixture": "shopify-catalog-v1"}
    assert kwargs["config"]["mock_provider"] is True
    assert "access_token" not in kwargs["credentials"]


@pytest.mark.asyncio
async def test_demo_oauth_state_cannot_be_completed_by_another_user(demo_integration_settings):
    state = create_demo_oauth_state(uuid.uuid4(), "google_drive")

    with pytest.raises(HTTPException) as error:
        await complete_demo_integration_oauth(
            "google_drive",
            DemoOAuthCompleteRequest(state=state, approved=True),
            SimpleNamespace(id=uuid.uuid4()),
            SimpleNamespace(),
        )

    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_generic_integration_api_cannot_create_fake_demo_records(demo_integration_settings):
    with pytest.raises(HTTPException) as error:
        await connect_integration(
            BusinessIntegrationCreateRequest(
                provider="shopify",
                display_name="Fake demo record",
                credentials={"mode": "demo"},
                config={"mock_provider": True},
            ),
            SimpleNamespace(id=uuid.uuid4()),
            SimpleNamespace(),
        )

    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_drive_sync_queues_only_known_files_for_the_owned_demo_integration(
    demo_integration_settings,
):
    integration = SimpleNamespace(
        id=uuid.uuid4(),
        provider="google_drive",
        connection_key="demo-google-drive",
        config={"mock_provider": True, "selected_file_ids": []},
        is_active=True,
        sync_status="idle",
        last_error="Previous failure",
    )
    db = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: integration)),
        commit=AsyncMock(),
    )
    user = SimpleNamespace(id=uuid.uuid4())

    response = await trigger_integration_sync(
        integration.id,
        user,
        db,
        MockDriveSyncRequest(file_ids=["demo-drive-file-support"]),
    )

    assert response.status == "queued"
    assert integration.config["selected_file_ids"] == ["demo-drive-file-support"]
    assert integration.sync_status == "queued"
    assert integration.last_error is None
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_drive_sync_allows_an_empty_selection_to_remove_all_imported_demo_files(
    demo_integration_settings,
):
    integration = SimpleNamespace(
        id=uuid.uuid4(),
        provider="google_drive",
        config={"mock_provider": True, "selected_file_ids": ["demo-drive-file-support"]},
        is_active=True,
        sync_status="idle",
    )
    db = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: integration)),
        commit=AsyncMock(),
    )

    response = await trigger_integration_sync(
        integration.id,
        SimpleNamespace(id=uuid.uuid4()),
        db,
        MockDriveSyncRequest(file_ids=[]),
    )

    assert response.status == "queued"
    assert integration.config["selected_file_ids"] == []
    assert integration.sync_status == "queued"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_drive_sync_rejects_unknown_file_ids_without_queueing(demo_integration_settings):
    integration = SimpleNamespace(
        id=uuid.uuid4(),
        provider="google_drive",
        config={"mock_provider": True, "selected_file_ids": []},
        is_active=True,
        sync_status="idle",
    )
    db = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: integration)),
        commit=AsyncMock(),
    )

    with pytest.raises(HTTPException) as error:
        await trigger_integration_sync(
            integration.id,
            SimpleNamespace(id=uuid.uuid4()),
            db,
            MockDriveSyncRequest(file_ids=["demo-drive-file-not-real"]),
        )

    assert error.value.status_code == 422
    assert integration.sync_status == "idle"
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_drive_file_listing_is_tenant_scoped_and_demo_only(demo_integration_settings):
    integration = SimpleNamespace(
        id=uuid.uuid4(),
        provider="google_drive",
        config={"mock_provider": True},
        is_active=True,
    )
    db = SimpleNamespace(scalar=AsyncMock(return_value=integration))

    response = await list_mock_google_drive_items(
        integration.id,
        None,
        SimpleNamespace(id=uuid.uuid4()),
        db,
    )

    assert len(response.items) == 3
    assert all(item.id.startswith("demo-drive-") for item in response.items)
    assert db.scalar.await_args.args[0] is not None


@pytest.mark.asyncio
async def test_demo_capabilities_require_an_authenticated_active_account(demo_integration_settings):
    response = await get_mock_integration_capabilities(SimpleNamespace(is_active=True))

    assert response == {"enabled": True, "providers": ["shopify", "google_drive"]}

    with pytest.raises(HTTPException) as error:
        await get_mock_integration_capabilities(SimpleNamespace(is_active=False))
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_drive_worker_imports_updates_removes_and_deduplicates_fixture_documents(
    demo_integration_settings,
    monkeypatch,
):
    from backend.app.db.session import async_session_factory
    from backend.app.models.assistant import BusinessIntegration
    from backend.app.models.auth import User
    from backend.app.models.project import Document, KnowledgeSource, ProcessingJob
    from backend.app.services.subscription import subscription_service
    from backend.app.tasks import google_drive_demo as worker

    user_id = uuid.uuid4()
    integration_id = uuid.uuid4()
    async with async_session_factory() as db:
        db.add(
            User(
                id=user_id,
                email=f"demo-{user_id.hex}@example.test",
                hashed_password="not-a-real-password",
            )
        )
        await db.flush()
        db.add(
            BusinessIntegration(
                id=integration_id,
                user_id=user_id,
                provider="google_drive",
                connection_key="demo-google-drive",
                display_name="Google Drive demo",
                encrypted_credentials="demo-only",
                config={
                    "mock_provider": True,
                    "selected_file_ids": [
                        "demo-drive-file-returns",
                        "demo-drive-file-shipping",
                    ],
                },
                sync_status="syncing",
            )
        )
        await db.commit()

    async def save_upload(upload):
        content = await upload.read()
        return (
            upload.filename,
            f"demo-test-storage/{uuid.uuid4()}",
            len(content),
            hashlib.sha256(content).hexdigest(),
        )

    monkeypatch.setattr(worker.storage_service, "save_upload", save_upload)
    delete_stored_file = Mock(return_value=True)
    monkeypatch.setattr(worker.storage_service, "delete_file", delete_stored_file)
    delete_core_document = AsyncMock()
    monkeypatch.setattr(worker.CoreApiClient, "delete_document", delete_core_document)
    monkeypatch.setattr(subscription_service, "check_document_entitlement", AsyncMock())
    monkeypatch.setattr(subscription_service, "check_storage_entitlement", AsyncMock())
    monkeypatch.setattr(subscription_service, "check_file_size_entitlement", lambda _size: None)

    await worker._sync_google_drive_demo(integration_id, user_id)
    async with async_session_factory() as db:
        first_documents = list((await db.scalars(select(Document))).all())
        first_documents = [doc for doc in first_documents if doc.user_id == user_id]
        assert len(first_documents) == 2
        assert all(doc.doc_metadata["mock_provider"] is True for doc in first_documents)
        first_hash = next(
            doc.content_hash
            for doc in first_documents
            if doc.doc_metadata["drive_file_id"] == "demo-drive-file-returns"
        )
        source_id = first_documents[0].knowledge_source_id
        shipping_document = next(
            doc for doc in first_documents if doc.doc_metadata["drive_file_id"] == "demo-drive-file-shipping"
        )
        shipping_document.core_doc_id = uuid.uuid4()
        integration = await db.get(BusinessIntegration, integration_id)
        integration.config = {
            **integration.config,
            "selected_file_ids": ["demo-drive-file-returns"],
        }
        integration.sync_status = "syncing"
        shipping_core_id = shipping_document.core_doc_id
        await db.commit()

    def updated_files(file_ids):
        return [
            replace(file, content=f"{file.content}\nUpdated sample policy text.")
            if file.id == "demo-drive-file-returns" and file.id in file_ids
            else file
            for file in MOCK_DRIVE_FILES
            if file.id in file_ids
        ]

    monkeypatch.setattr(worker, "mock_drive_files", updated_files)
    await worker._sync_google_drive_demo(integration_id, user_id)

    async with async_session_factory() as db:
        final_documents = list((await db.scalars(select(Document))).all())
        final_documents = [doc for doc in final_documents if doc.user_id == user_id]
        jobs = list((await db.scalars(select(ProcessingJob))).all())
        jobs = [job for job in jobs if job.document_id in {doc.id for doc in final_documents}]
        source = await db.get(KnowledgeSource, source_id)
        integration = await db.get(BusinessIntegration, integration_id)
        assert len(final_documents) == 1
        assert final_documents[0].doc_metadata["drive_file_id"] == "demo-drive-file-returns"
        assert final_documents[0].content_hash != first_hash
        assert len(jobs) == 1
        assert source.settings["synced_file_count"] == 1
        assert integration.sync_status == "completed"
        assert integration.config["selected_file_ids"] == ["demo-drive-file-returns"]

    delete_core_document.assert_awaited_once_with(shipping_core_id)
    assert delete_stored_file.call_count == 2

    async with async_session_factory() as db:
        integration = await db.get(BusinessIntegration, integration_id)
        integration.sync_status = "syncing"
        await db.commit()
    await worker._sync_google_drive_demo(integration_id, user_id)
    async with async_session_factory() as db:
        documents = list((await db.scalars(select(Document))).all())
        assert len([doc for doc in documents if doc.user_id == user_id]) == 1
        jobs = list((await db.scalars(select(ProcessingJob))).all())
        assert len([job for job in jobs if job.document_id == final_documents[0].id]) == 1
