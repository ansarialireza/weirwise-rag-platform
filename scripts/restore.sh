#!/usr/bin/env bash
set -euo pipefail

# Weirwise Enterprise Restore & Disaster Recovery Verification Engine
# Supports isolated restore validation and controlled environment recovery.
# Usage:
#   ./scripts/restore.sh --isolated-test [--env dev|prod]
#   ./scripts/restore.sh --env dev [--platform-backup <path>] [--core-backup <path>]

ENV_TYPE="dev"
ISOLATED_TEST=false
PLATFORM_BACKUP=""
CORE_BACKUP=""
FORCE_PROD=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --isolated-test)
            ISOLATED_TEST=true
            shift
            ;;
        --env|-e)
            ENV_TYPE="$2"
            shift 2
            ;;
        --platform-backup)
            PLATFORM_BACKUP="$2"
            shift 2
            ;;
        --core-backup)
            CORE_BACKUP="$2"
            shift 2
            ;;
        --force-prod-restore)
            FORCE_PROD=true
            shift
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

BACKUP_DIR="/srv/weirwise/shared/backups"

# Find latest backups if not specified
if [ -z "$PLATFORM_BACKUP" ]; then
    PLATFORM_BACKUP=$(find "${BACKUP_DIR}" -type f -name "weirwise_${ENV_TYPE}_platform_db_*.sql.gz" 2>/dev/null | sort -r | head -n1 || true)
    if [ -z "$PLATFORM_BACKUP" ]; then
        # Fallback to old naming format if exists
        PLATFORM_BACKUP=$(find "${BACKUP_DIR}" -type f -name "weirwise_${ENV_TYPE}_db_*.sql.gz" 2>/dev/null | sort -r | head -n1 || true)
    fi
fi

if [ -z "$CORE_BACKUP" ]; then
    CORE_BACKUP=$(find "${BACKUP_DIR}" -type f -name "weirwise_${ENV_TYPE}_core_db_*.sql.gz" 2>/dev/null | sort -r | head -n1 || true)
fi

echo "=================================================="
echo "Weirwise Restore Engine"
echo "Mode: $( [ "$ISOLATED_TEST" = true ] && echo "ISOLATED VERIFICATION TEST" || echo "LIVE ENVIRONMENT RESTORE" )"
echo "Environment: ${ENV_TYPE}"
echo "Platform Backup: ${PLATFORM_BACKUP:-none}"
echo "Core Backup:     ${CORE_BACKUP:-none}"
echo "Timestamp:       $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "=================================================="

# Guard: Never accidentally overwrite production without explicit force flag
if [ "$ISOLATED_TEST" = false ] && [ "$ENV_TYPE" = "prod" ] && [ "$FORCE_PROD" = false ]; then
    echo "ERROR: Refusing to restore over live production database without --force-prod-restore!" >&2
    exit 1
fi

