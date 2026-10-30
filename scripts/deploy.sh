#!/usr/bin/env bash
set -euo pipefail

# Weirwise Automated Deployment & Health Verification Script
# Usage: ./scripts/deploy.sh [--env dev|prod]

ENV_TYPE="dev"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --env|-e)
            ENV_TYPE="$2"
            shift 2
            ;;
        *)
            ENV_TYPE="$1"
            shift
            ;;
    esac
done

if [[ "$ENV_TYPE" != "dev" && "$ENV_TYPE" != "prod" ]]; then
    echo "Error: Unknown environment '$ENV_TYPE'. Must be 'dev' or 'prod'."
    exit 1
fi

COMPOSE_FILE="docker-compose.${ENV_TYPE}.yml"
ENV_FILE=".env.${ENV_TYPE}"
DEPLOY_DIR="/srv/weirwise/${ENV_TYPE}"
LOG_DIR="/srv/weirwise/shared/deployment-logs"
mkdir -p "$LOG_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="${LOG_DIR}/deploy_${ENV_TYPE}_${TIMESTAMP}.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=================================================="
echo "Starting Weirwise Deployment: ${ENV_TYPE}"
echo "Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Working directory: $(pwd)"
echo "Compose file: ${COMPOSE_FILE}"
echo "=================================================="

# 1. Environment file check
if [ ! -f "$ENV_FILE" ]; then
    if [ -f "${ENV_FILE}.example" ]; then
        echo "Notice: ${ENV_FILE} not found. Copying from ${ENV_FILE}.example..."
        cp "${ENV_FILE}.example" "$ENV_FILE"
    else
        echo "Error: Neither ${ENV_FILE} nor ${ENV_FILE}.example found!"
        exit 1
    fi
fi

# 2. Pre-deployment database backup
echo "[Step 1/5] Creating pre-deployment database backup..."
if [ -f "./scripts/backup.sh" ]; then
    bash ./scripts/backup.sh --env "${ENV_TYPE}" || echo "Pre-deployment backup skipped or failed non-critically."
fi

# 3. Build container images
echo "[Step 2/5] Building Docker images..."
docker compose -f "${COMPOSE_FILE}" build

# 4. Start database & cache services first
echo "[Step 3/5] Starting database and cache services..."
docker compose -f "${COMPOSE_FILE}" up -d "${ENV_TYPE}-db" "${ENV_TYPE}-redis"

# Wait for database health
echo "Waiting for database service to be healthy..."
for i in {1..30}; do
    STATUS=$(docker inspect --format='{{json .State.Health.Status}}' "weirwise-${ENV_TYPE}-db" 2>/dev/null || echo "\"starting\"")
    if [ "$STATUS" = "\"healthy\"" ]; then
        echo "Database is healthy."
        break
    fi
    echo "Waiting for db... ($i/30)"
    sleep 2
done

# 5. Run Alembic Database Migrations
echo "[Step 4/5] Executing database schema migrations..."
docker compose -f "${COMPOSE_FILE}" run --rm "${ENV_TYPE}-backend" alembic -c /app/backend/alembic.ini upgrade head

# 6. Start / Reload backend and frontend application containers
echo "[Step 5/5] Launching backend and frontend containers..."
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans "${ENV_TYPE}-backend" "${ENV_TYPE}-frontend"

# 7. Health checks and verification
echo "Running post-deployment health checks..."
HEALTH_SUCCESS=false
BACKEND_PORT=$([ "$ENV_TYPE" = "prod" ] && echo "8000" || echo "8001")
FRONTEND_PORT=$([ "$ENV_TYPE" = "prod" ] && echo "3000" || echo "3001")

for i in {1..30}; do
    echo "Health check attempt $i/30..."
    
    # Check Backend liveness and readiness
    LIVE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${BACKEND_PORT}/health/live" 2>/dev/null || echo "000")
    READY_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${BACKEND_PORT}/health/ready" 2>/dev/null || echo "000")
    FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${FRONTEND_PORT}/" 2>/dev/null || echo "000")

    echo "Backend /health/live: ${LIVE_CODE} | /health/ready: ${READY_CODE} | Frontend: ${FRONTEND_CODE}"

    if [ "$LIVE_CODE" = "200" ] && [ "$READY_CODE" = "200" ] && [ "$FRONTEND_CODE" = "200" ]; then
        HEALTH_SUCCESS=true
        break
    fi
    sleep 3
done

if [ "$HEALTH_SUCCESS" = true ]; then
    echo "=================================================="
    echo "Deployment SUCCESSFUL for ${ENV_TYPE}!"
    echo "Backend Live: OK (200)"
    echo "Backend Ready: OK (200)"
    echo "Frontend: OK (200)"
    echo "Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    echo "=================================================="
    exit 0
else
    echo "=================================================="
    echo "ERROR: Health checks FAILED after deployment!"
    echo "Triggering automated rollback..."
    echo "=================================================="
    if [ -f "./scripts/rollback.sh" ]; then
        bash ./scripts/rollback.sh --env "${ENV_TYPE}"
    fi
    exit 1
fi
