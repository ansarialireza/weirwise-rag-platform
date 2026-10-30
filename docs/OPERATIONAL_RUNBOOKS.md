# Weirwise Production Operational Runbooks

This document provides incident response procedures, diagnostics, remediations, and verification commands for the Weirwise Production and Development environments.

---

## 1. Backend Outage Runbook

### Alert / Symptoms
- Monitoring alert: `Endpoint prod_backend_live returned 000 or 5xx`
- Nginx logs: `502 Bad Gateway` on `weirwise.com/api/*`

### Diagnostic Commands
```bash
# 1. Check container state
docker ps -a -f name=weirwise-prod-backend

# 2. Inspect recent logs
docker logs --tail 100 weirwise-prod-backend

# 3. Test direct local probe
curl -v http://127.0.0.1:8000/health/live
```

### Remediation Steps
```bash
# If container stopped or stuck, restart:
docker restart weirwise-prod-backend

# If startup fails due to dependency health, check database and Redis:
docker inspect weirwise-prod-db --format '{{.State.Health.Status}}'
docker inspect weirwise-prod-redis --format '{{.State.Health.Status}}'
```

### Verification
```bash
curl -s http://127.0.0.1:8000/health/live
# Expected: {"status":"alive","version":"0.1.0","environment":"prod"}

curl -s http://127.0.0.1:8000/health/ready
# Expected: {"status":"ready","database":"connected","core_gateway":"ready"}
```

---

## 2. Frontend Outage Runbook

### Alert / Symptoms
- Monitoring alert: `Endpoint prod_frontend returned 000 or 502`
- User reports blank screen or 502 Bad Gateway on `https://weirwise.com`

### Diagnostic Commands
```bash
docker ps -a -f name=weirwise-prod-frontend
docker logs --tail 50 weirwise-prod-frontend
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

### Remediation Steps
```bash
# Restart frontend container
docker restart weirwise-prod-frontend

# If upstream resolution in Nginx failed, reload Nginx DNS cache:
docker exec global-nginx nginx -s reload
```

### Verification
```bash
curl -I -s https://weirwise.com/
# Expected: HTTP/2 200 OK
```

---

## 3. Core Microservice Outage Runbook

### Alert / Symptoms
- Platform readiness probe returns `"core_gateway":"unavailable"` or `"unreachable"`
- Knowledge base vector indexing or chat retrieval operations fail

### Diagnostic Commands
```bash
docker ps -a -f name=weirwise-prod-core
docker logs --tail 100 weirwise-prod-core
docker exec weirwise-prod-core curl -s http://localhost:8000/health/ready
```

### Remediation Steps
```bash
# 1. Check Core database status
docker inspect weirwise-prod-core-db --format '{{.State.Health.Status}}'

# 2. Restart Core service
docker restart weirwise-prod-core

# 3. Check API key validity
docker exec weirwise-prod-core python -m server.app.cli admin list-tenants
```

### Verification
```bash
docker exec weirwise-prod-core curl -s http://localhost:8000/health/ready
# Expected: {"status":"ready","database":"healthy"}
```

---

## 4. Platform Database (PostgreSQL) Failure Runbook

### Alert / Symptoms
- Backend logs show `asyncpg.exceptions.CannotConnectNowError` or connection refused
- Backend `/health/ready` reports `"database":"unhealthy"`

### Diagnostic Commands
```bash
docker ps -a -f name=weirwise-prod-db
docker logs --tail 100 weirwise-prod-db
docker exec weirwise-prod-db pg_isready -U weirwise_prod -d weirwise_prod_db
```

### Remediation Steps
```bash
# If container exited, restart:
docker restart weirwise-prod-db

# Check disk space before restart:
df -h /

