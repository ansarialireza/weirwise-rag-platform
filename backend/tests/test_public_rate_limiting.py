"""Regression tests for public runtime abuse protection.

Covers the sliding-window limiter itself (atomicity and memory bounds) and the
widget chat endpoint (429 + Retry-After without affecting signed-in traffic).
"""

import asyncio
import uuid

from backend.app.core.config import settings
from backend.app.main import app
from backend.app.services.public_rate_limiter import PublicRateLimiter
from fastapi.testclient import TestClient

client = TestClient(app)


def _register_and_login(prefix: str) -> dict[str, str]:
    uid = uuid.uuid4().hex[:8]
    email = f"{prefix}_{uid}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": prefix.title()},
    )
    assert reg.status_code == 201, reg.text
    login = client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _create_tenant(headers: dict[str, str], name: str) -> tuple[str, str, str]:
    ws = client.post("/api/v1/workspaces", headers=headers, json={"name": f"{name} Workspace"})
    assert ws.status_code == 201, ws.text
    workspace_id = ws.json()["id"]

    project = client.post(
        f"/api/v1/workspaces/{workspace_id}/projects",
        headers=headers,
        json={"name": f"{name} Project"},
    )
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    assistant = client.post(
        f"/api/v1/projects/{project_id}/assistants",
        headers=headers,
        json={"name": f"{name} Assistant"},
    )
    assert assistant.status_code == 201, assistant.text
    return workspace_id, project_id, assistant.json()["id"]


async def _publish_assistant(assistant_id: str) -> None:
    from backend.app.db.session import async_session_factory
    from backend.app.models.assistant import Assistant, AssistantStatus

    async with async_session_factory() as session:
        assistant = await session.get(Assistant, uuid.UUID(assistant_id))
        assistant.status = AssistantStatus.PUBLISHED.value
        await session.commit()


async def test_public_limiter_is_atomic_and_concurrent(monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "REDIS_URL", None)
    await PublicRateLimiter.reset_all()

    scope = f"test_{uuid.uuid4().hex}"
    results = await asyncio.gather(
        *(PublicRateLimiter.check_and_record(scope, "same-client", 3, 60) for _ in range(12))
    )
    assert sum(1 for decision in results if decision.allowed) == 3

    blocked = await PublicRateLimiter.check_and_record(scope, "same-client", 3, 60)
    assert not blocked.allowed
    assert blocked.retry_after >= 1

    await PublicRateLimiter.reset_all()


async def test_in_process_store_stays_bounded(monkeypatch):
    monkeypatch.setattr(settings, "REDIS_URL", None)
    monkeypatch.setattr(PublicRateLimiter, "_MAX_TRACKED_KEYS", 5)
    await PublicRateLimiter.reset_all()

    for index in range(30):
        await PublicRateLimiter.check_and_record(f"bound_{uuid.uuid4().hex}", f"client-{index}", 10, 60)

    assert PublicRateLimiter.snapshot()["tracked_keys"] <= 6
    await PublicRateLimiter.reset_all()


def test_public_chat_is_rate_limited_per_ip(monkeypatch):
    asyncio.run(PublicRateLimiter.reset_all())
    headers = _register_and_login("public_rl")
    _, _, assistant_id = _create_tenant(headers, "PublicRateLimit")

    dep = client.post(
        f"/api/v1/assistants/{assistant_id}/deployments",
        headers=headers,
        json={"name": "Rate Limited Widget"},
    )
    assert dep.status_code == 201, dep.text
    widget_key = dep.json()["public_key"]

    asyncio.run(_publish_assistant(assistant_id))

    try:
        monkeypatch.setattr(settings, "PUBLIC_CHAT_IP_LIMIT", 2)
        request_headers = {"X-Widget-Key": widget_key, "Origin": "https://example.com"}
        url = f"/api/v1/public/assistants/{assistant_id}/chat"

        for _ in range(2):
            allowed = client.post(url, headers=request_headers, json={"message": "Hello"})
            assert allowed.status_code == 200, allowed.text

        blocked = client.post(url, headers=request_headers, json={"message": "Hello again"})
        assert blocked.status_code == 429, blocked.text
        assert int(blocked.headers.get("Retry-After", "0")) >= 1
        assert "too quickly" in blocked.json()["detail"]

        # Signed-in workspace traffic is not affected by widget limits.
        assert client.get("/api/v1/workspaces", headers=headers).status_code == 200
    finally:
        asyncio.run(PublicRateLimiter.reset_all())
