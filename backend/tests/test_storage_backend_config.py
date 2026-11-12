import pytest
from backend.app.core.config import Settings
from pydantic import ValidationError


def test_unimplemented_s3_storage_backend_is_rejected():
    with pytest.raises(ValidationError):
        Settings(STORAGE_BACKEND="s3")
