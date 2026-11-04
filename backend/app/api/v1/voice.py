"""Secure voice helpers: live speech relay and spoken replies.

The browser never receives the long-lived Deepgram API key. Audio streams from
the browser to this authenticated relay, which forwards it to Deepgram and
relays transcripts back. Spoken replies are proxied the same way.
"""

from __future__ import annotations

import asyncio
import contextlib
import uuid
from urllib.parse import urlencode

import httpx
import websockets
from backend.app.api.dependencies import get_current_user
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.core.security import decode_jwt_token
from backend.app.db.session import get_db_session
from backend.app.models.auth import User
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

router = APIRouter(prefix="/voice", tags=["voice"])

DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen"
DEEPGRAM_SPEAK_URL = "https://api.deepgram.com/v1/speak"

VOICE_SUBPROTOCOL = "wwp-voice"
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


def _require_key() -> str:
    key = (settings.DEEPGRAM_API_KEY or "").strip()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice is not configured for this workspace.",
        )
    return key


@router.get("/status")
async def voice_status(_: User = Depends(get_current_user)) -> dict[str, bool]:
    return {"available": bool((settings.DEEPGRAM_API_KEY or "").strip())}


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
    if not payload or "sub" not in payload:
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
        "endpointing": "300",
        "utterance_end_ms": "1000",
    }
    return f"{DEEPGRAM_LISTEN_URL}?{urlencode(params)}"


@router.websocket("/stream")
async def stream_transcription(
    websocket: WebSocket,
    language: str = Query(default="en"),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    user = await _authenticate_socket(websocket, db)
    if user is None:
        await websocket.close(code=4401)
        return

    key = (settings.DEEPGRAM_API_KEY or "").strip()
    if not key:
        await websocket.close(code=4403)
        return

    await websocket.accept(subprotocol=VOICE_SUBPROTOCOL)

    try:
        upstream = await websockets.connect(
            _listen_url(language),
            additional_headers={"Authorization": f"Token {key}"},
            open_timeout=10,
            ping_interval=20,
            close_timeout=5,
        )
    except Exception as exc:  # noqa: BLE001 - surfaced to the client as a voice error
        logger.warning("Deepgram live connection failed: %s", type(exc).__name__)
        with contextlib.suppress(Exception):
            await websocket.send_json(
                {"type": "error", "message": "Speech service is unavailable right now."}
            )
        await websocket.close(code=1011)
        return

    async def browser_to_upstream() -> bool:
        """Return True when the client asked to stop, False on disconnect."""
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                return False
            data = message.get("bytes")
            if data is not None:
                await upstream.send(data)
                continue
            if '"stop"' in (message.get("text") or ""):
                await upstream.send('{"type": "CloseStream"}')
                return True

    async def upstream_to_browser() -> None:
        async for message in upstream:
            if isinstance(message, bytes):
                continue
            if websocket.client_state.name == "CONNECTED":
                await websocket.send_text(message)

    browser_task = asyncio.create_task(browser_to_upstream())
    upstream_task = asyncio.create_task(upstream_to_browser())
    tasks = [browser_task, upstream_task]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        if browser_task in done and not browser_task.cancelled():
            with contextlib.suppress(WebSocketDisconnect):
                if browser_task.result():
                    # Let Deepgram flush the final transcript before closing.
                    await asyncio.wait([upstream_task], timeout=5)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await upstream.close()
        if websocket.client_state.name == "CONNECTED":
            with contextlib.suppress(Exception):
                await websocket.close()


@router.post("/speak")
async def synthesize_speech(
    body: SpeakRequest,
    _: User = Depends(get_current_user),
) -> StreamingResponse:
    key = _require_key()
    voice = body.voice if body.voice in ALLOWED_TTS_VOICES else settings.DEEPGRAM_TTS_MODEL

    client = httpx.AsyncClient(timeout=30.0)
    try:
        request = client.build_request(
            "POST",
            DEEPGRAM_SPEAK_URL,
            params={"model": voice},
            headers={"Authorization": f"Token {key}", "Content-Type": "application/json"},
            json={"text": body.text},
        )
        upstream = await client.send(request, stream=True)
    except httpx.HTTPError:
        await client.aclose()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Speech service is temporarily unavailable.",
        )

    if upstream.status_code >= 400:
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Speech service rejected the request.",
        )

    async def stream_audio():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(stream_audio(), media_type="audio/mpeg")
