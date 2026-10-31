"""Centralized application settings with strict validation."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
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
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 15

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./platform_dev.db"
    DATABASE_ECHO: bool = False

    # Object Storage & Uploads
    STORAGE_BACKEND: str = "local"  # "local" or "s3"
    STORAGE_LOCAL_DIR: str = "./uploads"
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

    # Redis Cache & Queue
    REDIS_URL: str | None = None

    # CORS
    ALLOWED_ORIGINS: list[str] = Field(default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"])

    # Staff Administration (Private System Provisioning)
    INITIAL_STAFF_ADMIN_EMAIL: str | None = None
    INITIAL_STAFF_ADMIN_PASSWORD: str | None = None

    # Deepgram Voice Integration (STT / TTS)
    DEEPGRAM_API_KEY: str = ""
    DEEPGRAM_API_BASE_URL: str = "https://api.deepgram.com"
    DEEPGRAM_STT_MODEL: str = "nova-3"
    DEEPGRAM_TTS_MODEL: str = "aura-2-andromeda-en"


settings = Settings()
