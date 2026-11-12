import os
import time

from backend.app.services.storage import TieredStorageService


def test_storage_reaper_keeps_old_files_referenced_by_documents(tmp_path):
    hot_dir = tmp_path / "hot"
    referenced_file = hot_dir / "failed-document.txt"
    orphaned_file = hot_dir / "orphaned-upload.txt"
    storage = TieredStorageService(hot_dir=str(hot_dir), cold_dir=str(tmp_path / "cold"))

    referenced_file.write_text("retryable document", encoding="utf-8")
    orphaned_file.write_text("uncommitted upload", encoding="utf-8")
    old_time = time.time() - 7200
    os.utime(referenced_file, (old_time, old_time))
    os.utime(orphaned_file, (old_time, old_time))

    deleted = storage.reap_orphaned_temp_files(
        referenced_paths={str(referenced_file)},
        max_age_seconds=3600,
    )

    assert deleted == 1
    assert referenced_file.exists()
    assert not orphaned_file.exists()
