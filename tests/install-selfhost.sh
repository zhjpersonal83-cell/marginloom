#!/usr/bin/env bash
# Ephemeral Ubuntu 22.04 GitHub Actions integration test; never run on a VPS.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true ]] || { echo 'This installation fixture runs only in GitHub Actions.' >&2; exit 1; }
[[ "$EUID" == 0 ]] || { echo 'This installation fixture requires root.' >&2; exit 1; }
[[ -d /run/systemd/system ]] || { echo 'This test requires systemd.' >&2; exit 1; }

repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
archive="${1:-$repository/artifacts/local/Marginloom-Ubuntu-x64.tar.gz}"
[[ -f "$archive" ]] || { echo "Release archive is missing: $archive" >&2; exit 1; }
for command in nginx systemctl curl openssl tar getent; do
  command -v "$command" >/dev/null || { echo "Missing fixture dependency: $command" >&2; exit 1; }
done

domain=marginloom.example
canary=old-marginloom-test.example
canary_config=/etc/nginx/sites-available/marginloom-install-canary
certificate_directory="/etc/letsencrypt/live/$domain"
fixture_paths=(
  /opt/marginloom /etc/marginloom /var/lib/marginloom /var/www/marginloom-acme
  /etc/nginx/sites-available/marginloom /etc/nginx/sites-enabled/marginloom
  /etc/systemd/system/marginloom.service /etc/systemd/system/marginloom-backup.service
  /etc/systemd/system/marginloom-backup.timer
  "$canary_config" /etc/nginx/sites-enabled/marginloom-install-canary
  "$certificate_directory"
)
for path in "${fixture_paths[@]}"; do
  [[ ! -e "$path" && ! -L "$path" ]] || { echo "Refusing to overwrite an existing fixture path: $path" >&2; exit 1; }
done
if getent passwd marginloom >/dev/null || getent group marginloom >/dev/null; then
  echo 'Refusing to reuse an existing marginloom user or group.' >&2
  exit 1
fi

temporary="$(mktemp -d -t marginloom-install-test.XXXXXXXX)"
nginx_was_active=0
if systemctl is-active --quiet nginx; then nginx_was_active=1; fi
cleanup() {
  result=$?
  trap - EXIT
  if [[ "$result" != 0 ]]; then
    systemctl status marginloom.service --no-pager || true
    journalctl -u marginloom.service -n 40 --no-pager || true
  fi
  # All of these paths and identities were absent before this fixture began.
  systemctl disable --now marginloom-backup.timer marginloom.service >/dev/null 2>&1 || true
  systemctl stop marginloom-backup.service >/dev/null 2>&1 || true
  rm -f /etc/nginx/sites-enabled/marginloom /etc/nginx/sites-enabled/marginloom-install-canary
  rm -f /etc/nginx/sites-available/marginloom "$canary_config"
  if nginx -t; then
    if [[ "$nginx_was_active" == 1 ]]; then systemctl reload nginx || true
    else systemctl stop nginx || true
    fi
  fi
  rm -f /etc/systemd/system/marginloom.service /etc/systemd/system/marginloom-backup.service /etc/systemd/system/marginloom-backup.timer
  systemctl daemon-reload || true
  systemctl reset-failed marginloom.service marginloom-backup.service >/dev/null 2>&1 || true
  if getent passwd marginloom >/dev/null; then userdel marginloom || true; fi
  if getent group marginloom >/dev/null; then groupdel marginloom || true; fi
  rm -rf -- /opt/marginloom /etc/marginloom /var/lib/marginloom /var/www/marginloom-acme "$certificate_directory" "$temporary"
  exit "$result"
}
trap cleanup EXIT

