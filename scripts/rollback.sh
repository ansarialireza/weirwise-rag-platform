#!/usr/bin/env bash
set -euo pipefail

# Weirwise Automated Rollback Script
# Usage: ./scripts/rollback.sh [--env dev|prod] [--restore-db]

ENV_TYPE="dev"
RESTORE_DB=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --env|-e)
            ENV_TYPE="$2"
            shift 2
            ;;
        --restore-db)
            RESTORE_DB=true
            shift
            ;;
        *)
            ENV_TYPE="$1"
            shift
            ;;
    esac
done

COMPOSE_FILE="docker-compose.${ENV_TYPE}.yml"
BACKUP_DIR="/srv/weirwise/shared/backups"

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Initiating ROLLBACK for environment: ${ENV_TYPE}..."

# 1. Restart existing stable containers if images are tagged or present
if docker ps -a -q -f name="weirwise-${ENV_TYPE}-backend" | grep -q .; then
    echo "Restarting previous stable service state..."
    docker compose -f "${COMPOSE_FILE}" restart backend frontend || true
fi

# 2. Database restore if requested and backup available
if [ "$RESTORE_DB" = true ]; then
    LATEST_BACKUP=$(find "${BACKUP_DIR}" -type f -name "weirwise_${ENV_TYPE}_db_*.sql.gz" 2>/dev/null | sort -r | head -n1)
    if [ -n "$LATEST_BACKUP" ] && [ -f "$LATEST_BACKUP" ]; then
        echo "Restoring database from ${LATEST_BACKUP}..."
        CONTAINER_NAME="weirwise-${ENV_TYPE}-db"
        DB_USER="weirwise_${ENV_TYPE}"
        DB_NAME="weirwise_${ENV_TYPE}_db"
        gunzip -c "${LATEST_BACKUP}" | docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}"
        echo "Database restored successfully."
    else
        echo "Warning: No database backup file found to restore."
    fi
fi

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Rollback completed for environment: ${ENV_TYPE}."
