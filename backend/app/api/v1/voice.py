"""Secure voice helpers: live speech relay and spoken replies.

The browser never receives the long-lived Deepgram API key. Audio streams from
the browser to this authenticated relay, which forwards it to Deepgram and
relays transcripts back. Spoken replies are proxied the same way.

Credentials are resolved through the admin-managed provider pool when one is
configured, so multiple Deepgram tokens participate in health-aware failover.
The environment key remains a single-credential fallback for local setups.
"""

from __future__ import annotations

import asyncio
import contextlib
import time
import uuid
from collections.abc import AsyncGenerator
from urllib.parse import urlencode, urlparse

import httpx
import websockets
from backend.app.api.dependencies import get_current_user
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.core.security import decode_jwt_token
from backend.app.db.session import get_db_session
from backend.app.models.admin import ProviderAccount
from backend.app.models.auth import User
from backend.app.services.routing_engine import IntelligentRoutingEngine, RoutingResolution
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.websockets import WebSocketDisconnected

router = APIRouter(prefix="/voice", tags=["voice"])

DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen"
DEEPGRAM_SPEAK_URL = "https://api.deepgram.com/v1/speak"

# Keep-alive pool for TTS. Reusing the TLS connection removes the handshake
# from every spoken chunk, which is a measurable part of first-audio latency.
_tts_clients: dict[int, httpx.AsyncClient] = {}


def _tts_client() -> httpx.AsyncClient:
    loop_id = id(asyncio.get_running_loop())
    client = _tts_clients.get(loop_id)
    if client is None or client.is_closed:
        client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10, keepalive_expiry=120.0),
        )
        _tts_clients[loop_id] = client
    return client


async def _warm_speak_connection(raw_key: str) -> None:
    """Prime the pooled TTS TLS connection ahead of the first spoken chunk."""
    try:
        response = await _tts_client().get(
            DEEPGRAM_SPEAK_URL, headers={"Authorization": f"Token {raw_key}"}
        )
        await response.aclose()
    except Exception:  # noqa: BLE001 - warm-up is best-effort
        pass

VOICE_SUBPROTOCOL = "wwp-voice"
MAX_CONNECT_ATTEMPTS = 3
ALLOWED_LANGUAGES = {
    "en",
    "fa",
    "de",
    "fr",
    "es",
    "it",
    "pt",
    "nl",
    "ru",
    "tr",
    "ja",
    "ko",
    "zh",
    "hi",
    "ar",
}
ALLOWED_TTS_VOICES = {
    "aura-asteria-en",
    "aura-luna-en",
    "aura-stella-en",
    "aura-orion-en",
}


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    voice: str | None = None


def _env_key() -> str | None:
    key = (settings.DEEPGRAM_API_KEY or "").strip()
    return key or None


async def _deepgram_pool_configured(db: AsyncSession) -> bool:
    provider = (
        await db.execute(
            select(ProviderAccount).where(
                ProviderAccount.provider_name == "deepgram",
                ProviderAccount.is_enabled.is_(True),
            )
        )
    ).scalar_one_or_none()
    return provider is not None


async def _voice_candidates(db: AsyncSession) -> AsyncGenerator[tuple[str, RoutingResolution | None], None]:
    """Yield decrypted Deepgram tokens in routing order.

    The admin-managed pool is authoritative when present. In manual mode only
    the configured token is yielded; automatic mode yields up to
    MAX_CONNECT_ATTEMPTS distinct healthy tokens for transparent failover.
    """
    if await _deepgram_pool_configured(db):
        excluded: set[str] = set()
        for attempt in range(1, MAX_CONNECT_ATTEMPTS + 1):
            resolution = await IntelligentRoutingEngine.select_credential(
                db,
                "deepgram",
                exclude_ids=excluded,
                attempt_number=attempt,
                is_failover=attempt > 1,
            )
            if resolution is None:
                return
            excluded.add(str(resolution.credential.id))
            yield resolution.raw_secret, resolution
            if resolution.routing_mode == "manual":
                return
        return

    env_key = _env_key()
    if env_key:
        yield env_key, None


async def _require_voice_availability(db: AsyncSession) -> None:
    if _env_key() or await _deepgram_pool_configured(db):
        return
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Voice is not configured for this workspace.",
    )


