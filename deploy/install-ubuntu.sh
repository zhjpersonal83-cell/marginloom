#!/usr/bin/env bash
set -euo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
domain="${1:-marginloom.zhongjiehuang.com}"
[[ "$domain" =~ ^[a-z0-9]+([.-][a-z0-9]+)*\.[a-z]{2,}$ ]] || { echo 'Invalid domain.' >&2; exit 1; }
[[ "$(uname -m)" == x86_64 ]] || { echo 'This package requires Linux x86_64.' >&2; exit 1; }
source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for command in nginx systemctl curl sha256sum ss getent useradd; do command -v "$command" >/dev/null || { echo "Missing dependency: $command" >&2; exit 1; }; done
[[ -d /run/systemd/system ]] || { echo 'A systemd host is required.' >&2; exit 1; }
nginx -t
[[ -f "$source_root/SHA256SUMS" ]] || { echo 'Use the complete release package.' >&2; exit 1; }
(cd "$source_root" && sha256sum --check --quiet SHA256SUMS)
[[ "$("$source_root/runtime/node" --version)" == v24.21.0 ]] || { echo 'Node runtime validation failed.' >&2; exit 1; }
[[ ! -e /etc/nginx/sites-available/marginloom && ! -e /etc/nginx/sites-enabled/marginloom ]] || { echo 'Marginloom Nginx configuration already exists; use the update procedure.' >&2; exit 1; }
for existing in /opt/marginloom /etc/marginloom /var/lib/marginloom /var/www/marginloom-acme /etc/systemd/system/marginloom.service /etc/systemd/system/marginloom-backup.service /etc/systemd/system/marginloom-backup.timer; do
  [[ ! -e "$existing" ]] || { echo "Existing path: $existing; use the update procedure." >&2; exit 1; }
done
if ss -lntH 'sport = :3000' | grep -q .; then echo 'Port 3000 is occupied; stopping without changing it.' >&2; exit 1; fi
if nginx -T 2>&1 | awk -v domain="$domain" '
  { sub(/#.*/, ""); text = text " " $0 }
  END { count=split(text, directives, ";"); for(i=1;i<=count;i++) {
    n=split(directives[i], tokens, /[[:space:]{}]+/); found=0;
    for(j=1;j<=n;j++) { if(tokens[j]=="server_name") found=1; else if(found && tokens[j]==domain) match_found=1; }
  } exit !match_found }'; then echo 'Domain already occurs in Nginx; review its existing configuration first.' >&2; exit 1; fi
if getent passwd marginloom >/dev/null || getent group marginloom >/dev/null; then echo 'User or group marginloom already exists; review before installing.' >&2; exit 1; fi

complete=0
created_user=0
cleanup() {
  if [[ "$complete" == 1 ]]; then return; fi
  echo 'Installation failed; rolling back newly-created Marginloom resources.' >&2
  systemctl disable --now marginloom-backup.timer marginloom-backup.service marginloom.service >/dev/null 2>&1 || true
  rm -f /etc/nginx/sites-enabled/marginloom /etc/nginx/sites-available/marginloom
  if nginx -t; then systemctl reload nginx || true; fi
  rm -f /etc/systemd/system/marginloom.service /etc/systemd/system/marginloom-backup.service /etc/systemd/system/marginloom-backup.timer
  systemctl daemon-reload || true
  # Every path below was verified absent before installation began.
  rm -rf /opt/marginloom /etc/marginloom /var/lib/marginloom /var/www/marginloom-acme
  if [[ "$created_user" == 1 ]]; then userdel marginloom || true; fi
}
trap cleanup EXIT

release="$(date -u +%Y%m%dT%H%M%SZ)"
destination="/opt/marginloom/releases/$release"
install -d -m 0755 "$destination" /etc/marginloom /var/www/marginloom-acme
cp -a "$source_root/." "$destination/"
chown -R root:root "$destination"
chmod -R a+rX "$destination"
useradd --system --user-group --home-dir /var/lib/marginloom --shell /usr/sbin/nologin marginloom
created_user=1
install -d -o marginloom -g marginloom -m 0700 /var/lib/marginloom
ln -s "$destination" /opt/marginloom/current
cat > /etc/marginloom/environment <<EOF
NODE_ENV=production
PORT=3000
PUBLIC_ORIGIN=https://$domain
MARGINLOOM_DB=/var/lib/marginloom/marginloom.sqlite
MARGINLOOM_BACKUPS=/var/lib/marginloom/backups
EOF
chmod 0600 /etc/marginloom/environment
install -m 0644 "$source_root/deploy/marginloom.service" /etc/systemd/system/
install -m 0644 "$source_root/deploy/marginloom-backup.service" /etc/systemd/system/
install -m 0644 "$source_root/deploy/marginloom-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now marginloom.service
healthy=0
for attempt in $(seq 1 20); do
  if curl --fail --silent --connect-timeout 2 --max-time 3 http://127.0.0.1:3000/api/health >/dev/null; then healthy=1; break; fi
  sleep 1
done
if [[ "$healthy" != 1 ]]; then
  systemctl stop marginloom.service
  journalctl -u marginloom.service -n 30 --no-pager
  echo 'Marginloom failed its health check; Nginx was not changed.' >&2
  exit 1
fi
sed "s/__DOMAIN__/$domain/g" "$source_root/deploy/nginx.conf" > /etc/nginx/sites-available/marginloom
ln -s /etc/nginx/sites-available/marginloom /etc/nginx/sites-enabled/marginloom
if ! nginx -t; then
  rm /etc/nginx/sites-enabled/marginloom
  echo 'New Marginloom virtual host was not enabled; existing Nginx is still running.' >&2
  exit 1
fi
systemctl reload nginx
systemctl enable --now marginloom-backup.timer
complete=1
echo "Installed and healthy on loopback. Next: bash /opt/marginloom/current/deploy/enable-https.sh $domain"
