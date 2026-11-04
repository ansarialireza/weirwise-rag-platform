"""Grounded answer generation through the administrator-managed provider pool.

The platform never stores customer-facing provider credentials; it selects an
encrypted credential through the intelligent routing engine, calls the
provider, records ledger usage, and falls back to an extractive answer when no
provider is available.
"""

import json
import time
import uuid
from dataclasses import dataclass
from typing import Any, AsyncGenerator

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
    "gemini": {"fast": "gemini-3.5-flash", "deep": "gemini-3.5-flash"},
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
    "gemini-3.5-flash": (0.50, 2.00),
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
    def __init__(
        self,
        message: str,
        status_code: int = 502,
        is_rate_limit: bool = False,
        retry_after: int | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.is_rate_limit = is_rate_limit
        self.retry_after = retry_after


def _parse_retry_after(headers: Any) -> int | None:
    value = headers.get("retry-after") if headers else None
    if not value:
        return None
    try:
        return max(0, int(str(value).strip()))
    except (TypeError, ValueError):
        return None


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
    if normalized in {
        "deep thinking",
        "deep",
        "reasoning",
        "gpt-4o",
        "claude-3-5-sonnet-latest",
        "gemini-1.5-pro",
        "gemini-3.5-pro",
    }:
        return "deep"
    return "fast"


def _model_for(provider_name: str, requested_model: str) -> str:
    tier = _tier(requested_model)
    aliases = {"auto", "fast", "deep thinking", "deep", "reasoning"}
    if requested_model and requested_model.strip().lower() not in aliases:
        # Concrete model names are passed through for providers that accept them directly.
        if provider_name in ("openai", "openrouter", "gemini"):
            return requested_model.strip()
    return _PROVIDER_MODELS.get(provider_name, {}).get(tier, "gpt-4o-mini")


def _estimate_cost(model_name: str, input_tokens: int, output_tokens: int) -> float:
    input_price, output_price = _PRICING.get(model_name, (1.0, 3.0))
    return round((input_tokens / 1_000_000) * input_price + (output_tokens / 1_000_000) * output_price, 8)


def _build_messages(
    assistant: Assistant,
    query: str,
    passages: list[str],
    history: list[dict[str, str]] | None = None,
) -> tuple[str, str]:
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
    recent_turns = ""
    if history:
        lines = [f"{item.get('role', 'user')}: {item.get('content', '')}" for item in history[-6:]]
        recent_turns = "Recent conversation:\n" + "\n".join(lines) + "\n\n"
    user = f"{recent_turns}Context passages:\n{numbered}\n\nCustomer question: {query}"
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
    except httpx.TimeoutException as exc:
        raise ProviderCallError(f"Provider request timed out: {exc!s}", 504) from exc
    except httpx.RequestError as exc:
        raise ProviderCallError(f"Provider connection failed: {exc!s}", 503) from exc

    if resp.status_code != 200:
        raise ProviderCallError(
            f"Provider returned HTTP {resp.status_code}: {resp.text[:300]}",
            resp.status_code,
            is_rate_limit=resp.status_code == 429,
            retry_after=_parse_retry_after(resp.headers),
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
    except httpx.TimeoutException as exc:
        raise ProviderCallError(f"Provider request timed out: {exc!s}", 504) from exc
    except httpx.RequestError as exc:
        raise ProviderCallError(f"Provider connection failed: {exc!s}", 503) from exc

    if resp.status_code != 200:
        raise ProviderCallError(
            f"Provider returned HTTP {resp.status_code}: {resp.text[:300]}",
            resp.status_code,
            is_rate_limit=resp.status_code == 429,
            retry_after=_parse_retry_after(resp.headers),
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
    except httpx.TimeoutException as exc:
        raise ProviderCallError(f"Provider request timed out: {exc!s}", 504) from exc
    except httpx.RequestError as exc:
        raise ProviderCallError(f"Provider connection failed: {exc!s}", 503) from exc

    if resp.status_code != 200:
        raise ProviderCallError(
            f"Provider returned HTTP {resp.status_code}: {resp.text[:300]}",
            resp.status_code,
            is_rate_limit=resp.status_code == 429,
            retry_after=_parse_retry_after(resp.headers),
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


async def stream_provider(
    provider_name: str,
    api_key: str,
    model: str,
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
) -> AsyncGenerator[dict[str, Any], None]:
    """Yield {'text': str} deltas and a final {'usage': (input, output)} event."""
    if provider_name in ("openai", "openrouter"):
        base_url = "https://api.openai.com/v1" if provider_name == "openai" else "https://openrouter.ai/api/v1"
        async for chunk in _stream_openai_compatible(
            base_url, api_key, model, system, user, temperature, max_tokens
        ):
            yield chunk
        return
    if provider_name == "anthropic":
        async for chunk in _stream_anthropic(api_key, model, system, user, temperature, max_tokens):
            yield chunk
        return
    if provider_name == "gemini":
        async for chunk in _stream_gemini(api_key, model, system, user, temperature, max_tokens):
            yield chunk
        return
    raise ProviderCallError(f"Unsupported provider '{provider_name}'.", 400)


async def _stream_openai_compatible(
    base_url: str,
    api_key: str,
    model: str,
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
) -> AsyncGenerator[dict[str, Any], None]:
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    input_tokens = 0
    output_tokens = 0
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST", f"{base_url.rstrip('/')}/chat/completions", json=payload, headers=headers
            ) as resp:
                if resp.status_code != 200:
                    body = (await resp.aread())[:300].decode("utf-8", "ignore")
                    raise ProviderCallError(
                        f"Provider returned HTTP {resp.status_code}: {body}",
                        resp.status_code,
                        is_rate_limit=resp.status_code == 429,
                        retry_after=_parse_retry_after(resp.headers),
                    )
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data or data == "[DONE]":
                        continue
                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    usage = event.get("usage") or {}
                    if usage:
                        input_tokens = int(usage.get("prompt_tokens") or input_tokens)
                        output_tokens = int(usage.get("completion_tokens") or output_tokens)
                    choices = event.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    text = delta.get("content")
                    if text:
                        yield {"text": text}
    except httpx.TimeoutException as exc:
        raise ProviderCallError(f"Provider request timed out: {exc!s}", 504) from exc
    except httpx.RequestError as exc:
        raise ProviderCallError(f"Provider connection failed: {exc!s}", 503) from exc
    yield {"usage": (input_tokens, output_tokens)}


async def _stream_anthropic(
    api_key: str,
    model: str,
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
) -> AsyncGenerator[dict[str, Any], None]:
    payload = {
        "model": model,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    input_tokens = 0
    output_tokens = 0
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST", "https://api.anthropic.com/v1/messages", json=payload, headers=headers
            ) as resp:
                if resp.status_code != 200:
                    body = (await resp.aread())[:300].decode("utf-8", "ignore")
                    raise ProviderCallError(
                        f"Provider returned HTTP {resp.status_code}: {body}",
                        resp.status_code,
                        is_rate_limit=resp.status_code == 429,
                        retry_after=_parse_retry_after(resp.headers),
                    )
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data:
                        continue
                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    event_type = event.get("type")
                    if event_type == "message_start":
                        usage = (event.get("message") or {}).get("usage") or {}
                        input_tokens = int(usage.get("input_tokens") or input_tokens)
                    elif event_type == "content_block_delta":
                        text = (event.get("delta") or {}).get("text")
                        if text:
                            yield {"text": text}
                    elif event_type == "message_delta":
                        usage = event.get("usage") or {}
                        output_tokens = int(usage.get("output_tokens") or output_tokens)
    except httpx.TimeoutException as exc:
        raise ProviderCallError(f"Provider request timed out: {exc!s}", 504) from exc
    except httpx.RequestError as exc:
        raise ProviderCallError(f"Provider connection failed: {exc!s}", 503) from exc
    yield {"usage": (input_tokens, output_tokens)}


async def _stream_gemini(
    api_key: str,
    model: str,
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
) -> AsyncGenerator[dict[str, Any], None]:
    payload: dict[str, Any] = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
    }
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse"
    input_tokens = 0
    output_tokens = 0
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as resp:
                if resp.status_code != 200:
                    body = (await resp.aread())[:300].decode("utf-8", "ignore")
                    raise ProviderCallError(
                        f"Provider returned HTTP {resp.status_code}: {body}",
                        resp.status_code,
                        is_rate_limit=resp.status_code == 429,
                        retry_after=_parse_retry_after(resp.headers),
                    )
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data:
                        continue
                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    usage = event.get("usageMetadata") or {}
                    input_tokens = int(usage.get("promptTokenCount") or input_tokens)
                    output_tokens = int(usage.get("candidatesTokenCount") or output_tokens)
                    candidates = event.get("candidates") or []
                    parts = (candidates[0].get("content") or {}).get("parts") if candidates else []
                    for part in parts or []:
                        text = part.get("text")
                        if text:
                            yield {"text": text}
    except httpx.TimeoutException as exc:
        raise ProviderCallError(f"Provider request timed out: {exc!s}", 504) from exc
    except httpx.RequestError as exc:
        raise ProviderCallError(f"Provider connection failed: {exc!s}", 503) from exc
    yield {"usage": (input_tokens, output_tokens)}


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
        history: list[dict[str, str]] | None = None,
    ) -> GroundedAnswer:
        started = time.perf_counter()
        if not passages:
            return GroundedAnswer(content=assistant.fallback_message, latency_ms=0)

        system, user = _build_messages(assistant, query, passages, history)
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

        max_attempts_per_provider = 3
        for provider_name in order:
            model = _model_for(provider_name, requested)
            excluded: set[str] = set()
            for attempt in range(1, max_attempts_per_provider + 1):
                resolution = await IntelligentRoutingEngine.select_credential(
                    db,
                    provider_name,
                    model_name=model,
                    workspace_id=str(workspace_id),
                    exclude_ids=excluded,
                    attempt_number=attempt,
                    is_failover=attempt > 1,
                )
                if not resolution:
                    break

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
                        routing_id=resolution.routing_id,
                        error_category=_error_category(exc),
                        retry_after_seconds=exc.retry_after,
                        latency_ms=int((time.perf_counter() - started) * 1000),
                    )
                    excluded.add(str(resolution.credential.id))
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
                    routing_id=resolution.routing_id,
                    cost_source="estimated",
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

    @classmethod
    async def stream_grounded_answer(
        cls,
        db: AsyncSession,
        assistant: Assistant,
        query: str,
        passages: list[str],
        workspace_id: uuid.UUID,
        history: list[dict[str, str]] | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Stream a grounded answer, failing over across credentials before the first token.

        Emits events: meta, delta, error, done. ``done`` always carries the text
        that should be persisted, including partial text after a mid-stream
        provider failure, so callers never lose what the user already heard.
        """
        started = time.perf_counter()
        if not passages:
            text = assistant.fallback_message
            yield {
                "type": "done",
                "content": text,
                "used_llm": False,
                "input_tokens": 0,
                "output_tokens": 0,
                "cost_usd": 0.0,
                "latency_ms": 0,
                "provider_name": None,
                "model_name": None,
            }
            return

        system, user = _build_messages(assistant, query, passages, history)
        requested = (assistant.model or "Auto").strip()
        preferred_provider = None
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

        max_attempts_per_provider = 3
        last_error_message = "No provider is currently available."

        for provider_name in order:
            model = _model_for(provider_name, requested)
            excluded: set[str] = set()
            for attempt in range(1, max_attempts_per_provider + 1):
                resolution = await IntelligentRoutingEngine.select_credential(
                    db,
                    provider_name,
                    model_name=model,
                    workspace_id=str(workspace_id),
                    exclude_ids=excluded,
                    attempt_number=attempt,
                    is_failover=attempt > 1,
                )
                if not resolution:
                    break

                yield {
                    "type": "meta",
                    "provider_name": provider_name,
                    "model_name": model,
                    "routing_id": resolution.routing_id,
                    "credential_label": resolution.credential.label,
                    "decision_reason": resolution.decision_reason,
                    "attempt_number": attempt,
                }

                collected: list[str] = []
                usage = (0, 0)
                failure: ProviderCallError | None = None
                try:
                    async for chunk in stream_provider(
                        provider_name=provider_name,
                        api_key=resolution.raw_secret,
                        model=model,
                        system=system,
                        user=user,
                        temperature=float(assistant.temperature or 0.2),
                        max_tokens=int(assistant.max_tokens or 1024),
                    ):
                        if "text" in chunk:
                            collected.append(chunk["text"])
                            yield {"type": "delta", "text": chunk["text"]}
                        elif "usage" in chunk:
                            usage = chunk["usage"]
                except ProviderCallError as exc:
                    failure = exc
                    last_error_message = str(exc)

                content = "".join(collected).strip()
                latency_ms = int((time.perf_counter() - started) * 1000)

                if failure is not None:
                    logger.warning(f"Provider {provider_name} failed for assistant {assistant.id}: {failure!s}")
                    await IntelligentRoutingEngine.record_failure(
                        db,
                        credential_id=str(resolution.credential.id),
                        error_type="provider_error",
                        reason=str(failure),
                        is_rate_limit=failure.is_rate_limit,
                        routing_id=resolution.routing_id,
                        error_category=_error_category(failure),
                        retry_after_seconds=failure.retry_after,
                        latency_ms=latency_ms,
                    )
                    if content:
                        yield {
                            "type": "done",
                            "content": content,
                            "used_llm": True,
                            "truncated": True,
                            "input_tokens": usage[0],
                            "output_tokens": usage[1],
                            "cost_usd": _estimate_cost(model, usage[0], usage[1]),
                            "latency_ms": latency_ms,
                            "provider_name": provider_name,
                            "model_name": model,
                        }
                        return
                    excluded.add(str(resolution.credential.id))
                    continue

                if not content:
                    await IntelligentRoutingEngine.record_failure(
                        db,
                        credential_id=str(resolution.credential.id),
                        error_type="empty_response",
                        reason="Provider returned an empty stream.",
                        routing_id=resolution.routing_id,
                        error_category="empty_response",
                        latency_ms=latency_ms,
                    )
                    excluded.add(str(resolution.credential.id))
                    continue

                input_tokens, output_tokens = usage
                if input_tokens <= 0:
                    input_tokens = max(1, len(system + user) // 4)
                if output_tokens <= 0:
                    output_tokens = max(1, len(content) // 4)
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
                    routing_id=resolution.routing_id,
                    cost_source="estimated",
                )
                yield {
                    "type": "done",
                    "content": content,
                    "used_llm": True,
                    "truncated": False,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "cost_usd": cost,
                    "latency_ms": latency_ms,
                    "provider_name": provider_name,
                    "model_name": model,
                }
                return

        text = extractive_answer(passages, assistant.fallback_message)
        latency_ms = int((time.perf_counter() - started) * 1000)
        # Falling back to an extractive answer still produces a valid response;
        # surface the reason as metadata instead of a client-visible error.
        yield {
            "type": "meta",
            "fallback": True,
            "reason": last_error_message,
            "provider_name": None,
            "model_name": None,
        }
        yield {
            "type": "done",
            "content": text,
            "used_llm": False,
            "truncated": False,
            "input_tokens": 0,
            "output_tokens": 0,
            "cost_usd": 0.0,
            "latency_ms": latency_ms,
            "provider_name": None,
            "model_name": None,
        }


def _error_category(exc: ProviderCallError) -> str:
    if exc.is_rate_limit or exc.status_code == 429:
        return "rate_limit"
    if exc.status_code in (401, 403):
        return "auth"
    if exc.status_code in (408, 504) or "timed out" in str(exc).lower():
        return "timeout"
    if exc.status_code == 503:
        return "connection"
    if exc.status_code >= 500:
        return "provider"
    if exc.status_code == 404:
        return "not_found"
    return "provider_error"


llm_service = LLMService()
