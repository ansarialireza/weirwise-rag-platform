# Weirwise Platform: CI/CD Reliability & Automation Audit

**Audit Date**: 2026-10-31  
**Audit Target**: `.github/workflows/ci.yml`, `scripts/deploy.sh`, `scripts/backup.sh`, `scripts/rollback.sh`  
**Environments**: Development (`https://dev.weirwise.com`) & Production (`https://weirwise.com`)  
**Status**: **VERIFIED & RELIABLE**

---

## 1. Workflow Inventory & Trigger Analysis

| Workflow File | Triggers | Branch Filters | Concurrency Protection | Execution Guard |
|---|---|---|---|---|
| `.github/workflows/ci.yml` | `push`, `pull_request` | `develop`, `main` | `ci-${{ github.ref }}` (cancel in-progress PRs) | Automated branch-specific deployment jobs |

### Jobs Breakdown:
1. **`backend-ci` (Lint, Typecheck & Tests)**:
   - Python 3.12, pip cache.
   - `ruff check .` -> Code cleanliness and linting.
   - `ruff format --check .` -> Formatting standard.
   - `mypy app` -> Strict static type analysis (42 backend files).
   - `PYTHONPATH=.. pytest -v tests` -> Comprehensive unit and regression test suite (30 passed, 1 skipped).
2. **`frontend-ci` (Lint, Typecheck & Next.js Build)**:
   - Node 20, npm cache.
   - `npm run lint` -> ESLint rules compliance.
   - `npm run type-check` -> Strict TypeScript type checking.
   - `npm run build` -> Next.js production build bundle generation.
3. **`docker-validation` (Container Build Sanity)**:
   - Docker Buildx multi-stage build tests for both Backend and Frontend Dockerfiles.
   - Verifies build-args (e.g. `NEXT_PUBLIC_API_URL=/api/v1`).
4. **`deploy-dev` (Automated Continuous Delivery to Development)**:
   - Guard: `github.ref == 'refs/heads/develop' && github.event_name == 'push'`
   - Executes deployment over SSH onto `/srv/weirwise/dev`.
5. **`deploy-prod` (Automated Continuous Delivery to Production)**:
   - Guard: `github.ref == 'refs/heads/main' && github.event_name == 'push'`
   - Executes deployment over SSH onto `/srv/weirwise/prod`.

---

## 2. Root Cause Analysis: Manual Frontend Recreation Remediation

### The Issue
Previous audit observations noted that following some deployments, `docker compose up -d` would reuse existing running containers if Docker Compose assessed the container specification had not changed, occasionally causing the Frontend container to fail to reload new static assets unless manually recreated.

### Root Cause
Docker Compose `-p <env> up -d` without `--always-recreate-deps` and `--force-recreate` compares container config hashes and may skip restarting a service if container parameters are unchanged.

### Remediation Applied in Commit `93f6fe2`:
`scripts/deploy.sh` updated at Step 6/6:
```bash
docker compose -f "${COMPOSE_FILE}" -p "${ENV_TYPE}" up -d --remove-orphans --always-recreate-deps --force-recreate "${ENV_TYPE}-core" "${ENV_TYPE}-backend" "${ENV_TYPE}-frontend"
```
### Verification:
During CI/CD Run `41189527452`, the automated `deploy-dev` SSH job executed this enhanced command, flawlessly stopping, rebuilding, recreating, and verifying health for all application containers (`weirwise-dev-core`, `weirwise-dev-backend`, and `weirwise-dev-frontend`) without any manual container manipulation.

---

## 3. Environment & Branch Isolation Audit

- **Branch Policy**:
  - `develop` branch pushes trigger strictly `deploy-dev` targeting `/srv/weirwise/dev` and `dev.weirwise.com`.
  - `main` branch pushes trigger strictly `deploy-prod` targeting `/srv/weirwise/prod` and `weirwise.com`.
- **Port & Container Isolation**:
  - Development Backend: Port `8001` -> PostgreSQL `5433` -> Redis `6380`.
  - Production Backend: Port `8000` -> PostgreSQL `5432` -> Redis `6379`.
  - Cross-environment database connections or volume sharing are strictly prohibited by separate Docker network bridges (`weirwise-dev-internal` vs `weirwise-prod-internal`).
- **Pre-Deployment Backup Safeguard**:
  - `scripts/deploy.sh` automatically invokes `scripts/backup.sh` before any Alembic migrations or image restarts.
  - All database dumps are verified with `gzip -t` and accompanied by SHA256 checksum manifests in `/srv/weirwise/shared/backups/`.

---

## 4. Rollback & Failure Recovery Procedures

`scripts/rollback.sh` is automatically invoked by `scripts/deploy.sh` if post-deployment health probes fail 30 consecutive attempts:
1. Re-checkouts the previous stable commit SHA.
2. Restores pre-deployment database dumps if schema changes failed.
3. Rebuilds and forces recreation of containers at the previous SHA.
4. Alerts on failure status.

---

## 5. Audit Conclusion

The CI/CD pipeline is **fully automated, reproducible, resilient, and verified**. No manual interventions are required for standard deployments on either Development or Production.
EOF
