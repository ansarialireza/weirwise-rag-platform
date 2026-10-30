#!/usr/bin/env bash
set -euo pipefail

# Weirwise Root Host Initializer (Least-Privilege Security Model)
# To be reviewed and executed by root on pts/0

echo "========================================================"
echo "Initializing Weirwise Scoped Deployment Environment"
echo "========================================================"

# 1. Create directory hierarchy under /srv/weirwise
mkdir -p /srv/weirwise/dev \
         /srv/weirwise/prod \
         /srv/weirwise/shared/backups \
         /srv/weirwise/shared/deployment-logs
chown -R agyops:agyops /srv/weirwise
chmod 0750 /srv/weirwise

# 2. Install root-owned, immutable deployment scripts
cp /home/agyops/weirwise-rag-platform/ops/bin/weirwise-* /usr/local/bin/
chown root:root /usr/local/bin/weirwise-*
chmod 0755 /usr/local/bin/weirwise-*

# 3. Install strictly scoped sudoers rule
cp /home/agyops/weirwise-rag-platform/ops/sudoers/weirwise-deploy /etc/sudoers.d/weirwise-deploy
chown root:root /etc/sudoers.d/weirwise-deploy
chmod 0440 /etc/sudoers.d/weirwise-deploy

# 4. Validate sudoers syntax
visudo -c -f /etc/sudoers.d/weirwise-deploy

echo "========================================================"
echo "Host setup complete and sudoers verified successfully!"
echo "========================================================"
