#!/usr/bin/env bash
set -euo pipefail

# Weirwise Enterprise Backup Engine
# Backs up Platform PostgreSQL, Core pgvector PostgreSQL, and Persistent Storage Volumes.
# Usage: ./scripts/backup.sh [--env dev|prod] [--with-storage]

ENV_TYPE="dev"
INCLUDE_STORAGE=true

while [[ $# -gt 0 ]]; do
    case "$1" in
        --env|-e)
            ENV_TYPE="$2"
            shift 2
            ;;
        --with-storage)
            INCLUDE_STORAGE=true
            shift
            ;;
        --no-storage)
            INCLUDE_STORAGE=false
            shift
            ;;
        *)
            ENV_TYPE="$1"
            shift
            ;;
    esac
done

if [[ "$ENV_TYPE" != "dev" && "$ENV_TYPE" != "prod" ]]; then
    echo "Error: Unknown environment '$ENV_TYPE'. Must be 'dev' or 'prod'." >&2
    exit 1
fi

BACKUP_DIR="/srv/weirwise/shared/backups"
MONITORING_DIR="/srv/weirwise/shared/monitoring"
mkdir -p "$BACKUP_DIR" "$MONITORING_DIR"
chmod 700 "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
START_TIME=$(date +%s)
STATUS_FILE="${MONITORING_DIR}/backup_status_${ENV_TYPE}.json"

echo "=================================================="
echo "Starting Weirwise Comprehensive Backup: ${ENV_TYPE}"
echo "Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "=================================================="

BACKUP_FILES=()

# 1. Platform Database Backup
PLATFORM_CONTAINER="weirwise-${ENV_TYPE}-db"
PLATFORM_USER="weirwise_${ENV_TYPE}"
PLATFORM_DB="weirwise_${ENV_TYPE}_db"
PLATFORM_BACKUP="${BACKUP_DIR}/weirwise_${ENV_TYPE}_platform_db_${TIMESTAMP}.sql.gz"

if docker ps -q -f name="^${PLATFORM_CONTAINER}$" | grep -q .; then
    echo "[1/3] Dumping Platform database (${PLATFORM_CONTAINER})..."
    docker exec "${PLATFORM_CONTAINER}" pg_dump -U "${PLATFORM_USER}" -d "${PLATFORM_DB}" --no-owner --clean --if-exists | gzip > "${PLATFORM_BACKUP}"
    
    # Verify gzip integrity
    gzip -t "${PLATFORM_BACKUP}"
    chmod 600 "${PLATFORM_BACKUP}"
    BACKUP_FILES+=("${PLATFORM_BACKUP}")
    echo "  Platform DB backup complete: ${PLATFORM_BACKUP} ($(du -h "${PLATFORM_BACKUP}" | cut -f1))"
else
    echo "  Notice: Container ${PLATFORM_CONTAINER} not running. Checking if stopped..."
    if docker ps -a -q -f name="^${PLATFORM_CONTAINER}$" | grep -q .; then
        echo "  Warning: ${PLATFORM_CONTAINER} is stopped, cannot perform live dump." >&2
    fi
fi

# 2. Core Vector Database Backup
CORE_CONTAINER="weirwise-${ENV_TYPE}-core-db"
CORE_USER="weirwise_core_${ENV_TYPE}"
CORE_DB="weirwise_core_${ENV_TYPE}_db"
CORE_BACKUP="${BACKUP_DIR}/weirwise_${ENV_TYPE}_core_db_${TIMESTAMP}.sql.gz"

if docker ps -q -f name="^${CORE_CONTAINER}$" | grep -q .; then
    echo "[2/3] Dumping Core pgvector database (${CORE_CONTAINER})..."
    docker exec "${CORE_CONTAINER}" pg_dump -U "${CORE_USER}" -d "${CORE_DB}" --no-owner --clean --if-exists | gzip > "${CORE_BACKUP}"
    
    # Verify gzip integrity
    gzip -t "${CORE_BACKUP}"
    chmod 600 "${CORE_BACKUP}"
    BACKUP_FILES+=("${CORE_BACKUP}")
    echo "  Core DB backup complete: ${CORE_BACKUP} ($(du -h "${CORE_BACKUP}" | cut -f1))"
else
    echo "  Notice: Container ${CORE_CONTAINER} not running (expected in prod before Core release)."
fi

# 3. Persistent Object and Vector Storage Backup
STORAGE_BACKUP="${BACKUP_DIR}/weirwise_${ENV_TYPE}_storage_${TIMESTAMP}.tar.gz"
UPLOADS_VOL="weirwise_${ENV_TYPE}_uploads"
CORE_STORAGE_VOL="weirwise_${ENV_TYPE}_core_storage"

if [ "$INCLUDE_STORAGE" = true ]; then
    echo "[3/3] Archiving persistent storage volumes..."
    
    # Check if volumes exist
    VOL_ARGS=""
    if docker volume inspect "${UPLOADS_VOL}" >/dev/null 2>&1; then
        VOL_ARGS="${VOL_ARGS} -v ${UPLOADS_VOL}:/data/uploads:ro"
    fi
    if docker volume inspect "${CORE_STORAGE_VOL}" >/dev/null 2>&1; then
        VOL_ARGS="${VOL_ARGS} -v ${CORE_STORAGE_VOL}:/data/core_storage:ro"
    fi
    
    if [ -n "$VOL_ARGS" ]; then
        docker run --rm ${VOL_ARGS} -v "${BACKUP_DIR}:/backup" --user "$(id -u):$(id -g)" alpine tar -czf "/backup/weirwise_${ENV_TYPE}_storage_${TIMESTAMP}.tar.gz" -C /data .
        
        # Verify tar integrity
        tar -tzf "${STORAGE_BACKUP}" >/dev/null
        chmod 600 "${STORAGE_BACKUP}"
        BACKUP_FILES+=("${STORAGE_BACKUP}")
        echo "  Storage archive complete: ${STORAGE_BACKUP} ($(du -h "${STORAGE_BACKUP}" | cut -f1))"
    else
        echo "  No storage volumes found to archive."
    fi
else
    echo "[3/3] Storage archiving skipped (--no-storage)."
fi

# 4. Generate SHA256 Checksum Manifest
CHECKSUM_FILE="${BACKUP_DIR}/weirwise_${ENV_TYPE}_manifest_${TIMESTAMP}.sha256"
if [ ${#BACKUP_FILES[@]} -gt 0 ]; then
    sha256sum "${BACKUP_FILES[@]}" > "${CHECKSUM_FILE}"
    chmod 600 "${CHECKSUM_FILE}"
    echo "Checksum manifest generated: ${CHECKSUM_FILE}"
fi

# 5. Retention Management: Remove backups older than 14 days
echo "Applying 14-day retention policy..."
find "${BACKUP_DIR}" -type f -name "weirwise_${ENV_TYPE}_*" -mtime +14 -delete || true

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# 6. Record Monitoring Status
cat <<EOF > "${STATUS_FILE}"
{
  "environment": "${ENV_TYPE}",
  "status": "success",
  "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "duration_seconds": ${DURATION},
  "files": [
$(printf '    "%s",\n' "${BACKUP_FILES[@]}" | sed '$ s/,$//')
  ],
  "manifest": "${CHECKSUM_FILE}"
}
EOF
chmod 644 "${STATUS_FILE}"

echo "=================================================="
echo "Backup COMPLETED successfully in ${DURATION}s."
echo "Status recorded in: ${STATUS_FILE}"
echo "=================================================="
