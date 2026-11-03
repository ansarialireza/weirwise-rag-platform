#!/usr/bin/env bash
set -euo pipefail

# Weirwise Storage Reaper (Hourly Ephemeral Hot-Tier Cleanup)
# Scans volatile local /tmp uploads and prunes any file older than 1 hour (3600 seconds)

HOT_TMP_DIRS=(
    "/tmp/weirwise_uploads"
    "/tmp"
)

MAX_AGE_MINUTES=60

echo "=================================================="
echo "Starting Weirwise Hot Tier Ephemeral Storage Reaper"
echo "Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "=================================================="

# 1. Purge dedicated hot tier spool directory
if [ -d "/tmp/weirwise_uploads" ]; then
    echo "Scanning /tmp/weirwise_uploads for files older than ${MAX_AGE_MINUTES} minutes..."
    find /tmp/weirwise_uploads -type f -mmin +${MAX_AGE_MINUTES} -exec rm -v {} \; 2>/dev/null || true
fi

# 2. Prune any orphaned weirwise tmp files in /tmp
echo "Scanning /tmp for orphaned weirwise upload artifacts..."
find /tmp -maxdepth 1 -name "*_*" -type f -mmin +${MAX_AGE_MINUTES} -user 10001 -exec rm -v {} \; 2>/dev/null || true

# 3. Trigger in-container reaper if containers are active
for CONTAINER in weirwise-dev-backend weirwise-prod-backend; do
    if docker ps -q -f name="^${CONTAINER}$" | grep -q .; then
        echo "Running storage reaper inside ${CONTAINER}..."
        docker exec "${CONTAINER}" python -c "
from backend.app.services.storage import storage_service
reaped = storage_service.reap_orphaned_temp_files(max_age_seconds=3600)
print(f'Purged {reaped} orphaned files inside container.')
" 2>/dev/null || true
    fi
done

echo "Storage Reaper finished successfully."