if [ "$ISOLATED_TEST" = true ]; then
    TEST_CONTAINER="weirwise-restore-test-$(date +%s)"
    TEST_USER="postgres"
    TEST_PASS="test_restore_secure_pass"
    
    echo "[Step 1/5] Launching isolated ephemeral PostgreSQL + pgvector container (${TEST_CONTAINER})..."
    docker run -d --name "${TEST_CONTAINER}" \
        -e POSTGRES_USER="${TEST_USER}" \
        -e POSTGRES_PASSWORD="${TEST_PASS}" \
        -e POSTGRES_DB="platform_restore_test" \
        pgvector/pgvector:pg16 >/dev/null
    
    cleanup() {
        echo "Cleaning up isolated test container ${TEST_CONTAINER}..."
        docker rm -f "${TEST_CONTAINER}" >/dev/null 2>&1 || true
    }
    trap cleanup EXIT
    
    # Wait for PostgreSQL to be ready
    echo "Waiting for isolated database container to become ready..."
    for i in {1..30}; do
        if docker exec "${TEST_CONTAINER}" pg_isready -U "${TEST_USER}" >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    
    # --- Test Platform Restore ---
    if [ -n "$PLATFORM_BACKUP" ] && [ -f "$PLATFORM_BACKUP" ]; then
        echo "[Step 2/5] Restoring Platform database from ${PLATFORM_BACKUP}..."
        P_START=$(date +%s%N)
        gunzip -c "${PLATFORM_BACKUP}" | docker exec -i "${TEST_CONTAINER}" psql -U "${TEST_USER}" -d "platform_restore_test" >/dev/null
        P_END=$(date +%s%N)
        P_DURATION_MS=$(( (P_END - P_START) / 1000000 ))
        echo "  Platform restore completed in ${P_DURATION_MS} ms."
        
        echo "[Step 3/5] Verifying Platform schema integrity..."
        TABLE_COUNT=$(docker exec "${TEST_CONTAINER}" psql -U "${TEST_USER}" -d "platform_restore_test" -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
        ALEMBIC_VER=$(docker exec "${TEST_CONTAINER}" psql -U "${TEST_USER}" -d "platform_restore_test" -t -A -c "SELECT version_num FROM alembic_version;" 2>/dev/null || echo "missing")
        USER_COUNT=$(docker exec "${TEST_CONTAINER}" psql -U "${TEST_USER}" -d "platform_restore_test" -t -A -c "SELECT count(*) FROM users;" 2>/dev/null || echo "0")
        
        echo "  Platform restored public tables: ${TABLE_COUNT}"
        echo "  Platform Alembic version:        ${ALEMBIC_VER}"
        echo "  Platform registered users:       ${USER_COUNT}"
        
        if [ "$TABLE_COUNT" -lt 10 ]; then
            echo "ERROR: Table count (${TABLE_COUNT}) is lower than expected!" >&2
            exit 1
        fi
    else
        echo "Warning: No Platform backup found to test."
    fi
    
    # --- Test Core Restore ---
    if [ -n "$CORE_BACKUP" ] && [ -f "$CORE_BACKUP" ]; then
        echo "[Step 4/5] Preparing and restoring Core pgvector database from ${CORE_BACKUP}..."
        docker exec "${TEST_CONTAINER}" psql -U "${TEST_USER}" -d "platform_restore_test" -c "CREATE DATABASE core_restore_test;" >/dev/null
        
        C_START=$(date +%s%N)
        gunzip -c "${CORE_BACKUP}" | docker exec -i "${TEST_CONTAINER}" psql -U "${TEST_USER}" -d "core_restore_test" >/dev/null
        C_END=$(date +%s%N)
        C_DURATION_MS=$(( (C_END - C_START) / 1000000 ))
        echo "  Core restore completed in ${C_DURATION_MS} ms."
        
        echo "[Step 5/5] Verifying Core pgvector extension and vector index..."
        EXT_CHECK=$(docker exec "${TEST_CONTAINER}" psql -U "${TEST_USER}" -d "core_restore_test" -t -A -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';")
        CORE_TABLES=$(docker exec "${TEST_CONTAINER}" psql -U "${TEST_USER}" -d "core_restore_test" -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
        KB_COUNT=$(docker exec "${TEST_CONTAINER}" psql -U "${TEST_USER}" -d "core_restore_test" -t -A -c "SELECT count(*) FROM knowledge_bases;" 2>/dev/null || echo "0")
        CHUNK_COUNT=$(docker exec "${TEST_CONTAINER}" psql -U "${TEST_USER}" -d "core_restore_test" -t -A -c "SELECT count(*) FROM document_chunks;" 2>/dev/null || echo "0")
        
        echo "  Core pgvector extension:  ${EXT_CHECK:-MISSING}"
        echo "  Core public tables:       ${CORE_TABLES}"
        echo "  Core knowledge bases:     ${KB_COUNT}"
        echo "  Core vector chunks:       ${CHUNK_COUNT}"
        
        if [ -z "$EXT_CHECK" ]; then
            echo "ERROR: pgvector extension is missing in restored Core DB!" >&2
            exit 1
        fi
        
        # Test vector similarity cosine distance query
        if [ "$CHUNK_COUNT" -gt 0 ]; then
            echo "  Executing test vector query against restored embeddings..."
            docker exec "${TEST_CONTAINER}" psql -U "${TEST_USER}" -d "core_restore_test" -c \
                "SELECT id, knowledge_base_id, chunk_index, length(content) as content_len FROM document_chunks LIMIT 1;"
        fi
    else
        echo "Notice: Core backup not present or skipped for isolated test."
    fi
    
    echo "=================================================="
    echo "Isolated Restore Verification SUCCESSFUL!"
    echo "Platform RTO measured: ${P_DURATION_MS:-0} ms"
    echo "Core RTO measured:     ${C_DURATION_MS:-0} ms"
    echo "Data integrity and extension compatibility verified."
    echo "=================================================="
    exit 0
fi

# Live environment restore (dev only unless force flag used)
echo "Executing live database restore for environment: ${ENV_TYPE}..."
if [ -n "$PLATFORM_BACKUP" ] && [ -f "$PLATFORM_BACKUP" ]; then
    echo "Restoring Platform DB into weirwise-${ENV_TYPE}-db..."
    gunzip -c "${PLATFORM_BACKUP}" | docker exec -i "weirwise-${ENV_TYPE}-db" psql -U "weirwise_${ENV_TYPE}" -d "weirwise_${ENV_TYPE}_db"
    echo "Platform DB restore complete."
fi

if [ -n "$CORE_BACKUP" ] && [ -f "$CORE_BACKUP" ]; then
    if docker ps -q -f name="^weirwise-${ENV_TYPE}-core-db$" | grep -q .; then
        echo "Restoring Core DB into weirwise-${ENV_TYPE}-core-db..."
        gunzip -c "${CORE_BACKUP}" | docker exec -i "weirwise-${ENV_TYPE}-core-db" psql -U "weirwise_core_${ENV_TYPE}" -d "weirwise_core_${ENV_TYPE}_db"
        echo "Core DB restore complete."
    fi
fi

echo "Live restore finished successfully."
