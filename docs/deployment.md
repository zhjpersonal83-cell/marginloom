# Deployment

For a Linux server, see [self-hosting](self-hosting.md): a dedicated Node.js HTTP service, native SQLite, static React frontend, systemd and Nginx. This is separate from the Wrangler demonstration below.

## Local development

Node 24 / pnpm 11.25.0: `make install`, then `make dev`. The local D1 migrations are applied before the dev server starts at port 3000. No Cloudflare login or paid model key is needed. Keep `.wrangler/state` for persistence.

## Container demonstration

`docker compose up --build` builds the same Worker code, starts Wrangler's local runtime and stores SQLite in `marginloom-data`. The app is exposed only at `127.0.0.1:3000`; its health check calls `/api/health`. This is a production-build demonstration using an emulator, not a recommendation to run a public enterprise service on Wrangler dev.

The Dockerfile runs as `node`, drops Linux capabilities through Compose and applies migrations at startup. Stop with `docker compose down`; avoid `down -v` if you want to preserve data. Docker was not available in the authoring environment; the repository includes a container build/start CI gate.

## Hosted Worker

The application emits Cloudflare-compatible ESM and static assets. D1 is the only runtime binding. `.openai/hosting.json` declares the logical `DB` binding; the managed hosting platform owns the actual resources and applies checked migrations before the Worker upload. No API secrets are needed for the seeded model.

A Sites-hosted preview begins private and uses the platform access boundary. Session isolation still applies inside the app. Public source code and private hosted preview access are different settings.

Self-hosters can adapt `dist/server/wrangler.json` to their own account and real D1 database; do not use the placeholder local database ID for production. Migrations, TLS, backup/retention and ingress abuse limits must be supplied by the deployment operator. Never commit provider credentials.

## Verification and rollback

Run lint, typecheck, unit/parity tests, a fresh production build and the D1 integration suite before shipping. Check health and a complete evaluation/review/export flow. Pin deployment versions to exact source commits. Roll back application versions only with awareness of database compatibility; migrations are append-only and must remain compatible with the rollback target.
