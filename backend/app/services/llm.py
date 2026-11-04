"""Grounded answer generation through the administrator-managed provider pool.

The platform never stores customer-facing provider credentials; it selects an
encrypted credential through the intelligent routing engine, calls the
provider, records ledger usage, and falls back to an extractive answer when no
provider is available.
"""

import time
import uuid
from dataclasses import dataclass
from typing import Any

import httpx
from backend.app.core.logging import logger
from backend.app.models.assistant import Assistant
from backend.app.services.routing_engine import IntelligentRoutingEngine
from sqlalchemy.ext.asyncio import AsyncSession

# Requested model is either a UI alias (Auto/Fast/Deep Thinking) or a concrete
# provider model identifier. Aliases map to a latency/capability tier.
_PROVIDER_MODELS: dict[str, dict[str, str]] = {
    "openai": {"fast": "gpt-4o-mini", "deep": "gpt-4o"},
    "openrouter": {"fast": "openai/gpt-4o-mini", "deep": "openai/gpt-4o"},
    "anthropic": {"fast": "claude-3-5-haiku-latest", "deep": "claude-3-5-sonnet-latest"},
    "gemini": {"fast": "gemini-1.5-flash", "deep": "gemini-1.5-pro"},
}

# USD per 1M tokens (input, output). Kept deliberately conservative.
_PRICING: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "openai/gpt-4o-mini": (0.15, 0.60),
    "openai/gpt-4o": (2.50, 10.00),
    "claude-3-5-haiku-latest": (0.80, 4.00),
    "claude-3-5-sonnet-latest": (3.00, 15.00),
    "gemini-1.5-flash": (0.075, 0.30),
    "gemini-1.5-pro": (1.25, 5.00),
}

_PROVIDER_ORDER = ("openai", "anthropic", "gemini", "openrouter")

_GROUNDING_RULES = (
    "Answer the customer's question using only the numbered context passages provided. "
    "If the passages do not contain enough information, say so briefly instead of guessing. "
    "Cite passages inline as [1], [2] when you use them. "
    "Never mention embeddings, vector search, chunking, similarity scores, retrieval, or internal system details. "
    "Write a concise, helpful answer in the requested language and tone."
)


class ProviderCallError(Exception):
    def __init__(self, message: str, status_code: int = 502, is_rate_limit: bool = False):
        super().__init__(message)
        self.status_code = status_code
        self.is_rate_limit = is_rate_limit


@dataclass
class GroundedAnswer:
    content: str
    used_llm: bool = False
    provider_name: str | None = None
    model_name: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0


def _tier(requested_model: str) -> str:
    normalized = (requested_model or "Auto").strip().lower()
    if normalized in {"deep thinking", "deep", "reasoning", "gpt-4o", "claude-3-5-sonnet-latest", "gemini-1.5-pro"}:
        return "deep"
    return "fast"


def _model_for(provider_name: str, requested_model: str) -> str:
    tier = _tier(requested_model)
    aliases = {"auto", "fast", "deep thinking", "deep", "reasoning"}
    if requested_model and requested_model.strip().lower() not in aliases:
        # Concrete model names are passed through for OpenAI-compatible APIs.
        if provider_name in ("openai", "openrouter"):
            return requested_model.strip()
    return _PROVIDER_MODELS.get(provider_name, {}).get(tier, "gpt-4o-mini")


def _estimate_cost(model_name: str, input_tokens: int, output_tokens: int) -> float:
    input_price, output_price = _PRICING.get(model_name, (1.0, 3.0))
    return round((input_tokens / 1_000_000) * input_price + (output_tokens / 1_000_000) * output_price, 8)


def _build_messages(assistant: Assistant, query: str, passages: list[str]) -> tuple[str, str]:
    tone = assistant.tone or "professional"
    language = assistant.language or "en"
    system_parts = [
        (assistant.system_instructions or "").strip(),
        f"You are {assistant.name}.",
        f"Respond in a {tone} tone and in language code '{language}'.",
        _GROUNDING_RULES,
    ]
    system = "\n".join(part for part in system_parts if part)

    numbered = "\n\n".join(f"[{idx + 1}] {text}" for idx, text in enumerate(passages))
    user = f"Context passages:\n{numbered}\n\nCustomer question: {query}"
    return system, user


async def _call_openai_compatible(
    base_url: str,
    api_key: str,
    model: str,
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
) -> tuple[str, int, int]:
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{base_url.rstrip('/')}/chat/completions", json=payload, headers=headers)
    except httpx.RequestError as exc:
        raise ProviderCallError(f"Provider connection failed: {exc!s}", 503) from exc

    if resp.status_code != 200:
        raise ProviderCallError(
            f"Provider returned HTTP {resp.status_code}: {resp.text[:300]}",
            resp.status_code,
            is_rate_limit=resp.status_code == 429,
        )

    data = resp.json()
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    if not content.strip():
        raise ProviderCallError("Provider returned an empty answer.", 502)
    usage = data.get("usage") or {}
    return content.strip(), int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0)


