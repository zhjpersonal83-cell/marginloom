/** Executes the built production Worker with real local D1, without a file watcher. */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { runApiSuite } from "../tests/api.integration.mjs";
const require = createRequire(import.meta.url);
const workerRequire = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare } = await import(workerRequire.resolve("miniflare"));
const root = resolve("dist/server");
const paths = readdirSync(root, { recursive: true }).filter(
  (p) => /\.m?js$/.test(p) && p !== "index.js",
);
const worker = new Miniflare({
  modulesRoot: root,
  modules: ["index.js", ...paths].map((path) => ({
    type: "ESModule",
    path: resolve(root, path),
  })),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "marginloom-integration" },
  cf: false,
});
try {
  const db = await worker.getD1Database("DB");
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const statement of readFileSync("drizzle/" + file, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
  }
  await runApiSuite((input, init) => worker.dispatchFetch(input, init));
  await db
    .prepare("INSERT INTO workspaces VALUES ('quota-fixture','Quota test',0)")
    .run();
  const attempts = await Promise.allSettled(
    Array.from({ length: 35 }, (_, i) =>
      db
        .prepare(
          "INSERT INTO runs VALUES (?, 'quota-fixture', 'quota', 'hash', '{}', 0)",
        )
        .bind(`quota-${i}`)
        .run(),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 30);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM runs WHERE workspace_id='quota-fixture'",
        )
        .first()
    ).n,
    30,
  );
  console.log("PASS database quota stays at 30 under concurrent inserts");
  await db.prepare("INSERT INTO counters VALUES ('expired-fixture',1,0)").run();
  await db
    .prepare(
      "INSERT INTO sessions VALUES ('expired-fixture','quota-fixture',0)",
    )
    .run();
  await worker.dispatchFetch("http://127.0.0.1:8787/api/session", {
    method: "POST",
    headers: { "X-Marginloom-Client": "1", "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(
    await db
      .prepare("SELECT key FROM counters WHERE key='expired-fixture'")
      .first(),
    null,
  );
  assert.equal(
    await db
      .prepare(
        "SELECT token_hash FROM sessions WHERE token_hash='expired-fixture'",
      )
      .first(),
    null,
  );
  console.log("PASS request maintenance removes expired counters and sessions");
  const plan = await db
    .prepare(
      "EXPLAIN QUERY PLAN SELECT id FROM runs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 30",
    )
    .bind("quota-fixture")
    .all();
  assert.ok(
    plan.results.some((row) =>
      String(row.detail).includes("idx_runs_workspace_created"),
    ),
  );
  console.log("PASS run listing uses the workspace/time index");
} finally {
  await worker.dispose();
}
