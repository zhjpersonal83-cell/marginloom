import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const config = {
  name: "marginloom-local",
  compatibility_date: "2026-05-15",
  d1_databases: [
    {
      binding: "DB",
      database_name: "site-creator-d1",
      database_id: "00000000-0000-4000-8000-000000000000",
      migrations_dir: "../../drizzle",
    },
  ],
};
mkdirSync(".sites-runtime/local", { recursive: true });
writeFileSync(".sites-runtime/local/wrangler.json", JSON.stringify(config));
const result = spawnSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    ".sites-runtime/local/wrangler.json",
    "--persist-to",
    ".wrangler/state",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      CLOUDFLARE_CF_FETCH_ENABLED: "false",
    },
  },
);
process.exit(result.status ?? 1);
