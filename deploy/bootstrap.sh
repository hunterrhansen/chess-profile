#!/usr/bin/env bash
# Turns a fresh Ubuntu 24.04 machine (the Oracle Cloud free ARM VM) into a Knightly host.
# Safe to run again. Nothing on the machine is the only copy of anything: rebuilding it is
# this script, the .env files and a deploy (docs/deploy.md).
#
#   curl -fsSL https://raw.githubusercontent.com/hunterrhansen/knightly/main/deploy/bootstrap.sh \
#     | sudo DEPLOY_KEY="ssh-ed25519 AAAA... github-actions" bash
#
# DEPLOY_KEY: the public half of the key GitHub Actions deploys with (its secret DEPLOY_SSH_KEY).
set -euo pipefail

REPO_RAW="${REPO_RAW:-https://raw.githubusercontent.com/hunterrhansen/knightly/main}"
ROOT=/opt/knightly
ENVIRONMENTS=(staging production)

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

echo "== Packages: Docker, Compose, rclone (backups off the machine), automatic security updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq docker.io docker-compose-v2 rclone unattended-upgrades curl
systemctl enable --now docker

# Security updates install themselves; the machine reboots at 04:00 when one needs it.
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
cat > /etc/apt/apt.conf.d/51knightly-reboot <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
EOF

# Container logs rotate instead of filling the disk.
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
EOF
systemctl restart docker

echo "== The deploy user: GitHub Actions logs in as it to pull and restart the containers"
if ! id knightly >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash knightly
fi
usermod -aG docker knightly
install -d -m 700 -o knightly -g knightly /home/knightly/.ssh
if [[ -n "${DEPLOY_KEY:-}" ]]; then
  touch /home/knightly/.ssh/authorized_keys
  grep -qxF "$DEPLOY_KEY" /home/knightly/.ssh/authorized_keys || echo "$DEPLOY_KEY" >> /home/knightly/.ssh/authorized_keys
  chown knightly:knightly /home/knightly/.ssh/authorized_keys
  chmod 600 /home/knightly/.ssh/authorized_keys
else
  echo "   (no DEPLOY_KEY given: add the deploy key to /home/knightly/.ssh/authorized_keys later)"
fi

echo "== One folder per environment: compose.yml, .env, data/"
for env in "${ENVIRONMENTS[@]}"; do
  dir="$ROOT/$env"
  install -d -o knightly -g knightly "$dir"
  # uid 1000 is the user inside the image; data/ holds backups on their way out, and sounds.
  install -d -o 1000 -g 1000 "$dir/data"
  curl -fsSL "$REPO_RAW/deploy/compose.yml" -o "$dir/compose.yml"
  if [[ ! -f "$dir/.env" ]]; then
    curl -fsSL "$REPO_RAW/deploy/env.example" -o "$dir/.env"
    sed -i "s/^KNIGHTLY_ENV=.*/KNIGHTLY_ENV=$env/" "$dir/.env"
    [[ "$env" == staging ]] && sed -i "s/^WORKER_CPUS=.*/WORKER_CPUS=0.5/" "$dir/.env"
    echo "   $dir/.env: fill it in (docs/deploy.md)"
  fi
  chown knightly:knightly "$dir/compose.yml" "$dir/.env"
  chmod 600 "$dir/.env"
done

echo "== Nightly backups of production's database, sent off the machine (deploy/backup.sh)"
curl -fsSL "$REPO_RAW/deploy/backup.sh" -o "$ROOT/backup.sh"
chmod 755 "$ROOT/backup.sh"
if [[ ! -f "$ROOT/backup.env" ]]; then
  cat > "$ROOT/backup.env" <<'EOF'
# Where backups go: any S3-compatible bucket (Cloudflare R2 by default). docs/deploy.md.
RCLONE_CONFIG_OFFSITE_TYPE=s3
RCLONE_CONFIG_OFFSITE_PROVIDER=Cloudflare
RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID=
RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY=
RCLONE_CONFIG_OFFSITE_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
BACKUP_BUCKET=knightly-backups
EOF
  chmod 600 "$ROOT/backup.env"
fi
cat > /etc/systemd/system/knightly-backup.service <<EOF
[Unit]
Description=Back up Knightly's production database off the machine
After=docker.service

[Service]
Type=oneshot
EnvironmentFile=$ROOT/backup.env
ExecStart=$ROOT/backup.sh production
EOF
cat > /etc/systemd/system/knightly-backup.timer <<'EOF'
[Unit]
Description=Nightly Knightly backup

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now knightly-backup.timer

echo
echo "Done. Next (docs/deploy.md): fill in $ROOT/staging/.env, $ROOT/production/.env and"
echo "$ROOT/backup.env, then deploy from GitHub Actions."
