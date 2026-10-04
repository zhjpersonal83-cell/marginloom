#!/usr/bin/env bash
set -euo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
link=/etc/nginx/sites-enabled/marginloom
if [[ -e "$link" || -L "$link" ]]; then
  [[ -L "$link" && "$(readlink -f "$link")" == /etc/nginx/sites-available/marginloom ]] || { echo 'Unexpected Nginx path; stopping for inspection.' >&2; exit 1; }
  rm "$link"
  if ! nginx -t; then
    ln -s /etc/nginx/sites-available/marginloom "$link"
    echo 'Nginx validation failed; restored Marginloom link without reloading.' >&2
    exit 1
  fi
  systemctl reload nginx
fi
systemctl disable --now marginloom-backup.timer marginloom.service
echo 'Marginloom disabled. Application, settings and SQLite data are retained.'
