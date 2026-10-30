#!/usr/bin/env bash
set -euo pipefail

# Weirwise Database Backup Script
# Usage: ./scripts/backup.sh [--env dev|prod]

ENV_TYPE="${1:-dev}"
if [[ "$ENV_TYPE" == "--env" ]]; then
    ENV_TYPE="${2:-dev}"
fi

BACKUP_DIR="/srv/weirwise/shared/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/weirwise_${ENV_TYPE}_db_${TIMESTAMP}.sql.gz"

CONTAINER_NAME="weirwise-${ENV_TYPE}-db"
DB_USER="weirwise_${ENV_TYPE}"
DB_NAME="weirwise_${ENV_TYPE}_db"

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Starting database backup for environment: ${ENV_TYPE}..."

if ! docker ps -q -f name="^${CONTAINER_NAME}$" | grep -q .; then
    echo "Warning: Database container ${CONTAINER_NAME} is not running. Checking if container exists..."
    if ! docker ps -a -q -f name="^${CONTAINER_NAME}$" | grep -q .; then
        echo "Database container ${CONTAINER_NAME} does not exist yet. Skipping pre-migration backup."
        exit 0
    fi
fi

docker exec -t "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" | gzip > "${BACKUP_FILE}"

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Backup successfully created: ${BACKUP_FILE}"
echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Backup size: $(du -h "${BACKUP_FILE}" | cut -f1)"

# Retention: Remove backups older than 14 days
find "${BACKUP_DIR}" -type f -name "weirwise_${ENV_TYPE}_db_*.sql.gz" -mtime +14 -delete || true
