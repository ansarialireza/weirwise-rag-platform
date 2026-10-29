"""Unit tests for platform health and liveness probes."""

from unittest.mock import AsyncMock, patch

from backend.app.adapters.core_client import CoreApiClient
from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_liveness_probe() -> None:
    response = client.get("/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "alive"
    assert "version" in data
    assert "environment" in data


def test_readiness_probe() -> None:
    with patch.object(CoreApiClient, "check_health", new_callable=AsyncMock) as mock_probe:
        mock_probe.return_value = {"status": "ready"}
        response = client.get("/health/ready")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert data["database"] == "connected"
        assert data["core_gateway"] == "ready"
