"""Deepgram Speech-to-Text and Text-to-Speech integration service.

Maintains server-side credentials and provides streaming/REST speech operations.
"""

from typing import Any

import httpx
from backend.app.core.config import settings
from backend.app.core.logging import logger


class DeepgramError(Exception):
    def __init__(self, message: str, status_code: int = 502, details: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


class DeepgramService:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
    ):
        self.api_key = api_key or settings.DEEPGRAM_API_KEY
        self.base_url = (base_url or settings.DEEPGRAM_API_BASE_URL).rstrip("/")

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    def _get_headers(self) -> dict[str, str]:
        if not self.is_configured():
            raise DeepgramError("Deepgram API key is not configured.", status_code=503)
        return {
            "Authorization": f"Token {self.api_key}",
            "User-Agent": "Weirwise-Platform-Voice/1.0",
        }

    async def transcribe_audio(
        self,
        audio_bytes: bytes,
        content_type: str = "audio/webm",
        language: str = "en",
    ) -> dict[str, Any]:
        """Transcribe speech audio to text using Deepgram STT."""
        if not self.is_configured():
            raise DeepgramError("Deepgram API key is not configured on server.", status_code=503)

        if not audio_bytes:
            raise DeepgramError("Audio payload is empty.", status_code=400)

        # Maximum audio limit: 25 MB / ~10 minutes
        if len(audio_bytes) > 25 * 1024 * 1024:
            raise DeepgramError("Audio file exceeds maximum size limit (25 MB).", status_code=413)

        # Map language codes: "fa" uses nova-3 or whisper, "en" uses nova-3
        lang_code = "fa" if language.startswith("fa") else "en"
        model = settings.DEEPGRAM_STT_MODEL

        params = {
            "model": model,
            "language": lang_code,
            "smart_format": "true",
            "punctuate": "true",
        }

        url = f"{self.base_url}/v1/listen"
        headers = self._get_headers()
        headers["Content-Type"] = content_type

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, params=params, headers=headers, content=audio_bytes)
                if resp.status_code != 200:
                    logger.error(f"Deepgram STT failed [{resp.status_code}]: {resp.text}")
                    raise DeepgramError(f"Deepgram STT failed: {resp.text}", status_code=resp.status_code)

                data = resp.json()
                results = data.get("results", {})
                channels = results.get("channels", [])
                transcript = ""
                confidence = 0.0

                if channels:
                    alts = channels[0].get("alternatives", [])
                    if alts:
                        transcript = alts[0].get("transcript", "").strip()
                        confidence = float(alts[0].get("confidence", 0.0))

                return {
                    "transcript": transcript,
                    "confidence": confidence,
                    "language": lang_code,
                    "duration_seconds": data.get("metadata", {}).get("duration", 0.0),
                }

        except httpx.RequestError as e:
            logger.error(f"Network error communicating with Deepgram STT: {e!s}")
            raise DeepgramError(f"Network error communicating with Deepgram: {e!s}", status_code=504)

    async def synthesize_speech(
        self,
        text: str,
        voice: str | None = None,
        language: str = "en",
    ) -> bytes:
        """Synthesize text to speech using Deepgram TTS."""
        if not self.is_configured():
            raise DeepgramError("Deepgram API key is not configured on server.", status_code=503)

        clean_text = text.strip()
        if not clean_text:
            raise DeepgramError("Text to synthesize is empty.", status_code=400)

        # Truncate very long texts to 2000 chars to prevent abuse
        clean_text = clean_text[:2000]

        # Check Persian language limitation
        if language.startswith("fa"):
            raise DeepgramError(
                "Persian text-to-speech voice is currently unsupported by Deepgram.",
                status_code=422,
                details={"unsupported_language": "fa"},
            )

        model = voice or settings.DEEPGRAM_TTS_MODEL
        url = f"{self.base_url}/v1/speak"
        params = {"model": model}
        headers = self._get_headers()
        headers["Content-Type"] = "application/json"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, params=params, headers=headers, json={"text": clean_text})
                if resp.status_code != 200:
                    logger.error(f"Deepgram TTS failed [{resp.status_code}]: {resp.text}")
                    raise DeepgramError(f"Deepgram TTS failed: {resp.text}", status_code=resp.status_code)

                return resp.content

        except httpx.RequestError as e:
            logger.error(f"Network error communicating with Deepgram TTS: {e!s}")
            raise DeepgramError(f"Network error communicating with Deepgram: {e!s}", status_code=504)


deepgram_service = DeepgramService()
