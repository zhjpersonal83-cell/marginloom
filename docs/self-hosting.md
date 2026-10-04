# Self-hosting on Ubuntu

This deployment serves the same React workbench and API using a standalone Node.js HTTP process and SQLite. It does not run Wrangler or a development server. The frontend is a static Vite build; the existing API and reliability engine are bundled with a small SQLite adapter. No npm install, Python, Docker, Cloudflare login, paid model API, or build step is needed on the target host.

The Linux x86_64 release includes the official Node.js 24.21.0 executable and license. Its upstream archive checksum is verified during packaging. Node's built-in SQLite module is at release-candidate stability in Node 24. Keep Node security updates in the maintenance plan.

## Installation

Target: Ubuntu 22.04, systemd, existing Nginx, ports 80/443 already available. Point an A record for the new hostname at the host. Keep the app's port 3000 on loopback. The installer refuses occupied ports, existing Marginloom installations, or existing matching virtual hosts. It creates a dedicated service user, application directory, database, and Nginx file; it reloads Nginx after validation and does not restart existing application services.

Transfer the supplied `Marginloom-Ubuntu-x64.tar.gz` to the server. Run each command separately:

```bash
mkdir -p /root/marginloom-release
tar -xzf /root/Marginloom-Ubuntu-x64.tar.gz -C /root/marginloom-release
bash /root/marginloom-release/deploy/install-ubuntu.sh marginloom.zhongjiehuang.com
bash /opt/marginloom/current/deploy/enable-https.sh marginloom.zhongjiehuang.com
```

The HTTPS step uses Certbot's webroot mode, asks for its normal email/terms input if needed, and requests a certificate only for this hostname. Until TLS succeeds, this hostname serves ACME challenges and returns 503 for the app. This prevents an insecure HTTP login while `PUBLIC_ORIGIN` is HTTPS. Existing sites retain their configurations. Certbot must already be installed; if missing, install the Ubuntu `certbot` package, then repeat the HTTPS step. The installer makes no firewall changes and does not change other domain records.

Verify after installation:

```bash
systemctl status marginloom --no-pager
curl --fail https://marginloom.zhongjiehuang.com/api/health
systemctl show marginloom -p MemoryCurrent -p MemoryPeak -p MemorySwapCurrent
journalctl -u marginloom -n 30 --no-pager
```

Open the site, import a dataset, save a policy, record a review, and download the evidence report. Validate your existing website still works. Code tests and local measurements do not establish performance on your host.

## Resources and persistence

- App: `/opt/marginloom/current`, pointing to a versioned release directory.
- Settings: `/etc/marginloom/environment`; `PUBLIC_ORIGIN` must match the HTTPS origin exactly.
- Data: `/var/lib/marginloom/marginloom.sqlite`, with SQLite WAL sidecar files.
- Node heap: 192 MiB; systemd soft RAM threshold 256 MiB, hard RAM limit 384 MiB, swap allowance 1 GiB. These are limits, not predicted usage. Host swap remains available.
- At most four active API responses, body limit 900 KB, existing per-workspace/API limits, Nginx per-IP request limiting.
- SQLite main database limit: 256 MiB. Backups retain the most recent three snapshots. Reaching the database cap requires an operator to export/archive data or deliberately change the limit. No automatic deletion of workspaces is performed.
- No server-side model retraining. The checked-in trained weights perform CPU inference.

## Backups and recovery

The daily `marginloom-backup.timer` uses SQLite's online backup API, so it can run while the app is active. Backups on the same disk do not protect against loss of the server: copy them to an independent destination.

```bash
systemctl start marginloom-backup.service
ls -lh /var/lib/marginloom/backups
```

To restore, stop **only** `marginloom`, move the current SQLite database and its `-wal`/`-shm` sidecars aside together, copy the selected backup to `marginloom.sqlite`, set owner `marginloom:marginloom` and mode `0600`, then restart `marginloom` and verify health and saved runs. Do not restore over an open database.

## Updates

To take Marginloom offline while retaining its data and leaving other virtual hosts configured:

```bash
bash /opt/marginloom/current/deploy/disable.sh
```

This removes only the Marginloom Nginx symlink, validates/reloads Nginx, and stops/disables only the Marginloom app and backup timer. To re-enable, start/enable `marginloom.service` and `marginloom-backup.timer`, restore `/etc/nginx/sites-enabled/marginloom` pointing to `/etc/nginx/sites-available/marginloom`, validate Nginx, and reload it. A failed **first installation** rolls back its newly-created service, account, configuration, and empty initial data directory automatically.

Do not rerun the first-install script over an existing installation. Build and test a new release off-server; verify its SHA256SUMS. Back up the database, place the release under `/opt/marginloom/releases/<version>`, set root ownership and readable/executable permissions, and atomically repoint `current`. Restart only `marginloom`, then check its health. Keep the previous release for application rollback. Migrations are append-only and checked by checksum; assess database compatibility before rolling back application code. Preserve `/etc/marginloom/environment` and `/var/lib/marginloom`.

## Build and validation

```bash
pnpm install --frozen-lockfile
pnpm build:selfhost
pnpm test:selfhost
pnpm package:selfhost
```

The package script downloads the pinned official Linux x86_64 Node distribution over HTTPS and verifies its published SHA-256 before extracting the executable. It writes a self-contained archive with internal checksums and no private runtime data. The API contract, workspace isolation, model results, and report format are shared with the managed Worker build. The two deployments have separate databases; existing Sites workspaces are not copied automatically.

References: [Node SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), [Nginx proxy](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [Nginx request limits](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html).
