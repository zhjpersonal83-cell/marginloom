#!/usr/bin/env bash
set -euo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
domain="${1:-marginloom.zhongjiehuang.com}"
[[ "$domain" =~ ^[a-z0-9]+([.-][a-z0-9]+)*\.[a-z]{2,}$ ]] || { echo 'Invalid domain.' >&2; exit 1; }
command -v certbot >/dev/null || { echo 'Install certbot first: apt install certbot' >&2; exit 1; }
grep -Fx "PUBLIC_ORIGIN=https://$domain" /etc/marginloom/environment >/dev/null
nginx -t
# Interactive email/terms prompt belongs to Certbot. Webroot avoids rewriting other hosts.
certbot certonly --webroot -w /var/www/marginloom-acme -d "$domain"
source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
previous="$(mktemp)"
cp /etc/nginx/sites-available/marginloom "$previous"
sed "s/__DOMAIN__/$domain/g" "$source_root/deploy/nginx-https.conf" > /etc/nginx/sites-available/marginloom
if ! nginx -t; then
  cp "$previous" /etc/nginx/sites-available/marginloom
  rm "$previous"
  echo 'Restored previous Marginloom configuration; Nginx was not reloaded.' >&2
  exit 1
fi
rm "$previous"
systemctl reload nginx
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/marginloom-reload <<'EOF'
#!/bin/sh
case " $RENEWED_DOMAINS " in
  *" marginloom.zhongjiehuang.com "*) /usr/sbin/nginx -t && /bin/systemctl reload nginx ;;
esac
EOF
# The hostname is validated above before substitution.
sed -i "s/marginloom.zhongjiehuang.com/$domain/g" /etc/letsencrypt/renewal-hooks/deploy/marginloom-reload
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/marginloom-reload
curl --fail --show-error --silent --connect-timeout 3 --max-time 15 --resolve "$domain:443:127.0.0.1" "https://$domain/api/health"
echo
echo "HTTPS enabled: https://$domain"
