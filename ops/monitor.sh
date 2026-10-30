#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Weirwise Lightweight Production Monitoring & Alerting Daemon
# Evaluates host resources, container states, health probes, databases,
# backup freshness, and TLS certificates without external heavy dependencies.
# ==============================================================================

MONITORING_DIR="/srv/weirwise/shared/monitoring"
BACKUP_DIR="/srv/weirwise/shared/backups"
LOG_FILE="${MONITORING_DIR}/monitor.log"
STATUS_FILE="${MONITORING_DIR}/latest_status.json"
ALERT_FILE="${MONITORING_DIR}/alerts.log"

mkdir -p "$MONITORING_DIR"

TIMESTAMP="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
ALERTS=()

# ------------------------------------------------------------------------------
# 1. Host Resources (CPU, Memory, Disk, Inodes)
# ------------------------------------------------------------------------------
# Disk usage
DISK_INFO=$(df -h / | awk 'NR==2 {print $5, $4}')
DISK_PCT=$(echo "$DISK_INFO" | awk '{print $1}' | tr -d '%')
DISK_AVAIL=$(echo "$DISK_INFO" | awk '{print $2}')

# Inodes
INODE_PCT=$(df -i / | awk 'NR==2 {print $5}' | tr -d '%')

# Memory usage
MEM_INFO=$(free -m | awk 'NR==2 {printf "total:%d,used:%d,avail:%d,pct:%.1f", $2, $3, $7, ($3/$2)*100}')
MEM_PCT=$(echo "$MEM_INFO" | awk -F'pct:' '{print $2}' | cut -d'.' -f1)
MEM_AVAIL=$(echo "$MEM_INFO" | awk -F',' '{print $3}' | cut -d':' -f2)

# CPU load average (1m, 5m, 15m)
LOAD_AVG=$(cat /proc/loadavg | awk '{print $1, $2, $3}')
CPU_1M=$(echo "$LOAD_AVG" | awk '{print $1}')

# Check thresholds
if [ "$DISK_PCT" -ge 85 ]; then
    ALERTS+=("CRITICAL: Root filesystem disk usage is at ${DISK_PCT}% (only ${DISK_AVAIL} available)!")
elif [ "$DISK_PCT" -ge 75 ]; then
    ALERTS+=("WARNING: Root filesystem disk usage is at ${DISK_PCT}%.")
fi

if [ "$INODE_PCT" -ge 85 ]; then
    ALERTS+=("CRITICAL: Inode usage is at ${INODE_PCT}%!")
fi

if [ "$MEM_PCT" -ge 90 ]; then
    ALERTS+=("CRITICAL: Host memory usage is at ${MEM_PCT}% (only ${MEM_AVAIL}MB available)!")
fi

# ------------------------------------------------------------------------------
# 2. Container Health & Restarts
# ------------------------------------------------------------------------------
CRITICAL_CONTAINERS=(
    "weirwise-prod-frontend"
    "weirwise-prod-backend"
    "weirwise-prod-db"
    "weirwise-prod-redis"
    "weirwise-dev-frontend"
    "weirwise-dev-backend"
    "weirwise-dev-core"
    "weirwise-dev-db"
    "weirwise-dev-core-db"
    "weirwise-dev-redis"
    "global-nginx"
)

CONTAINER_METRICS=()
for c in "${CRITICAL_CONTAINERS[@]}"; do
    if ! docker ps -a -q -f name="^${c}$" | grep -q .; then
        ALERTS+=("CRITICAL: Container ${c} does NOT exist!")
        CONTAINER_METRICS+=("{\"name\":\"${c}\",\"status\":\"missing\",\"healthy\":false,\"restarts\":-1}")
        continue
    fi

    RUNNING=$(docker inspect --format='{{.State.Running}}' "${c}" 2>/dev/null || echo "false")
    HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${c}" 2>/dev/null || echo "unknown")
    RESTARTS=$(docker inspect --format='{{.RestartCount}}' "${c}" 2>/dev/null || echo "0")

    IS_OK=true
    if [ "$RUNNING" != "true" ]; then
        ALERTS+=("CRITICAL: Container ${c} is NOT RUNNING!")
        IS_OK=false
    elif [ "$HEALTH" = "unhealthy" ]; then
        ALERTS+=("CRITICAL: Container ${c} is reporting UNHEALTHY!")
        IS_OK=false
    fi

    CONTAINER_METRICS+=("{\"name\":\"${c}\",\"running\":${RUNNING},\"health\":\"${HEALTH}\",\"restarts\":${RESTARTS}}")
done

# ------------------------------------------------------------------------------
# 3. HTTP Endpoint Probes
# ------------------------------------------------------------------------------
PROBES=(
    "dev_backend_live|http://127.0.0.1:8001/health/live|200"
    "dev_backend_ready|http://127.0.0.1:8001/health/ready|200"
    "dev_frontend|http://127.0.0.1:3001/|200"
    "prod_backend_live|http://127.0.0.1:8000/health/live|200"
    "prod_backend_ready|http://127.0.0.1:8000/health/ready|200"
    "prod_frontend|http://127.0.0.1:3000/|200"
)