cat > "$canary_config" <<'EOF'
server {
    listen 80;
    server_name old-marginloom-test.example;
    location / { default_type text/plain; return 200 'existing-site-ok'; }
}
EOF
ln -s "$canary_config" /etc/nginx/sites-enabled/marginloom-install-canary
nginx -t
if [[ "$nginx_was_active" == 1 ]]; then systemctl reload nginx
else systemctl start nginx
fi
canary_check() {
  local status
  status="$(curl --noproxy '*' --silent --show-error --max-time 10 -H "Host: $canary" -o "$temporary/canary-body" -w '%{http_code}' http://127.0.0.1/)"
  [[ "$status" == 200 && "$(cat "$temporary/canary-body")" == existing-site-ok ]] || {
    echo "Existing virtual host changed: HTTP $status" >&2; return 1;
  }
}
# A reload can take a moment to replace workers without replacing the master.
for attempt in $(seq 1 20); do
  if canary_check; then break; fi
  sleep 0.1
done
canary_check
master_before="$(systemctl show nginx --property=MainPID --value)"
[[ "$master_before" =~ ^[1-9][0-9]*$ ]] || { echo 'Nginx has no active master PID.' >&2; exit 1; }
echo 'PASS existing Nginx virtual host responds before installation'

mkdir "$temporary/release"
tar -xzf "$archive" -C "$temporary/release"

# Exercise rollback after the installer has created a real user, files and unit.
# The failed fixture has a valid manifest, but its service deliberately cannot start.
cp -a "$temporary/release" "$temporary/failed-release"
sed -i 's|^ExecStart=.*|ExecStart=/bin/false|' "$temporary/failed-release/deploy/marginloom.service"
(
  cd "$temporary/failed-release"
  awk '$2 != "deploy/marginloom.service"' SHA256SUMS > SHA256SUMS.new
  sha256sum deploy/marginloom.service >> SHA256SUMS.new
  mv SHA256SUMS.new SHA256SUMS
)
if bash "$temporary/failed-release/deploy/install-ubuntu.sh" "$domain" > "$temporary/failed-install.log" 2>&1; then
  cat "$temporary/failed-install.log"
  echo 'The intentionally broken service installation unexpectedly succeeded.' >&2
  exit 1
fi
cat "$temporary/failed-install.log"
grep -F 'Marginloom failed its health check' "$temporary/failed-install.log" >/dev/null
grep -F 'rolling back newly-created Marginloom resources' "$temporary/failed-install.log" >/dev/null
for path in /opt/marginloom /etc/marginloom /var/lib/marginloom /var/www/marginloom-acme \
  /etc/systemd/system/marginloom.service /etc/systemd/system/marginloom-backup.service \
  /etc/systemd/system/marginloom-backup.timer \
  /etc/nginx/sites-available/marginloom /etc/nginx/sites-enabled/marginloom; do
  [[ ! -e "$path" && ! -L "$path" ]] || { echo "Rollback left a newly-created resource: $path" >&2; exit 1; }
done
if getent passwd marginloom >/dev/null || getent group marginloom >/dev/null; then
  echo 'Rollback left the newly-created marginloom user or group.' >&2
  exit 1
fi
if systemctl is-active --quiet marginloom.service; then
  echo 'Rollback left the failed service active.' >&2
  exit 1
fi
canary_check
[[ "$(systemctl show nginx --property=MainPID --value)" == "$master_before" ]] || { echo 'Rollback restarted the Nginx master.' >&2; exit 1; }
echo 'PASS failed first installation rolls back its user, application, data, units and Nginx configuration while preserving the old host'

bash "$temporary/release/deploy/install-ubuntu.sh" "$domain"
systemctl is-active --quiet marginloom.service
systemctl is-active --quiet marginloom-backup.timer
curl --noproxy '*' --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health |
  /opt/marginloom/current/runtime/node --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;const h=JSON.parse(s);if(h.status!=="ok"||h.database!=="ready")throw new Error("Unhealthy installation")'
for attempt in $(seq 1 20); do
  http_status="$(curl --noproxy '*' --silent --show-error --max-time 10 -H "Host: $domain" -o "$temporary/http-body" -w '%{http_code}' http://127.0.0.1/)"
  [[ "$http_status" == 503 ]] && break
  sleep 0.1