# Verify database connection limits
docker exec weirwise-prod-db psql -U weirwise_prod -d weirwise_prod_db -c "SELECT count(*) FROM pg_stat_activity;"
```

### Verification
```bash
docker exec weirwise-prod-db psql -U weirwise_prod -d weirwise_prod_db -c "SELECT 1;"
# Expected: 1
```

---

## 5. Vector Database (pgvector) Failure Runbook

### Alert / Symptoms
- Vector similarity search returns 500
- Core logs show pgvector extension error or vector index corruption

### Diagnostic Commands
```bash
docker ps -a -f name=weirwise-prod-core-db
docker logs --tail 100 weirwise-prod-core-db
docker exec weirwise-prod-core-db psql -U weirwise_core_prod -d weirwise_core_prod_db -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
```

### Remediation Steps
```bash
# 1. Re-enable extension if dropped:
docker exec weirwise-prod-core-db psql -U weirwise_core_prod -d weirwise_core_prod_db -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 2. If index corrupted, re-index chunks:
docker exec weirwise-prod-core-db psql -U weirwise_core_prod -d weirwise_core_prod_db -c "REINDEX TABLE document_chunks;"
```

### Verification
```bash
docker exec weirwise-prod-core-db psql -U weirwise_core_prod -d weirwise_core_prod_db -c "SELECT count(*) FROM document_chunks;"
```

---

## 6. Redis Failure Runbook

### Alert / Symptoms
- Background tasks, token revocations, or rate limits failing
- Platform readiness reports `"redis":"unhealthy"`

### Diagnostic Commands
```bash
docker ps -a -f name=weirwise-prod-redis
docker exec weirwise-prod-redis redis-cli ping
```

### Remediation Steps
```bash
docker restart weirwise-prod-redis
```

### Verification
```bash
docker exec weirwise-prod-redis redis-cli ping
# Expected: PONG
```

---

## 7. Persistent Object & Vector Storage Failure Runbook

### Alert / Symptoms
- Document upload returns 500 with `PermissionError` or `No space left on device`

### Diagnostic Commands
```bash
docker run --rm -v weirwise_prod_uploads:/uploads alpine ls -la /uploads
df -h /
```

### Remediation Steps
```bash
# Fix ownership to non-root user weirwise (UID 10001)
docker run --rm -v weirwise_prod_uploads:/uploads alpine chown -R 10001:10001 /uploads
docker run --rm -v weirwise_prod_core_storage:/storage alpine chown -R 10001:10001 /storage
```

---

## 8. Host Disk Space Exhaustion Runbook

### Alert / Symptoms
- Monitoring alert: `Root filesystem disk usage is at XX%` (Threshold: 85%)

### Diagnostic Commands
```bash
df -h /
docker system df
du -sh /srv/weirwise/shared/backups/*
```

### Remediation Steps
```bash
# 1. Clean old dangling build images safely (never prune volumes!)
docker image prune -f

# 2. Purge backups older than 14 days
find /srv/weirwise/shared/backups -type f -mtime +14 -delete

# 3. Truncate oversized docker container json logs if unrotated
truncate -s 0 /var/lib/docker/containers/*/*-json.log 2>/dev/null || true
```

---

## 9. Failed Deployment Runbook

### Alert / Symptoms
- GitHub Actions deployment job failed
- Post-deployment health verification timed out

### Diagnostic Commands
```bash
cat /srv/weirwise/shared/deployment-state/prod_current_sha
cat /srv/weirwise/shared/deployment-state/prod_previous_sha
tail -n 100 /srv/weirwise/shared/deployment-logs/deploy_prod_*.log
```

### Remediation Steps
```bash
# Execute automated atomic rollback
cd /srv/weirwise/prod
bash ./scripts/rollback.sh --env prod
```

### Verification
```bash
curl -s http://127.0.0.1:8000/health/ready
# Expected: 200 OK
```

---

## 10. Failed Schema Migration Runbook

### Alert / Symptoms
- Alembic migration throws `OperationalError` or lock timeout
- Deployment halts during `alembic upgrade head`

### Diagnostic Commands
```bash
docker exec weirwise-prod-db psql -U weirwise_prod -d weirwise_prod_db -c "SELECT * FROM alembic_version;"
```

### Remediation Steps
```bash
# 1. Inspect migration lock in postgres
docker exec weirwise-prod-db psql -U weirwise_prod -d weirwise_prod_db -c "SELECT pid, query, state FROM pg_stat_activity WHERE state != 'idle';"

# 2. If migration failed halfway, restore pre-migration backup created automatically in Step 6 of deploy:
bash ./scripts/restore.sh --env prod --force-prod-restore
```

---

## 11. Credential Compromise & Secret Rotation Runbook

### Trigger
- Secret leak detected or periodic key rotation scheduled

### Procedure
1. Generate new 32-character minimum secret keys:
   ```bash
   openssl rand -hex 32
   ```
2. Update `.env.prod` with restrictive permissions (`chmod 600 .env.prod`).
3. Re-encrypt stored provider API keys using the vault service if `SECRET_KEY` was rotated.
4. Restart backend and core containers:
   ```bash
   cd /srv/weirwise/prod
   docker compose -f docker-compose.prod.yml -p prod up -d prod-backend prod-core
   ```
5. Rotate GitHub Repository secrets (`DEPLOY_SSH_KEY`) via `gh secret set`.

---

## 12. Backup Failure & Alert Escalation Runbook

### Alert / Symptoms
- Monitoring alert: `Latest backup is XX hours old (> 26h threshold)`

### Diagnostic Commands
```bash
cat /srv/weirwise/shared/monitoring/backup_status_prod.json
tail -n 50 /srv/weirwise/shared/backups/backup_cron_prod.log
```

### Remediation Steps
```bash
# Manually execute backup with full verbosity:
/srv/weirwise/dev/scripts/backup.sh --env prod

# Check exit code and manifest:
echo $?
ls -l /srv/weirwise/shared/backups/*_manifest_*.sha256 | tail -n 1
```

---

## 13. Disaster Recovery & Isolated Restore Runbook

### Purpose
Restore the complete platform state to a new VPS or verified isolated testing environment.

### Procedure
```bash
# 1. Run isolated non-destructive restore verification:
/srv/weirwise/dev/scripts/restore.sh --isolated-test --env prod

# 2. For live full recovery onto a new host:
# a. Provision VPS with Docker & Nginx
# b. Clone repository to /srv/weirwise/prod
# c. Transfer backup archive from off-host storage to /srv/weirwise/shared/backups/
# d. Run live restore:
/srv/weirwise/dev/scripts/restore.sh --env prod --force-prod-restore
```

---

## 14. Production Rollback Runbook

### Purpose
Immediately revert application and container versions to the prior known-good deployment.

### Procedure
```bash
cd /srv/weirwise/prod
# Option A: Fast container and commit rollback
bash ./scripts/rollback.sh --env prod

# Option B: Rollback including database state restore
bash ./scripts/rollback.sh --env prod --restore-db
```

### Expected Output
```text
[Timestamp] Initiating ROLLBACK for environment: prod...
Reverting repository to previous commit: <PREV_SHA>...
Rebuilding and restarting previous service containers...
Rolled-back backend /health/live status: 200
[Timestamp] Rollback completed for environment: prod.
```