async def _call_anthropic(
    api_key: str,
    model: str,
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
) -> tuple[str, int, int]:
    payload = {
        "model": model,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post("https://api.anthropic.com/v1/messages", json=payload, headers=headers)
    except httpx.RequestError as exc:
        raise ProviderCallError(f"Provider connection failed: {exc!s}", 503) from exc

    if resp.status_code != 200:
        raise ProviderCallError(
            f"Provider returned HTTP {resp.status_code}: {resp.text[:300]}",
            resp.status_code,
            is_rate_limit=resp.status_code == 429,
        )

    data = resp.json()
    blocks = data.get("content") or []
    content = "".join(block.get("text", "") for block in blocks if block.get("type") == "text").strip()
    if not content:
        raise ProviderCallError("Provider returned an empty answer.", 502)
    usage = data.get("usage") or {}
    return content, int(usage.get("input_tokens") or 0), int(usage.get("output_tokens") or 0)


async def _call_gemini(
    api_key: str,
    model: str,
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
) -> tuple[str, int, int]:
    payload: dict[str, Any] = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
    }
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.RequestError as exc:
        raise ProviderCallError(f"Provider connection failed: {exc!s}", 503) from exc

    if resp.status_code != 200:
        raise ProviderCallError(
            f"Provider returned HTTP {resp.status_code}: {resp.text[:300]}",
            resp.status_code,
            is_rate_limit=resp.status_code == 429,
        )

    data = resp.json()
    candidates = data.get("candidates") or []
    parts = (candidates[0].get("content") or {}).get("parts") if candidates else []
    content = "".join(part.get("text", "") for part in (parts or [])).strip()
    if not content:
        raise ProviderCallError("Provider returned an empty answer.", 502)
    usage = data.get("usageMetadata") or {}
    return (
        content,
        int(usage.get("promptTokenCount") or 0),
        int(usage.get("candidatesTokenCount") or 0),
    )


async def call_provider(
    provider_name: str,
    api_key: str,
    model: str,
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
) -> tuple[str, int, int]:
    if provider_name == "openai":
        return await _call_openai_compatible(
            "https://api.openai.com/v1", api_key, model, system, user, temperature, max_tokens
        )
    if provider_name == "openrouter":
        return await _call_openai_compatible(
            "https://openrouter.ai/api/v1", api_key, model, system, user, temperature, max_tokens
        )
    if provider_name == "anthropic":
        return await _call_anthropic(api_key, model, system, user, temperature, max_tokens)
    if provider_name == "gemini":
        return await _call_gemini(api_key, model, system, user, temperature, max_tokens)
    raise ProviderCallError(f"Unsupported provider '{provider_name}'.", 400)


def extractive_answer(passages: list[str], fallback_message: str) -> str:
    """Deterministic answer used when no provider is configured or all calls fail."""
    if not passages:
        return fallback_message
    cleaned = [" ".join(text.split()) for text in passages if text and text.strip()]
    if not cleaned:
        return fallback_message
    excerpt = cleaned[0]
    if len(excerpt) > 900:
        excerpt = excerpt[:900].rsplit(" ", 1)[0].rstrip() + "..."
    return excerpt


class LLMService:
    @classmethod
    async def generate_grounded_answer(
        cls,
        db: AsyncSession,
        assistant: Assistant,
        query: str,
        passages: list[str],
        workspace_id: uuid.UUID,
    ) -> GroundedAnswer:
        started = time.perf_counter()
        if not passages:
            return GroundedAnswer(content=assistant.fallback_message, latency_ms=0)

        system, user = _build_messages(assistant, query, passages)
        preferred_provider = None
        requested = (assistant.model or "Auto").strip()
        if requested.lower().startswith("gpt"):
            preferred_provider = "openai"
        elif requested.lower().startswith("claude"):
            preferred_provider = "anthropic"
        elif requested.lower().startswith("gemini"):
            preferred_provider = "gemini"

        order = list(_PROVIDER_ORDER)
        if preferred_provider:
            order.remove(preferred_provider)
            order.insert(0, preferred_provider)

        for provider_name in order:
            model = _model_for(provider_name, requested)
            resolution = await IntelligentRoutingEngine.select_credential(db, provider_name, model_name=model)
            if not resolution:
                continue

            try:
                content, input_tokens, output_tokens = await call_provider(
                    provider_name=provider_name,
                    api_key=resolution.raw_secret,
                    model=model,
                    system=system,
                    user=user,
                    temperature=float(assistant.temperature or 0.2),
                    max_tokens=int(assistant.max_tokens or 1024),
                )
            except ProviderCallError as exc:
                logger.warning(f"Provider {provider_name} failed for assistant {assistant.id}: {exc!s}")
                await IntelligentRoutingEngine.record_failure(
                    db,
                    credential_id=str(resolution.credential.id),
                    error_type="provider_error",
                    reason=str(exc),
                    is_rate_limit=exc.is_rate_limit,
                )
                continue

            latency_ms = int((time.perf_counter() - started) * 1000)
            cost = _estimate_cost(model, input_tokens, output_tokens)
            await IntelligentRoutingEngine.record_success(
                db,
                credential_id=str(resolution.credential.id),
                workspace_id=str(workspace_id),
                provider_name=provider_name,
                model_name=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=cost,
                latency_ms=latency_ms,
            )
            return GroundedAnswer(
                content=content,
                used_llm=True,
                provider_name=provider_name,
                model_name=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=cost,
                latency_ms=latency_ms,
            )

        return GroundedAnswer(
            content=extractive_answer(passages, assistant.fallback_message),
            latency_ms=int((time.perf_counter() - started) * 1000),
        )


llm_service = LLMService()
