"""LLM Provider Client Engine for Weirwise Platform.

Supports OpenRouter, OpenAI, Anthropic, and generic OpenAI-compatible APIs.
Connects with IntelligentRoutingEngine for credential resolution and FinOps ledger.
"""

from dataclasses import dataclass
from typing import Any

import httpx
from backend.app.core.logging import logger


class LLMClientError(Exception):
    def __init__(self, message: str, status_code: int = 502, details: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


@dataclass
class LLMGenerationResult:
    content: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_usd: float
    raw_usage: dict[str, Any]


class LLMClient:
    """Unified client for invoking chat completion models across providers."""

    @staticmethod
    async def generate_chat_completion(
        provider: str,
        api_key: str,
        model: str,
        messages: list[dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 1024,
        timeout_seconds: float = 45.0,
    ) -> LLMGenerationResult:
        """Execute chat completion with real provider."""
        provider_clean = (provider or "").lower().strip()

        if provider_clean in ("openrouter", "openai", "azure_openai"):
            return await LLMClient._call_openai_compatible(
                provider=provider_clean,
                api_key=api_key,
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            )
        elif provider_clean == "anthropic":
            return await LLMClient._call_anthropic(
                api_key=api_key,
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            )
        else:
            # Fallback to OpenAI-compatible format (e.g. custom endpoints)
            return await LLMClient._call_openai_compatible(
                provider="openai",
                api_key=api_key,
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            )

    @staticmethod
    async def _call_openai_compatible(
        provider: str,
        api_key: str,
        model: str,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
    ) -> LLMGenerationResult:
        if provider == "openrouter":
            endpoint = "https://openrouter.ai/api/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {api_key.strip()}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://weirwise.com",
                "X-Title": "Weirwise Platform",
            }
        else:
            endpoint = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {api_key.strip()}",
                "Content-Type": "application/json",
            }

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                resp = await client.post(endpoint, json=payload, headers=headers)
                if resp.status_code != 200:
                    logger.error(f"LLM Provider [{provider}] returned HTTP {resp.status_code}: {resp.text}")
                    raise LLMClientError(
                        f"LLM generation failed ({provider}): {resp.text}",
                        status_code=resp.status_code,
                        details=resp.text,
                    )

                data = resp.json()
                choices = data.get("choices", [])
                if not choices:
                    raise LLMClientError("Provider returned empty choices array.", status_code=502)

                content = choices[0].get("message", {}).get("content", "").strip()
                usage = data.get("usage", {})
                prompt_tokens = usage.get("prompt_tokens", 0)
                completion_tokens = usage.get("completion_tokens", 0)
                total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)

                # OpenRouter returns exact cost in usage.cost
                cost_usd = float(usage.get("cost", 0.0))
                if cost_usd == 0.0 and total_tokens > 0:
                    # Generic approximate cost calculation
                    cost_usd = (prompt_tokens * 0.00000015) + (completion_tokens * 0.0000006)

                return LLMGenerationResult(
                    content=content,
                    model=data.get("model", model),
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens,
                    cost_usd=cost_usd,
                    raw_usage=usage,
                )

        except httpx.TimeoutException as e:
            logger.error(f"LLM Provider [{provider}] timeout after {timeout_seconds}s: {e!s}")
            raise LLMClientError(f"LLM Provider timeout: {e!s}", status_code=504)
        except httpx.RequestError as e:
            logger.error(f"LLM Provider [{provider}] connection error: {e!s}")
            raise LLMClientError(f"LLM connection error: {e!s}", status_code=503)

    @staticmethod
    async def _call_anthropic(
        api_key: str,
        model: str,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
    ) -> LLMGenerationResult:
        endpoint = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": api_key.strip(),
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }

        # Extract system prompt if present
        system_text = ""
        filtered_msgs = []
        for m in messages:
            if m["role"] == "system":
                system_text += f"{m['content']}\n\n"
            else:
                filtered_msgs.append({"role": m["role"], "content": m["content"]})

        payload: dict[str, Any] = {
            "model": model,
            "messages": filtered_msgs,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system_text:
            payload["system"] = system_text.strip()

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                resp = await client.post(endpoint, json=payload, headers=headers)
                if resp.status_code != 200:
                    logger.error(f"Anthropic returned HTTP {resp.status_code}: {resp.text}")
                    raise LLMClientError(
                        f"Anthropic generation failed: {resp.text}",
                        status_code=resp.status_code,
                        details=resp.text,
                    )

                data = resp.json()
                content_blocks = data.get("content", [])
                text_parts = [b.get("text", "") for b in content_blocks if b.get("type") == "text"]
                content = "".join(text_parts).strip()

                usage = data.get("usage", {})
                prompt_tokens = usage.get("input_tokens", 0)
                completion_tokens = usage.get("output_tokens", 0)
                total_tokens = prompt_tokens + completion_tokens
                cost_usd = (prompt_tokens * 0.000003) + (completion_tokens * 0.000015)

                return LLMGenerationResult(
                    content=content,
                    model=data.get("model", model),
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens,
                    cost_usd=cost_usd,
                    raw_usage=usage,
                )

        except httpx.TimeoutException as e:
            logger.error(f"Anthropic timeout after {timeout_seconds}s: {e!s}")
            raise LLMClientError(f"Anthropic timeout: {e!s}", status_code=504)
        except httpx.RequestError as e:
            logger.error(f"Anthropic connection error: {e!s}")
            raise LLMClientError(f"Anthropic connection error: {e!s}", status_code=503)