def _origin_allowed(websocket: WebSocket) -> bool:
    """Reject cross-site browser sockets while allowing native clients without Origin."""
    origin = websocket.headers.get("origin")
    if not origin:
        return True
    if origin in settings.ALLOWED_ORIGINS:
        return True
    try:
        origin_host = urlparse(origin).netloc
        request_host = websocket.headers.get("host")
    except ValueError:
        return False
    return bool(origin_host and request_host and origin_host == request_host)


@router.get("/status")
async def voice_status(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    pool = await _deepgram_pool_configured(db)
    return {
        "available": bool(_env_key()) or pool,
        "streaming": True,
        "pool_managed": pool,
        "stt_model": settings.DEEPGRAM_STT_MODEL,
        "tts_model": settings.DEEPGRAM_TTS_MODEL,
    }


async def _authenticate_socket(websocket: WebSocket, db: AsyncSession) -> User | None:
    """Resolve the user from the auth cookie or a bearer token sent as a subprotocol."""
    token = websocket.cookies.get("access_token")
    if not token:
        offered = [
            part.strip()
            for part in (websocket.headers.get("sec-websocket-protocol") or "").split(",")
            if part.strip()
        ]
        if len(offered) >= 2 and offered[0] == VOICE_SUBPROTOCOL:
            token = offered[1]

    if not token:
        return None

    payload = decode_jwt_token(token)
    if not payload or "sub" not in payload or payload.get("type") not in (None, "access"):
        return None

    try:
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, TypeError):
        return None

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active.is_(True))
    )
    return result.scalar_one_or_none()


def _listen_url(language: str) -> str:
    language = language if language in ALLOWED_LANGUAGES else "en"
    params = {
        "model": settings.DEEPGRAM_STT_MODEL,
        "language": language,
        "smart_format": "true",
        "interim_results": "true",
        "endpointing": str(settings.DEEPGRAM_ENDPOINTING_MS),
        "utterance_end_ms": "1000",
        "vad_events": "true",
    }
    return f"{DEEPGRAM_LISTEN_URL}?{urlencode(params)}"


@router.websocket("/stream")
async def stream_transcription(
    websocket: WebSocket,
    language: str = Query(default="en"),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    if not _origin_allowed(websocket):
        await websocket.close(code=4403)
        return

    user = await _authenticate_socket(websocket, db)
    if user is None:
        await websocket.close(code=4401)
        return

    if not (_env_key() or await _deepgram_pool_configured(db)):
        await websocket.close(code=4403)
        return

    await websocket.accept(subprotocol=VOICE_SUBPROTOCOL)

    upstream = None
    upstream_key: str | None = None
    async for raw_key, candidate in _voice_candidates(db):
        connect_started = time.perf_counter()
        try:
            upstream = await websockets.connect(
                _listen_url(language),
                additional_headers={"Authorization": f"Token {raw_key}"},
                open_timeout=10,
                ping_interval=20,
                close_timeout=5,
            )
            if candidate is not None:
                await IntelligentRoutingEngine.record_success_event(
                    db,
                    credential_id=str(candidate.credential.id),
                    routing_id=candidate.routing_id,
                    latency_ms=int((time.perf_counter() - connect_started) * 1000),
                )
            upstream_key = raw_key
            break
        except Exception as exc:  # noqa: BLE001 - surfaced to the client as a voice error
            logger.warning("Deepgram live connection failed: %s", type(exc).__name__)
            if candidate is not None:
                await IntelligentRoutingEngine.record_failure(
                    db,
                    credential_id=str(candidate.credential.id),
                    error_type="connection_error",
                    reason=f"live_connect_failed:{type(exc).__name__}",
                    routing_id=candidate.routing_id,
                    error_category="connection",
                )
            upstream = None
            if candidate is None:
                break

    if upstream is None:
        with contextlib.suppress(Exception):
            await websocket.send_json(
                {"type": "error", "message": "Speech service is unavailable right now."}
            )
        await websocket.close(code=1011)
        return

    # The first spoken reply is sent several seconds from now; open the TTS TLS
    # connection while the user is still talking so its first chunk skips the
    # handshake.
    if upstream_key:
        asyncio.create_task(_warm_speak_connection(upstream_key))

    async def browser_to_upstream() -> bool:
        """Return True when the client asked to stop, False on disconnect."""
        while True:
            try:
                message = await websocket.receive()
            except (WebSocketDisconnect, WebSocketDisconnected):
                return False
            if message.get("type") == "websocket.disconnect":
                return False
            data = message.get("bytes")
            if data is not None:
                await upstream.send(data)
                continue
            text = message.get("text") or ""
            if not text:
                continue
            if '"stop"' in text:
                await upstream.send('{"type": "CloseStream"}')
                return True
            if '"finalize"' in text:
                await upstream.send('{"type": "Finalize"}')
            elif '"keepalive"' in text:
                await upstream.send('{"type": "KeepAlive"}')

    async def upstream_to_browser() -> None:
        async for message in upstream:
            if isinstance(message, bytes):
                continue
            # Re-prime the TTS connection while the turn is still being
            # transcribed; providers drop idle keep-alive sockets quickly.
            if upstream_key:
                compact = message.replace(" ", "")
                if '"type":"SpeechStarted"' in compact or '"speech_final":true' in compact:
                    asyncio.create_task(_warm_speak_connection(upstream_key))
            if websocket.client_state.name == "CONNECTED":
                await websocket.send_text(message)

    async def keepalive() -> None:
        while True:
            await asyncio.sleep(8)
            with contextlib.suppress(Exception):
                await upstream.send('{"type": "KeepAlive"}')

    browser_task = asyncio.create_task(browser_to_upstream())
    upstream_task = asyncio.create_task(upstream_to_browser())
    keepalive_task = asyncio.create_task(keepalive())
    tasks = [browser_task, upstream_task]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        if browser_task in done and not browser_task.cancelled():
            with contextlib.suppress(WebSocketDisconnect, WebSocketDisconnected):
                if browser_task.result():
                    # Let Deepgram flush the final transcript before closing.
                    await asyncio.wait([upstream_task], timeout=5)
    finally:
        keepalive_task.cancel()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, keepalive_task, return_exceptions=True)
        await upstream.close()
        if websocket.client_state.name == "CONNECTED":
            with contextlib.suppress(Exception):
                await websocket.close()


