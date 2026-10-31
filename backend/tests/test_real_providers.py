"""Controlled Real External Provider Integration Tests.
Executes live API turns against OpenRouter (LLM) and Deepgram (STT & TTS).
"""

import os

import pytest
from backend.app.services.deepgram import DeepgramError, DeepgramService
from backend.app.services.llm import LLMClient

OPENROUTER_TEST_KEY = os.getenv("TEST_OPENROUTER_API_KEY")
DEEPGRAM_TEST_KEY = os.getenv("TEST_DEEPGRAM_API_KEY")


@pytest.mark.skipif(not OPENROUTER_TEST_KEY, reason="TEST_OPENROUTER_API_KEY environment variable not set")
@pytest.mark.asyncio
async def test_real_openrouter_connectivity_and_generation():
    """Verify live OpenRouter chat completion, token usage, and cost metadata."""
    messages = [
        {"role": "system", "content": "You are a concise test assistant."},
        {"role": "user", "content": "Reply with only the word: PONG"},
    ]
    res = await LLMClient.generate_chat_completion(
        provider="openrouter",
        api_key=OPENROUTER_TEST_KEY,
        model="meta-llama/llama-3.2-3b-instruct",
        messages=messages,
        temperature=0.0,
        max_tokens=20,
    )
    assert res.content is not None
    assert "PONG" in res.content.upper()
    assert res.total_tokens > 0
    assert res.cost_usd >= 0.0


@pytest.mark.skipif(not DEEPGRAM_TEST_KEY, reason="TEST_DEEPGRAM_API_KEY environment variable not set")
@pytest.mark.asyncio
async def test_real_deepgram_tts_and_stt_loop():
    """Verify live Deepgram speech synthesis and transcription round-trip."""
    dg = DeepgramService(api_key=DEEPGRAM_TEST_KEY)

    # 1. Live TTS synthesis
    sample_text = "Welcome to Weirwise platform."
    audio_bytes = await dg.synthesize_speech(
        text=sample_text,
        voice="aura-2-andromeda-en",
        language="en",
    )
    assert len(audio_bytes) > 1000
    assert audio_bytes[:3] == b"ID3" or audio_bytes[0] == 0xFF

    # 2. Live STT transcription of the generated audio
    stt_res = await dg.transcribe_audio(
        audio_bytes=audio_bytes,
        content_type="audio/mp3",
        language="en",
        model="nova-3",
    )
    assert stt_res["transcript"] is not None
    assert "welcome" in stt_res["transcript"].lower()
    assert stt_res["confidence"] > 0.5


@pytest.mark.skipif(not DEEPGRAM_TEST_KEY, reason="TEST_DEEPGRAM_API_KEY environment variable not set")
@pytest.mark.asyncio
async def test_real_deepgram_persian_tts_graceful_handling():
    """Verify that Persian TTS is gracefully rejected according to verified capability audit."""
    dg = DeepgramService(api_key=DEEPGRAM_TEST_KEY)
    with pytest.raises(DeepgramError) as exc_info:
        await dg.synthesize_speech(
            text="سلام وقت بخیر",
            language="fa",
        )
    assert exc_info.value.status_code == 422
    assert "Persian text-to-speech voice is currently unsupported" in str(exc_info.value)
