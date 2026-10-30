"""Secure local and object storage abstraction for uploaded files."""

import hashlib
import os
import re

from backend.app.core.config import settings
from fastapi import HTTPException, UploadFile, status


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal and filesystem attacks."""
    clean = filename.replace("\\", "/")
    clean = os.path.basename(clean)
    clean = re.sub(r"[^\w\.\- ]", "_", clean)
    clean = clean.strip()
    if not clean or clean.startswith("."):
        clean = f"document_{clean}"
    return clean


class StorageService:
    def __init__(self, base_dir: str | None = None):
        self.base_dir = base_dir or settings.STORAGE_LOCAL_DIR
        os.makedirs(self.base_dir, exist_ok=True)

    async def save_upload(self, file: UploadFile) -> tuple[str, str, int, str]:
        """Validate and persist uploaded file.
        Returns: (sanitized_filename, storage_path, file_size_bytes, content_hash)
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
        chunks = []

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
        storage_path = os.path.join(self.base_dir, file_storage_name)

        # Write to disk
        with open(storage_path, "wb") as f:
            f.writelines(chunks)

        return safe_name, storage_path, total_size, content_hash

    def read_file_bytes(self, storage_path: str) -> bytes:
        """Read saved document content."""
        if not os.path.exists(storage_path):
            raise FileNotFoundError(f"Storage file not found: {storage_path}")
        with open(storage_path, "rb") as f:
            return f.read()

    def delete_file(self, storage_path: str) -> bool:
        """Safely delete file from storage."""
        if os.path.exists(storage_path):
            os.remove(storage_path)
            return True
        return False


storage_service = StorageService()
