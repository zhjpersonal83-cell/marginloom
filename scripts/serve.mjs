import { spawnSync, spawn } from "node:child_process";
const migration = spawnSync(process.execPath, ["scripts/migrate-local.mjs"], {
  stdio: "inherit",
});
if (migration.status !== 0) process.exit(migration.status ?? 1);
const child = spawn(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--config",
    "dist/server/wrangler.json",
    "--local",
    "--port",
    "3000",
    "--ip",
    "0.0.0.0",
    "--inspector-port",
    "0",
    "--persist-to",
    ".wrangler/state",
  ],
  { stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