@router.post("/speak")
async def synthesize_speech(
    body: SpeakRequest,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> StreamingResponse:
    await _require_voice_availability(db)
    voice = body.voice if body.voice in ALLOWED_TTS_VOICES else settings.DEEPGRAM_TTS_MODEL

    client = _tts_client()
    upstream = None
    try:
        async for raw_key, candidate in _voice_candidates(db):
            speak_started = time.perf_counter()
            try:
                request = client.build_request(
                    "POST",
                    DEEPGRAM_SPEAK_URL,
                    params={"model": voice},
                    headers={"Authorization": f"Token {raw_key}", "Content-Type": "application/json"},
                    json={"text": body.text},
                )
                attempt = await client.send(request, stream=True)
            except httpx.HTTPError as exc:
                if candidate is not None:
                    await IntelligentRoutingEngine.record_failure(
                        db,
                        credential_id=str(candidate.credential.id),
                        error_type="connection_error",
                        reason=f"speak_connect_failed:{type(exc).__name__}",
                        routing_id=candidate.routing_id,
                        error_category="connection",
                    )
                continue

            if attempt.status_code < 400:
                upstream = attempt
                if candidate is not None:
                    await IntelligentRoutingEngine.record_success_event(
                        db,
                        credential_id=str(candidate.credential.id),
                        routing_id=candidate.routing_id,
                        latency_ms=int((time.perf_counter() - speak_started) * 1000),
                    )
                break

            retry_after = None
            with contextlib.suppress(TypeError, ValueError):
                retry_after = int(attempt.headers.get("retry-after", ""))
            with contextlib.suppress(Exception):
                await attempt.aclose()
            if candidate is not None:
                await IntelligentRoutingEngine.record_failure(
                    db,
                    credential_id=str(candidate.credential.id),
                    error_type="provider_error",
                    reason=f"speak_http_{attempt.status_code}",
                    is_rate_limit=attempt.status_code == 429,
                    routing_id=candidate.routing_id,
                    error_category="rate_limit" if attempt.status_code == 429 else "provider",
                    retry_after_seconds=retry_after,
                )
            if candidate is None or candidate.routing_mode == "manual":
                break

        if upstream is None:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Speech service is temporarily unavailable.",
            )

        async def stream_audio():
            try:
                async for chunk in upstream.aiter_bytes():
                    yield chunk
            finally:
                await upstream.aclose()

        return StreamingResponse(stream_audio(), media_type="audio/mpeg")
    except BaseException:
        if upstream is not None:
            with contextlib.suppress(Exception):
                await upstream.aclose()
        raise