ENDPOINT_METRICS=()
for probe in "${PROBES[@]}"; do
    NAME=$(echo "$probe" | cut -d'|' -f1)
    URL=$(echo "$probe" | cut -d'|' -f2)
    EXP_CODE=$(echo "$probe" | cut -d'|' -f3)

    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$URL" 2>/dev/null || echo "000")
    if [ "$CODE" != "$EXP_CODE" ]; then
        ALERTS+=("CRITICAL: Endpoint ${NAME} (${URL}) returned status ${CODE} (expected ${EXP_CODE})!")
        ENDPOINT_METRICS+=("{\"probe\":\"${NAME}\",\"status\":\"failed\",\"code\":${CODE}}")
    else
        ENDPOINT_METRICS+=("{\"probe\":\"${NAME}\",\"status\":\"ok\",\"code\":${CODE}}")
    fi
done

# ------------------------------------------------------------------------------
# 4. Backup Freshness & Verification
# ------------------------------------------------------------------------------
LATEST_BACKUP=$(find "${BACKUP_DIR}" -type f -name "weirwise_dev_platform_db_*.sql.gz" 2>/dev/null | sort -r | head -n1 || true)
BACKUP_FRESH=false
BACKUP_AGE_HOURS=999

if [ -n "$LATEST_BACKUP" ] && [ -f "$LATEST_BACKUP" ]; then
    MTIME=$(stat -c %Y "$LATEST_BACKUP")
    NOW=$(date +%s)
    AGE_SEC=$((NOW - MTIME))
    BACKUP_AGE_HOURS=$((AGE_SEC / 3600))
    if [ "$BACKUP_AGE_HOURS" -le 26 ]; then
        BACKUP_FRESH=true
    else
        ALERTS+=("WARNING: Latest backup (${LATEST_BACKUP}) is ${BACKUP_AGE_HOURS} hours old (> 26h threshold)!")
    fi
else
    ALERTS+=("WARNING: No valid backup archive found in ${BACKUP_DIR}!")
fi

# ------------------------------------------------------------------------------
# 5. TLS Certificate Validation
# ------------------------------------------------------------------------------
TLS_VALID=true
TLS_EXPIRES_DAYS=0
CERT_FILE="/opt/rag-platform/infra/nginx/ssl/origin.crt"
if [ -f "$CERT_FILE" ]; then
    CERT_END_DATE=$(openssl x509 -enddate -noout -in "$CERT_FILE" | cut -d'=' -f2)
    CERT_END_SEC=$(date -d "$CERT_END_DATE" +%s)
    NOW_SEC=$(date +%s)
    TLS_EXPIRES_DAYS=$(( (CERT_END_SEC - NOW_SEC) / 86400 ))
    if [ "$TLS_EXPIRES_DAYS" -le 14 ]; then
        ALERTS+=("WARNING: TLS Origin Certificate expires in ${TLS_EXPIRES_DAYS} days!")
        TLS_VALID=false
    fi
fi

# ------------------------------------------------------------------------------
# 6. Generate Metrics Snapshot & Log Alerts
# ------------------------------------------------------------------------------
OVERALL_HEALTH=$([ ${#ALERTS[@]} -eq 0 ] && echo "HEALTHY" || echo "ALERTING")

cat <<EOF > "${STATUS_FILE}"
{
  "timestamp": "${TIMESTAMP}",
  "overall_status": "${OVERALL_HEALTH}",
  "alerts_count": ${#ALERTS[@]},
  "host": {
    "disk_percent": ${DISK_PCT},
    "disk_avail": "${DISK_AVAIL}",
    "inode_percent": ${INODE_PCT},
    "memory_percent": ${MEM_PCT},
    "load_average": "${LOAD_AVG}"
  },
  "containers": [
$(printf '    %s,\n' "${CONTAINER_METRICS[@]}" | sed '$ s/,$//')
  ],
  "endpoints": [
$(printf '    %s,\n' "${ENDPOINT_METRICS[@]}" | sed '$ s/,$//')
  ],
  "backup": {
    "latest": "${LATEST_BACKUP:-none}",
    "age_hours": ${BACKUP_AGE_HOURS},
    "fresh": ${BACKUP_FRESH}
  },
  "tls": {
    "valid": ${TLS_VALID},
    "days_remaining": ${TLS_EXPIRES_DAYS}
  },
  "alerts": [
$(printf '    "%s",\n' "${ALERTS[@]:-}" | sed '/^    "",$/d; $ s/,$//')
  ]
}
EOF
chmod 644 "${STATUS_FILE}"

echo "[${TIMESTAMP}] Health: ${OVERALL_HEALTH} | Disk: ${DISK_PCT}% | Mem: ${MEM_PCT}% | Load: ${CPU_1M} | Alerts: ${#ALERTS[@]}" >> "${LOG_FILE}"

# If alerts detected, log them prominently
if [ ${#ALERTS[@]} -gt 0 ]; then
    echo "==================================================" >> "${ALERT_FILE}"
    echo "[${TIMESTAMP}] SYSTEM ALERTS TRIGGERED (${#ALERTS[@]} issues):" >> "${ALERT_FILE}"
    for alert in "${ALERTS[@]}"; do
        echo "  - ${alert}" >> "${ALERT_FILE}"
        echo "ALERT: ${alert}" >&2
    done
    echo "==================================================" >> "${ALERT_FILE}"
    exit 1
fi

echo "All systems HEALTHY at ${TIMESTAMP}."
exit 0
