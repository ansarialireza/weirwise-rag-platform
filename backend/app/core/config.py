"""Centralized application settings with strict validation."""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve the env file relative to the backend package, not the process cwd.
# Starting uvicorn from the repository root used to silently fall back to
# defaults (wrong Core URL, dev secret, no provider keys).
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    PROJECT_NAME: str = "Weirwise Platform API"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Server Bind
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    # Cryptography & Security
    SECRET_KEY: str = "insecure-dev-secret-key-replace-in-production-0123456789abcdef"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    SESSION_COOKIE_MAX_AGE_SECONDS: int = 30 * 24 * 60 * 60  # 30 days = 2,592,000s
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 15
    EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES: int = 15
    PASSWORD_MIN_LENGTH: int = 12
    PASSWORD_MIN_CHARACTER_CLASSES: int = 3

    # Authentication rate limiting (Redis-backed, in-process fallback when Redis is unavailable)
    AUTH_RATE_LIMIT_ENABLED: bool = True
    AUTH_LOGIN_ACCOUNT_LIMIT: int = 5
    AUTH_LOGIN_ACCOUNT_WINDOW_SECONDS: int = 900
    AUTH_LOGIN_ACCOUNT_GLOBAL_LIMIT: int = 50
    AUTH_LOGIN_ACCOUNT_GLOBAL_WINDOW_SECONDS: int = 3600
    AUTH_LOGIN_IP_LIMIT: int = 50
    AUTH_LOGIN_IP_WINDOW_SECONDS: int = 900
    AUTH_LOGIN_IP_ATTEMPT_LIMIT: int = 200
    AUTH_RESET_EMAIL_LIMIT: int = 5
    AUTH_RESET_EMAIL_WINDOW_SECONDS: int = 3600
    AUTH_RESET_IP_LIMIT: int = 30
    AUTH_RESET_IP_WINDOW_SECONDS: int = 3600
    AUTH_REGISTER_IP_LIMIT: int = 100
    AUTH_REGISTER_IP_WINDOW_SECONDS: int = 3600
    TRUST_PROXY_HEADERS: bool = False

    # HTTP security headers
    ENABLE_HSTS: bool = False
    HSTS_MAX_AGE_SECONDS: int = 31536000

    # Grounding safety floor, applied even when an assistant threshold is lower.
    MIN_GROUNDING_SIMILARITY: float = 0.55

    # Core indexing status polling
    CORE_INDEX_POLL_INTERVAL_SECONDS: float = 1.0
    CORE_INDEX_POLL_TIMEOUT_SECONDS: float = 120.0

    # Email / Resend & SMTP Service
    RESEND_API_KEY: str | None = None
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM_EMAIL: str = "noreply@weirwise.com"
    SMTP_FROM_NAME: str = "Weirwise Platform"
    SMTP_USE_TLS: bool = True

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./platform_dev.db"
    DATABASE_ECHO: bool = False

    # Object Storage & Tiered Storage Architecture
    STORAGE_BACKEND: str = "local"  # "local" or "s3"
    STORAGE_LOCAL_DIR: str = "/tmp/weirwise_uploads"
    STORAGE_COLD_DIR: str = "/mnt/gdrive/weirwise/storage/documents"
    MAX_UPLOAD_SIZE_BYTES: int = 50 * 1024 * 1024  # 50 MB
    ALLOWED_EXTENSIONS: list[str] = [".pdf", ".docx", ".txt", ".md"]
    ALLOWED_MIME_TYPES: list[str] = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "text/markdown",
    ]

    # Weirwise Core Integration Contract (Headless RAG Engine)
    WEIRWISE_CORE_BASE_URL: str = "http://localhost:8001"
    WEIRWISE_CORE_API_KEY: str = ""
    WEIRWISE_CORE_TIMEOUT_SECONDS: float = 30.0

    # Voice (Deepgram) — key stays server-side behind the authenticated relay
    DEEPGRAM_API_KEY: str | None = None
    DEEPGRAM_STT_MODEL: str = "nova-3"
    DEEPGRAM_TTS_MODEL: str = "aura-asteria-en"
    # Silence duration that finalizes an utterance. 300ms added perceptible
    # lag to every turn; 250ms still tolerates short pauses within a question.
    DEEPGRAM_ENDPOINTING_MS: int = 250

    # Redis Cache & Queue
    REDIS_URL: str | None = None

    # CORS
    ALLOWED_ORIGINS: list[str] = Field(default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"])

    # Staff Administration (Private System Provisioning)
    INITIAL_STAFF_ADMIN_EMAIL: str | None = None
    INITIAL_STAFF_ADMIN_PASSWORD: str | None = None

    # RAG & Embedding Engine Default
    DEFAULT_EMBEDDING_MODEL: str = "jina-embeddings-v4"


settings = Settings()