done
[[ "$http_status" == 503 ]] || { echo "HTTP exposed the app before TLS: $http_status" >&2; exit 1; }
canary_check
[[ "$(systemctl show nginx --property=MainPID --value)" == "$master_before" ]] || { echo 'Installer restarted the Nginx master.' >&2; exit 1; }
echo 'PASS installation starts the isolated service, gates HTTP, and preserves the old host and Nginx master'

# Validate the actual TLS template with a temporary self-signed certificate.
# This intentionally does not call Certbot or test live ACME issuance/renewal.
install -d -m 0700 "$certificate_directory"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj "/CN=$domain" -addext "subjectAltName=DNS:$domain" \
  -keyout "$certificate_directory/privkey.pem" -out "$certificate_directory/fullchain.pem" \
  > "$temporary/openssl.log" 2>&1
chmod 0600 "$certificate_directory/privkey.pem"
sed "s/__DOMAIN__/$domain/g" "$temporary/release/deploy/nginx-https.conf" > /etc/nginx/sites-available/marginloom
nginx -t
systemctl reload nginx
curl --noproxy '*' --insecure --fail --silent --show-error --max-time 10 --retry 5 --retry-connrefused --retry-delay 1 \
  --resolve "$domain:443:127.0.0.1" "https://$domain/api/health" |
  /opt/marginloom/current/runtime/node --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;const h=JSON.parse(s);if(h.database!=="ready")throw new Error("Unhealthy HTTPS proxy")'
session_status="$(curl --noproxy '*' --insecure --silent --show-error --max-time 10 \
  --resolve "$domain:443:127.0.0.1" "https://$domain/api/session" \
  -H "Origin: https://$domain" -H 'Content-Type: application/json' -H 'X-Marginloom-Client: 1' \
  --data '{}' -D "$temporary/session-headers" -o "$temporary/session-body" -w '%{http_code}')"
[[ "$session_status" == 200 ]] || { echo "HTTPS session failed: $session_status" >&2; exit 1; }
grep -Eiq '^set-cookie:.*marginloom_session=.*; Secure' "$temporary/session-headers"
grep -Eiq '^set-cookie:.*; HttpOnly' "$temporary/session-headers"
grep -Eiq '^set-cookie:.*; SameSite=Strict' "$temporary/session-headers"
canary_check
[[ "$(systemctl show nginx --property=MainPID --value)" == "$master_before" ]] || { echo 'TLS configuration restarted the Nginx master.' >&2; exit 1; }
echo 'PASS self-signed HTTPS proxy sets a Secure/HttpOnly/SameSite cookie and preserves the existing virtual host'

bash /opt/marginloom/current/deploy/disable.sh
if systemctl is-active --quiet marginloom.service || systemctl is-active --quiet marginloom-backup.timer; then
  echo 'Disable left the application or backup timer active.' >&2
  exit 1
fi
[[ ! -e /etc/nginx/sites-enabled/marginloom && ! -L /etc/nginx/sites-enabled/marginloom ]] || { echo 'Disable left the public virtual host enabled.' >&2; exit 1; }
[[ -f /etc/marginloom/environment && -f /var/lib/marginloom/marginloom.sqlite ]] || { echo 'Disable removed application settings or data.' >&2; exit 1; }
/opt/marginloom/current/runtime/node --input-type=module - "$temporary/session-body" <<'NODE'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const workspace = JSON.parse(readFileSync(process.argv[2], "utf8")).workspace;
assert.equal(typeof workspace, "string");
const database = new DatabaseSync("/var/lib/marginloom/marginloom.sqlite", { readOnly: true });
try {
  assert.equal(database.prepare("SELECT id FROM workspaces WHERE id=?").get(workspace)?.id, workspace);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM sessions WHERE workspace_id=?").get(workspace).n, 1);
  assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
} finally { database.close(); }
NODE
canary_check
[[ "$(systemctl show nginx --property=MainPID --value)" == "$master_before" ]] || { echo 'Disable restarted the Nginx master.' >&2; exit 1; }
echo 'PASS disable stops only Marginloom, preserves its database/settings/application, and keeps the old virtual host active'
echo 'Installation fixture passed; temporary self-signed TLS only, live ACME issuance is untested.'
