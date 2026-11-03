"""Enterprise Tiered Storage Architecture (Hot SSD vs. Cold Network Mount).

Engineering Principles:
- Hot Tier (/tmp volatile local SSD): Temporary ingestion spool. Fast, zero-blocking.
- Cold Tier (/mnt/gdrive vault): Source of truth for raw user documents.
- Async Ingestion: Spool to /tmp -> Compute/Embed -> Move to cold tier -> Failsafe deletion of /tmp.
- Ephemeral Local GC Reaper: Purges orphaned files older than max_age_seconds (default 1 hour).
- Streamed Network Retrieval: Chunked async streaming using aiofiles with StreamingResponse.
"""

from collections.abc import AsyncGenerator
import hashlib
import os
import re
import shutil
import time
from typing import Optional

from backend.app.core.config import settings
from backend.app.core.logging import logger
from fastapi import HTTPException, UploadFile, status

try:
    import aiofiles
    import aiofiles.os
except ImportError:
    aiofiles = None  # type: ignore


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal and filesystem attacks."""
    clean = filename.replace("\\", "/")
    clean = os.path.basename(clean)
    clean = re.sub(r"[^\w\.\- ]", "_", clean)
    clean = clean.strip()
    if not clean or clean.startswith("."):
        clean = f"document_{clean}"
    return clean


class TieredStorageService:
    def __init__(
        self,
        hot_dir: Optional[str] = None,
        cold_dir: Optional[str] = None,
    ):
        self.hot_dir = hot_dir or settings.STORAGE_LOCAL_DIR
        self.cold_dir = cold_dir or getattr(
            settings, "STORAGE_COLD_DIR", "/mnt/gdrive/weirwise/storage/documents"
        )
        # Ensure hot temp spool directory exists
        os.makedirs(self.hot_dir, exist_ok=True)
        # Cold vault directory will be created if accessible, else gracefully fallback
        try:
            os.makedirs(self.cold_dir, exist_ok=True)
        except Exception as e:
            logger.warning(
                f"Cold vault directory {self.cold_dir} not immediately accessible at init: {e}"
            )

    @property
    def base_dir(self) -> str:
        """Backward compatibility for existing code referencing base_dir."""
        return self.hot_dir

    def resolve_path(self, file_storage_name: str) -> str:
        """Return the actual file path, checking cold vault first, then hot temp."""
        cold_path = os.path.join(self.cold_dir, file_storage_name)
        if os.path.exists(cold_path):
            return cold_path
        hot_path = os.path.join(self.hot_dir, file_storage_name)
        if os.path.exists(hot_path):
            return hot_path
        return cold_path

    async def save_upload(self, file: UploadFile) -> tuple[str, str, int, str]:
        """Step 1 (Fast Ingest): Spool upload directly to volatile local hot /tmp.
        Returns instantly without blocking on network storage.
        Returns: (sanitized_filename, hot_temp_path, total_size, content_hash)
        """
        raw_name = file.filename or "uploaded_file"
        safe_name = sanitize_filename(raw_name)

        ext = os.path.splitext(safe_name)[1].lower()
        if ext not in settings.ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File extension '{ext}' is not supported. Allowed: {settings.ALLOWED_EXTENSIONS}",
            )

        hasher = hashlib.sha256()
        total_size = 0
        chunks: list[bytes] = []

        while chunk := await file.read(64 * 1024):  # Read in 64KB chunks
            total_size += len(chunk)
            if total_size > settings.MAX_UPLOAD_SIZE_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds maximum upload size of {settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB",
                )
            hasher.update(chunk)
            chunks.append(chunk)

        content_hash = hasher.hexdigest()
        file_storage_name = f"{content_hash}_{safe_name}"
        hot_temp_path = os.path.join(self.hot_dir, file_storage_name)

        # Write to volatile fast hot storage
        with open(hot_temp_path, "wb") as f:
            f.writelines(chunks)

        return safe_name, hot_temp_path, total_size, content_hash

    def move_to_cold_storage(self, hot_path: str) -> str:
        """Step 3 (Cold Transfer): Atomically move raw file from local /tmp to Cold Vault.
        Leaves ZERO footprint of raw files on the local SSD.
        """
        if not os.path.exists(hot_path):
            raise FileNotFoundError(f"Source file not found at hot path: {hot_path}")

        filename = os.path.basename(hot_path)
        os.makedirs(self.cold_dir, exist_ok=True)
        cold_path = os.path.join(self.cold_dir, filename)

        # Atomic move across filesystems (shutil.move handles cross-device transfer safely)
        shutil.move(hot_path, cold_path)
        logger.info(f"Cold tier transfer complete: {hot_path} -> {cold_path}")
        return cold_path

    def read_file_bytes(self, storage_path: str) -> bytes:
        """Read saved document content from cold vault or hot tier."""
        resolved = storage_path
        if not os.path.exists(resolved):
            resolved = self.resolve_path(os.path.basename(storage_path))
        if not os.path.exists(resolved):
            raise FileNotFoundError(f"Storage file not found: {storage_path}")

        with open(resolved, "rb") as f:
            return f.read()

    async def stream_file_chunks(
        self, storage_path: str, chunk_size: int = 64 * 1024
    ) -> AsyncGenerator[bytes, None]:
        """Step 4 (Streamed Network Retrieval): Asynchronous chunked streaming
        from Google Drive cold mount without buffering whole files in RAM.
        """
        resolved = storage_path
        if not os.path.exists(resolved):
            resolved = self.resolve_path(os.path.basename(storage_path))
        if not os.path.exists(resolved):
            raise FileNotFoundError(f"Storage file not found for streaming: {storage_path}")

        if aiofiles is not None:
            async with aiofiles.open(resolved, mode="rb") as f:
                while chunk := await f.read(chunk_size):
                    yield chunk
        else:
            # Synchronous chunk streaming generator fallback
            with open(resolved, "rb") as f:
                while chunk := f.read(chunk_size):
                    yield chunk

    def delete_file(self, storage_path: str) -> bool:
        """Safely delete file from storage tier (checks both cold vault and hot temp)."""
        deleted = False
        if os.path.exists(storage_path):
            try:
                os.remove(storage_path)
                deleted = True
            except OSError as e:
                logger.warning(f"Failed to delete {storage_path}: {e}")

        # Also check alternate tier
        base = os.path.basename(storage_path)
        cold_alt = os.path.join(self.cold_dir, base)
        hot_alt = os.path.join(self.hot_dir, base)
        for alt in (cold_alt, hot_alt):
            if alt != storage_path and os.path.exists(alt):
                try:
                    os.remove(alt)
                    deleted = True
                except OSError as e:
                    logger.warning(f"Failed to delete alternate path {alt}: {e}")

        return deleted

    def reap_orphaned_temp_files(self, max_age_seconds: int = 3600) -> int:
        """Step 3 Ephemeral Garbage Collection Reaper:
        Scans local hot /tmp directory and forcefully deletes any orphaned
        temporary files older than max_age_seconds (default 1 hour).
        """
        if not os.path.exists(self.hot_dir):
            return 0

        now = time.time()
        reaped_count = 0
        try:
            for entry in os.scandir(self.hot_dir):
                if entry.is_file():
                    try:
                        mtime = entry.stat().st_mtime
                        if (now - mtime) > max_age_seconds:
                            os.remove(entry.path)
                            reaped_count += 1
                            logger.info(
                                f"Reaper: Removed orphaned hot tier temp file: {entry.path} (age: {int(now - mtime)}s)"
                            )
                    except OSError as e:
                        logger.warning(f"Reaper: Could not inspect/remove {entry.path}: {e}")
        except Exception as e:
            logger.error(f"Reaper encountered error while scanning {self.hot_dir}: {e}")

        return reaped_count


# Global singleton instance
storage_service = TieredStorageService()
