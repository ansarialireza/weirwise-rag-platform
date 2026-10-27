"""Typed HTTP client adapter for Weirwise Core REST API (v1.0.0)."""

import uuid
from typing import Any

import httpx
from backend.app.core.config import settings
from backend.app.core.logging import logger


class CoreApiException(Exception):
    def __init__(self, message: str, status_code: int = 502, details: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


class CoreApiClient:
    """Isolated adapter ensuring Platform interacts with Core strictly through its verified API."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float | None = None,
    ):
        self.base_url = (base_url or settings.WEIRWISE_CORE_BASE_URL).rstrip("/")
        self.api_key = api_key or settings.WEIRWISE_CORE_API_KEY
        self.timeout = timeout or settings.WEIRWISE_CORE_TIMEOUT_SECONDS

    def _get_headers(self) -> dict[str, str]:
        headers = {}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers

    async def check_health(self) -> dict[str, Any]:
        """Check Core liveness probe (/health/live)."""
        url = f"{self.base_url}/health/live"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return resp.json()
                return {"status": "unhealthy", "code": resp.status_code}
        except Exception as e:
            logger.warning(f"Core health check failed: {e!s}")
            return {"status": "unreachable", "error": str(e)}

    async def create_knowledge_base(self, name: str, description: str | None = None) -> dict[str, Any]:
        """Create a Knowledge Base in Core."""
        url = f"{self.base_url}/api/v1/knowledge-bases"
        payload = {"name": name, "description": description}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, json=payload, headers=self._get_headers())
                if resp.status_code in (200, 201):
                    return resp.json()
                raise CoreApiException(f"Core KB creation failed: {resp.text}", resp.status_code)
        except httpx.RequestError as e:
            raise CoreApiException(f"Core connection error: {e!s}", 503)

    async def upload_document(
        self,
        kb_id: uuid.UUID,
        filename: str,
        content: bytes,
        mime_type: str,
    ) -> dict[str, Any]:
        """Upload a document to Core for asynchronous vector ingestion."""
        url = f"{self.base_url}/api/v1/documents/upload"
        data = {"knowledge_base_id": str(kb_id)}
        files = {"file": (filename, content, mime_type)}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, data=data, files=files, headers=self._get_headers())
                if resp.status_code in (200, 201, 202):
                    return resp.json()
                raise CoreApiException(f"Core document upload failed: {resp.text}", resp.status_code)
        except httpx.RequestError as e:
            raise CoreApiException(f"Core connection error: {e!s}", 503)

    async def get_document_status(self, doc_id: uuid.UUID) -> dict[str, Any]:
        """Poll Core document indexing status."""
        url = f"{self.base_url}/api/v1/documents/{doc_id}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, headers=self._get_headers())
                if resp.status_code == 200:
                    return resp.json()
                raise CoreApiException(f"Core document fetch failed: {resp.text}", resp.status_code)
        except httpx.RequestError as e:
            raise CoreApiException(f"Core connection error: {e!s}", 503)

    async def search(
        self,
        kb_id: uuid.UUID,
        query: str,
        top_k: int = 4,
        score_threshold: float | None = 0.7,
    ) -> dict[str, Any]:
        """Execute vector search query against a Core knowledge base."""
        url = f"{self.base_url}/api/v1/search"
        payload = {
            "knowledge_base_id": str(kb_id),
            "query": query,
            "top_k": top_k,
            "score_threshold": score_threshold,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, json=payload, headers=self._get_headers())
                if resp.status_code == 200:
                    return resp.json()
                raise CoreApiException(f"Core vector search failed: {resp.text}", resp.status_code)
        except httpx.RequestError as e:
            raise CoreApiException(f"Core connection error: {e!s}", 503)

    async def chat(
        self,
        core_assistant_id: uuid.UUID,
        message: str,
        conversation_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        """Execute RAG chat completion against a Core assistant."""
        url = f"{self.base_url}/api/v1/assistants/{core_assistant_id}/chat"
        payload = {
            "message": message,
            "conversation_id": str(conversation_id) if conversation_id else None,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, json=payload, headers=self._get_headers())
                if resp.status_code == 200:
                    return resp.json()
                raise CoreApiException(f"Core chat execution failed: {resp.text}", resp.status_code)
        except httpx.RequestError as e:
            raise CoreApiException(f"Core connection error: {e!s}", 503)
