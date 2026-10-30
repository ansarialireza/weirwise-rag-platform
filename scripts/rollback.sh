#!/usr/bin/env bash
set -euo pipefail

# Weirwise Automated Rollback Script
# Usage: ./scripts/rollback.sh [--env dev|prod] [--previous-sha <sha>] [--restore-db]

ENV_TYPE="dev"
PREV_SHA=""
RESTORE_DB=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --env|-e)
            ENV_TYPE="$2"
            shift 2
            ;;
        --previous-sha|-s)
            PREV_SHA="$2"
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

if [[ "$ENV_TYPE" != "dev" && "$ENV_TYPE" != "prod" ]]; then
    echo "Error: Unknown environment '$ENV_TYPE'. Must be 'dev' or 'prod'." >&2
    exit 1
fi

TARGET_DIR="/srv/weirwise/${ENV_TYPE}"
if [[ -d "$TARGET_DIR" && "$(pwd)" != "$TARGET_DIR" ]]; then
    echo "Switching working directory to ${TARGET_DIR}..."
    cd "$TARGET_DIR"
fi

# Concurrency Lock
LOCK_DIR="/srv/weirwise/shared/locks"
mkdir -p "$LOCK_DIR"
LOCK_FILE="${LOCK_DIR}/weirwise-deploy-${ENV_TYPE}.lock"

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    echo "Error: Another deployment or rollback for environment '${ENV_TYPE}' is currently in progress." >&2
    exit 1
fi

COMPOSE_FILE="docker-compose.${ENV_TYPE}.yml"
BACKUP_DIR="/srv/weirwise/shared/backups"
STATE_DIR="/srv/weirwise/shared/deployment-state"
mkdir -p "$BACKUP_DIR" "$STATE_DIR"

if [ -z "$PREV_SHA" ] && [ -f "${STATE_DIR}/${ENV_TYPE}_previous_sha" ]; then
    PREV_SHA=$(cat "${STATE_DIR}/${ENV_TYPE}_previous_sha" | tr -d '\r\n')
fi

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Initiating ROLLBACK for environment: ${ENV_TYPE}..."
echo "Target previous commit SHA: ${PREV_SHA:-unknown}"

# 1. Revert to previous Git SHA if available
if [ -n "$PREV_SHA" ] && [ "$PREV_SHA" != "none" ]; then
    if git cat-file -e "${PREV_SHA}^{commit}" 2>/dev/null; then
        echo "Reverting repository to previous commit: ${PREV_SHA}..."
        git checkout -q "${PREV_SHA}"
    else
        echo "Warning: Commit ${PREV_SHA} not found locally. Attempting fetch..."
        git fetch origin "${PREV_SHA}" || true
        git checkout -q "${PREV_SHA}" || echo "Warning: Could not checkout ${PREV_SHA}."
    fi
fi

# 2. Rebuild and restart previous stable containers
echo "Rebuilding and restarting previous service containers..."
docker compose -f "${COMPOSE_FILE}" -p "${ENV_TYPE}" up -d --build --remove-orphans "${ENV_TYPE}-core" "${ENV_TYPE}-backend" "${ENV_TYPE}-frontend"

# 3. Database restore if requested and backup available
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

# 4. Quick verification of rolled back services
BACKEND_PORT=$([ "$ENV_TYPE" = "prod" ] && echo "8000" || echo "8001")
echo "Verifying rolled back backend status on port ${BACKEND_PORT}..."
sleep 5
LIVE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${BACKEND_PORT}/health/live" 2>/dev/null || echo "000")
echo "Rolled-back backend /health/live status: ${LIVE_CODE}"

if [ -n "$PREV_SHA" ] && [ "$PREV_SHA" != "none" ]; then
    echo "${PREV_SHA}" > "${STATE_DIR}/${ENV_TYPE}_current_sha"
fi

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Rollback completed for environment: ${ENV_TYPE}."
