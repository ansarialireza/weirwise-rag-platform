#!/usr/bin/env bash
set -euo pipefail

# Weirwise Automated Deployment & Health Verification Script
# Usage: ./scripts/deploy.sh [--env dev|prod] [--sha <commit-sha>]

ENV_TYPE="dev"
TARGET_SHA=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --env|-e)
            ENV_TYPE="$2"
            shift 2
            ;;
        --sha|-s)
            TARGET_SHA="$2"
            shift 2
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

# 1. Host-Level Deployment Concurrency Lock
LOCK_DIR="/srv/weirwise/shared/locks"
mkdir -p "$LOCK_DIR"
LOCK_FILE="${LOCK_DIR}/weirwise-deploy-${ENV_TYPE}.lock"

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    echo "Error: Another deployment for environment '${ENV_TYPE}' is currently in progress." >&2
    echo "Lock file: ${LOCK_FILE}" >&2
    exit 1
fi

COMPOSE_FILE="docker-compose.${ENV_TYPE}.yml"
ENV_FILE=".env.${ENV_TYPE}"
STATE_DIR="/srv/weirwise/shared/deployment-state"
LOG_DIR="/srv/weirwise/shared/deployment-logs"
mkdir -p "$STATE_DIR" "$LOG_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="${LOG_DIR}/deploy_${ENV_TYPE}_${TIMESTAMP}.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=================================================="
echo "Starting Weirwise Deployment: ${ENV_TYPE}"
echo "Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Directory: $(pwd)"
echo "Target SHA: ${TARGET_SHA:-HEAD}"
echo "=================================================="

# 2. Record Pre-Deployment Commit SHA
PREV_SHA=$(git rev-parse HEAD 2>/dev/null || echo "none")
echo "Previous deployment SHA: ${PREV_SHA}"

# 3. Checkout Exact Commit SHA if specified
if [ -n "$TARGET_SHA" ]; then
    echo "Fetching and checking out exact commit SHA: ${TARGET_SHA}..."
    git fetch origin "$TARGET_SHA"
    git checkout -q "$TARGET_SHA"
    CURRENT_SHA=$(git rev-parse HEAD)
    if [ "$CURRENT_SHA" != "$TARGET_SHA" ]; then
        echo "Error: Checked out SHA (${CURRENT_SHA}) does not match target (${TARGET_SHA})!" >&2
        exit 1
    fi
    echo "Verified current checkout matches target SHA: ${CURRENT_SHA}"
else
    CURRENT_SHA="$PREV_SHA"
fi

# 4. Environment Configuration Check
if [ ! -f "$ENV_FILE" ]; then
    if [ -f "${ENV_FILE}.example" ]; then
        echo "Notice: ${ENV_FILE} not found. Copying from ${ENV_FILE}.example..."
        cp "${ENV_FILE}.example" "$ENV_FILE"
    else
        echo "Error: Neither ${ENV_FILE} nor ${ENV_FILE}.example found!" >&2
        exit 1
    fi
fi

# Ensure WEIRWISE_CORE_BASE_URL points to internal core container in .env file
if grep -q "WEIRWISE_CORE_BASE_URL=http://localhost" "$ENV_FILE"; then
    echo "Updating WEIRWISE_CORE_BASE_URL to internal container hostname in ${ENV_FILE}..."
    sed -i "s|WEIRWISE_CORE_BASE_URL=http://localhost:[0-9]*|WEIRWISE_CORE_BASE_URL=http://${ENV_TYPE}-core:8000|g" "$ENV_FILE"
fi

# 5. Core Repository Integration
CORE_DIR="$(pwd)/core"
CORE_BRANCH=$([ "$ENV_TYPE" = "prod" ] && echo "main" || echo "develop")

if [ ! -d "${CORE_DIR}/.git" ]; then
    echo "Cloning weirwise-rag-core repository into ${CORE_DIR}..."
    git clone https://github.com/ansarialireza/weirwise-rag-core.git "${CORE_DIR}"
fi

echo "Synchronizing weirwise-rag-core on branch ${CORE_BRANCH}..."
(
    cd "${CORE_DIR}"
    git fetch origin "${CORE_BRANCH}"
    git checkout "${CORE_BRANCH}"
    git reset --hard "origin/${CORE_BRANCH}"
)

# 6. Pre-deployment Database Backup
echo "[Step 1/6] Creating pre-deployment database backup..."
if [ -f "./scripts/backup.sh" ]; then
    bash ./scripts/backup.sh --env "${ENV_TYPE}" || echo "Notice: Pre-deployment backup skipped or non-critical."
fi

# 7. Build Docker Images
echo "[Step 2/6] Building Docker container images..."
docker compose -f "${COMPOSE_FILE}" -p "${ENV_TYPE}" build

# 8. Start Database, Redis, and Core-DB
echo "[Step 3/6] Starting persistence services (${ENV_TYPE}-db, ${ENV_TYPE}-redis, ${ENV_TYPE}-core-db)..."
docker compose -f "${COMPOSE_FILE}" -p "${ENV_TYPE}" up -d "${ENV_TYPE}-db" "${ENV_TYPE}-redis" "${ENV_TYPE}-core-db"

echo "Waiting for persistence services to report healthy..."
for i in {1..30}; do
    DB_STATUS=$(docker inspect --format='{{json .State.Health.Status}}' "weirwise-${ENV_TYPE}-db" 2>/dev/null || echo "\"starting\"")
    CORE_DB_STATUS=$(docker inspect --format='{{json .State.Health.Status}}' "weirwise-${ENV_TYPE}-core-db" 2>/dev/null || echo "\"starting\"")
    
    if [ "$DB_STATUS" = "\"healthy\"" ] && [ "$CORE_DB_STATUS" = "\"healthy\"" ]; then
        echo "Persistence services are healthy."
        break
    fi
    echo "Waiting for databases... ($i/30)"
    sleep 2
done

# Ensure volume permissions for non-root users (UID 10001) before running migrations
docker run --rm -v "weirwise_${ENV_TYPE}_uploads:/uploads" alpine chown -R 10001:10001 /uploads 2>/dev/null || true
docker run --rm -v "weirwise_${ENV_TYPE}_core_storage:/storage" alpine chown -R 10001:10001 /storage 2>/dev/null || true

# 9. Execute Database Schema Migrations
echo "[Step 4/6] Running schema migrations..."
echo "Applying Platform backend migrations..."
docker compose -f "${COMPOSE_FILE}" -p "${ENV_TYPE}" run --rm "${ENV_TYPE}-backend" alembic -c /app/backend/alembic.ini upgrade head

echo "Applying Core database migrations..."
docker compose -f "${COMPOSE_FILE}" -p "${ENV_TYPE}" run --rm "${ENV_TYPE}-core" alembic -c /app/server/alembic.ini upgrade head || true

# 10. Seed/Register Core API Key for Platform
echo "[Step 5/6] Registering Platform Core API key in Core DB..."
CORE_API_KEY=$(grep '^WEIRWISE_CORE_API_KEY=' "${ENV_FILE}" | cut -d '=' -f2- | tr -d '"\r\n' || true)
if [ -n "$CORE_API_KEY" ]; then
    docker compose -f "${COMPOSE_FILE}" -p "${ENV_TYPE}" run --rm "${ENV_TYPE}-core" \
        python -m server.app.cli admin create-tenant \
        --name "Weirwise-${ENV_TYPE}" \
        --key-name "platform-${ENV_TYPE}" \
        --key "${CORE_API_KEY}" || echo "Warning: Tenant key provisioning exited with warning."
fi

# 11. Start Application Containers
echo "[Step 6/6] Launching application services (${ENV_TYPE}-core, ${ENV_TYPE}-backend, ${ENV_TYPE}-frontend)..."

# Ensure volume permissions for non-root users (UID 10001)
docker run --rm -v "weirwise_${ENV_TYPE}_uploads:/uploads" alpine chown -R 10001:10001 /uploads 2>/dev/null || true
docker run --rm -v "weirwise_${ENV_TYPE}_core_storage:/storage" alpine chown -R 10001:10001 /storage 2>/dev/null || true

docker compose -f "${COMPOSE_FILE}" -p "${ENV_TYPE}" up -d --remove-orphans "${ENV_TYPE}-core" "${ENV_TYPE}-backend" "${ENV_TYPE}-frontend"

# 12. Health Checks and Verification
echo "Running post-deployment health verification..."
HEALTH_SUCCESS=false
BACKEND_PORT=$([ "$ENV_TYPE" = "prod" ] && echo "8000" || echo "8001")
FRONTEND_PORT=$([ "$ENV_TYPE" = "prod" ] && echo "3000" || echo "3001")

for i in {1..30}; do
    echo "Health check attempt $i/30..."
    
    LIVE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${BACKEND_PORT}/health/live" 2>/dev/null || echo "000")
    READY_RESP=$(curl -s "http://127.0.0.1:${BACKEND_PORT}/health/ready" 2>/dev/null || echo "{}")
    READY_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${BACKEND_PORT}/health/ready" 2>/dev/null || echo "000")
    FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${FRONTEND_PORT}/" 2>/dev/null || echo "000")

    echo "Backend /health/live: ${LIVE_CODE} | /health/ready: ${READY_CODE} | Frontend: ${FRONTEND_CODE}"
    echo "Readiness response: ${READY_RESP}"

    # Verify that readiness reports healthy database and ready core gateway
    if [ "$LIVE_CODE" = "200" ] && [ "$READY_CODE" = "200" ] && [ "$FRONTEND_CODE" = "200" ]; then
        if echo "$READY_RESP" | grep -q '"core_gateway":"ready"'; then
            echo "Readiness confirmed: Core gateway and Database are ready."
            HEALTH_SUCCESS=true
            break
        fi
    fi
    sleep 3
done

if [ "$HEALTH_SUCCESS" = true ]; then
    echo "=================================================="
    echo "Deployment SUCCESSFUL for ${ENV_TYPE}!"
    echo "Deployed SHA: ${CURRENT_SHA}"
    echo "Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    echo "=================================================="
    
    # Record deployment state
    echo "${PREV_SHA}" > "${STATE_DIR}/${ENV_TYPE}_previous_sha"
    echo "${CURRENT_SHA}" > "${STATE_DIR}/${ENV_TYPE}_current_sha"
    exit 0
else
    echo "=================================================="
    echo "ERROR: Health checks FAILED after deployment!"
    echo "Collecting service diagnostic logs..."
    docker compose -f "${COMPOSE_FILE}" -p "${ENV_TYPE}" logs --tail 30 "${ENV_TYPE}-backend"
    docker compose -f "${COMPOSE_FILE}" -p "${ENV_TYPE}" logs --tail 30 "${ENV_TYPE}-core"
    echo "Triggering automated rollback..."
    echo "=================================================="
    
    if [ -f "./scripts/rollback.sh" ]; then
        bash ./scripts/rollback.sh --env "${ENV_TYPE}" --previous-sha "${PREV_SHA}"
    fi
    exit 1
fi
