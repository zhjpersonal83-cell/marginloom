/** Exercise the built Node server over HTTP with a real, persistent SQLite file. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { request as httpRequest } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { openDatabase } from "../selfhost/sqlite.mjs";
import { runApiSuite } from "./api.integration.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "marginloom-selfhost-"));
const databasePath = join(temporary, "app.sqlite");
const publicOrigin = "https://marginloom.example";
const migrations = join(root, "drizzle");
const previousEnvironment = process.env.MARGINLOOM_TEST_ENV;
process.env.MARGINLOOM_TEST_ENV =
  "built Node server over loopback HTTP, SQLite, sequential; not a production load benchmark";
let child;
let childExit;
let logs = "";
let localOrigin;
let checks = 0;
const memory = [];

function pass(message) {
  checks++;
  console.log("PASS", message);
}

async function recordMemory(checkpoint) {
  if (process.platform !== "linux" || !child?.pid) return;
  let status;
  try {
    status = await readFile(`/proc/${child.pid}/status`, "utf8");
  } catch (error) {
    if (!["ENOENT", "EACCES", "EPERM"].includes(error.code)) throw error;
    const startupLine = logs
      .split("\n")
      .find((line) => line.includes('"runtime":"node-sqlite"'));
    memory.push({
      checkpoint,
      procStatusUnavailable: error.code,
      ...(checkpoint === "startup" && startupLine
        ? { startupReportedRssMiB: JSON.parse(startupLine).rssMiB }
        : {}),
    });
    return;
  }
  const kib = (name) =>
    Number(status.match(new RegExp(`^${name}:\\s+(\\d+)`, "m"))?.[1]);
  memory.push({
    checkpoint,
    rssMiB: Math.round((kib("VmRSS") / 1024) * 10) / 10,
    processPeakRssMiB: Math.round((kib("VmHWM") / 1024) * 10) / 10,
  });
}

async function reservePort() {
  const socket = createNetServer();
  await new Promise((fulfill, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", fulfill);
  });
  const port = socket.address().port;
  await new Promise((fulfill, reject) =>
    socket.close((error) => (error ? reject(error) : fulfill())),
  );
  return port;
}

async function start() {
  const port = await reservePort();
  localOrigin = `http://127.0.0.1:${port}`;
  logs = "";
  child = spawn(
    process.execPath,
    [join(root, "dist-selfhost/server/server.mjs")],
    {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        PUBLIC_ORIGIN: publicOrigin,
        MARGINLOOM_DB: databasePath,
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let spawnError;
  child.once("error", (error) => {
    spawnError = error;
  });
  childExit = new Promise((fulfill) =>
    child.once("exit", (code, signal) => fulfill({ code, signal })),
  );
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      logs = (logs + chunk).slice(-24000);
    });
  for (let attempt = 0; attempt < 150; attempt++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`Node server exited during startup:\n${logs}`);
    try {
      const response = await fetch(localOrigin + "/api/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).database === "ready") {
        await recordMemory("startup");
        return;
      }
    } catch {
      /* The listening socket may not yet exist. */
    }
    await delay(50);
  }
  throw new Error(`Node server did not become healthy:\n${logs}`);
}

async function stop() {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  child.kill("SIGTERM");
  let timer;
  const result = await Promise.race([
    childExit,
    new Promise((fulfill) => {
      timer = setTimeout(() => fulfill(null), 4000);
    }),
  ]).finally(() => clearTimeout(timer));
  if (!result) {
    child.kill("SIGKILL");
    await childExit;
    throw new Error("Node server did not shut down gracefully.");
  }
  assert.equal(
    result.code,
    0,
    `Node server shutdown: ${JSON.stringify(result)}\n${logs}`,
  );
}

function transport(input, init = {}) {
  const url = new URL(input);
  const headers = new Headers(init.headers);
  // Simulate the browser's public HTTPS origin while using the loopback socket.
  // An explicit foreign Origin from runApiSuite must remain untouched.
  if (init.method === "POST" && !headers.has("Origin"))
    headers.set("Origin", publicOrigin);
  return fetch(localOrigin + url.pathname + url.search, { ...init, headers });
}

async function api(
  path,
  {
    cookie,
    body,
    headers = {},
    method = body === undefined ? "GET" : "POST",
  } = {},
) {
  return transport(publicOrigin + "/api/" + path, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-Marginloom-Client": "1" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function rawRequest(path, { method = "GET", headers = {}, chunks = [] } = {}) {
  return new Promise((fulfill, reject) => {
    const request = httpRequest(
      localOrigin + path,
      { method, headers },
      (response) => {
        const buffers = [];
        response.on("data", (chunk) => buffers.push(chunk));
        response.once("error", reject);
        response.once("end", () =>
          fulfill({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(buffers),
          }),
        );
      },
    );
    request.setTimeout(15000, () =>
      request.destroy(new Error("HTTP test timed out")),
    );
    request.once("error", reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

async function databaseChecks() {
  const path = join(temporary, "adapter.sqlite");
  let database = openDatabase(path, migrations);
  try {
    const migrationCount = (await readdir(migrations)).filter((name) =>
      name.endsWith(".sql"),
    ).length;
    assert.equal(
      await database
        .prepare("SELECT COUNT(*) AS n FROM marginloom_migrations")
        .first("n"),
      migrationCount,
    );
    await database
      .prepare(
        "INSERT INTO workspaces VALUES ('quota-fixture', 'Quota fixture', 0)",
      )
      .run();
    await assert.rejects(
      database.batch([
        database.prepare(
          "INSERT INTO workspaces VALUES ('rollback-fixture', 'Rollback fixture', 0)",
        ),
        database.prepare(
          "INSERT INTO audit VALUES ('invalid-audit', 'missing-workspace', 'test', 'test', 0)",
        ),
      ]),
      /FOREIGN KEY/,
    );
    assert.equal(
      await database
        .prepare("SELECT id FROM workspaces WHERE id='rollback-fixture'")
        .first(),
      null,
    );
    pass("SQLite batch rolls back every write when a statement fails");

    const attempts = await Promise.allSettled(
      Array.from({ length: 35 }, (_, index) =>
        database
          .prepare(
            "INSERT INTO runs VALUES (?, 'quota-fixture', 'Quota', 'hash', '{}', 0)",
          )
          .bind(`quota-${index}`)
          .run(),
      ),
    );
    assert.equal(
      attempts.filter((item) => item.status === "fulfilled").length,
      30,
    );
    assert.equal(
      await database
        .prepare(
          "SELECT COUNT(*) AS n FROM runs WHERE workspace_id='quota-fixture'",
        )
        .first("n"),
      30,
    );
    for (const attempt of attempts.filter((item) => item.status === "rejected"))
      assert.match(attempt.reason.message, /workspace run quota exceeded/);
    pass("SQLite enforces the 30-run workspace quota across competing inserts");

    database.close();
    database = openDatabase(path, migrations);
    assert.equal(
      await database
        .prepare("SELECT COUNT(*) AS n FROM marginloom_migrations")
        .first("n"),
      migrationCount,
    );
    assert.equal(
      await database.prepare("SELECT COUNT(*) AS n FROM runs").first("n"),
      30,
    );
    pass("SQLite migrations are idempotent and preserve existing data");

    const backupPath = join(temporary, "adapter-backup.sqlite");
    await database.backup(backupPath);
    const restored = openDatabase(backupPath, migrations);
    try {
      assert.equal(
        await restored.prepare("SELECT COUNT(*) AS n FROM runs").first("n"),
        30,
      );
      assert.equal(
        await restored
          .prepare("PRAGMA integrity_check")
          .first("integrity_check"),
        "ok",
      );
    } finally {
      restored.close();
    }
    pass("SQLite adapter backup opens as an intact database with saved runs");
  } finally {
    database.close();
  }
}

try {
  await databaseChecks();
  await start();
  await runApiSuite(transport);
  await recordMemory("after API suite");

  const homepage = await fetch(localOrigin + "/");
  assert.equal(homepage.status, 200);
  assert.match(homepage.headers.get("content-type"), /text\/html/);
  assert.equal(homepage.headers.get("x-content-type-options"), "nosniff");
  const html = await homepage.text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(
    (match) => match[1],
  );
  assert.ok(
    assets.some((asset) => asset.endsWith(".js")),
    "HTML references built JavaScript",
  );
  assert.ok(
    assets.some((asset) => asset.endsWith(".css")),
    "HTML references built CSS",
  );
  for (const asset of assets) {
    const response = await fetch(new URL(asset, localOrigin));
    assert.equal(response.status, 200, asset);
    assert.match(
      response.headers.get("content-type"),
      asset.endsWith(".js") ? /javascript/ : /text\/css/,
    );
    assert.ok((await response.arrayBuffer()).byteLength > 0, asset);
  }
  for (const path of ["/vision", "/evaluation"]) {
    const response = await fetch(localOrigin + path);
    assert.equal(response.status, 200, `direct navigation ${path}`);
    assert.equal(await response.text(), html, `SPA shell ${path}`);
  }
  const manifestResponse = await fetch(localOrigin + "/vision/manifest.json");
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.ok(manifest.images.length > 0);
  for (const name of ["image", "mask", "prediction", "uncertainty"]) {
    const response = await fetch(localOrigin + manifest.images[0][name]);
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()).subarray(0, 8),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  }
  for (const path of ["/.env", "/%2e%2e/package.json", "/does-not-exist.js"])
    assert.equal((await rawRequest(path)).status, 404, path);
  pass(
    "HTML, direct SPA routes, JavaScript, CSS and vision PNGs are served; private and absent paths are rejected",
  );

  const session = await api("session", { body: {} });
  assert.equal(session.status, 200);
  const setCookie = session.headers.get("set-cookie");
  assert.match(setCookie, /; Secure(?:;|$)/);
  assert.match(setCookie, /; HttpOnly(?:;|$)/);
  assert.match(setCookie, /; SameSite=Strict(?:;|$)/);
  const cookie = setCookie.split(";")[0];
  const workspace = (await session.json()).workspace;
  assert.equal(
    (
      await api("session", {
        body: {},
        headers: { Origin: "https://foreign.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await rawRequest("/api/health", { headers: { Host: "foreign.example" } }))
      .status,
    421,
  );
  assert.equal(
    (
      await rawRequest("/api/health", {
        headers: { Host: "marginloom.example" },
      })
    ).status,
    200,
  );
  pass(
    "canonical HTTPS origin sets a secure session cookie and foreign origin/host requests are rejected",
  );

  const oversized = JSON.stringify({ padding: "x".repeat(910000) });
  const bodyHeaders = {
    Origin: publicOrigin,
    Cookie: cookie,
    "Content-Type": "application/json",
    "X-Marginloom-Client": "1",
  };
  const lengthLimited = await rawRequest("/api/evaluate", {
    method: "POST",
    headers: { ...bodyHeaders, "Content-Length": Buffer.byteLength(oversized) },
    chunks: [oversized],
  });
  assert.equal(lengthLimited.status, 413);
  const chunked = await rawRequest("/api/evaluate", {
    method: "POST",
    headers: bodyHeaders,
    chunks: Array.from(
      { length: Math.ceil(oversized.length / 32768) },
      (_, index) => oversized.slice(index * 32768, (index + 1) * 32768),
    ),
  });
  assert.equal(chunked.status, 413);
  assert.equal((await api("health")).status, 200);
  pass(
    "oversized fixed-length and chunked uploads return 413 while the server remains healthy",
  );

  const policy = { threshold: 1, maxDisagreement: 0.12, maxOod: 0.65 };
  const savedResponse = await api("policy", {
    cookie,
    body: { runId: "demo", policy },
  });
  assert.equal(savedResponse.status, 201);
  const savedRun = await savedResponse.json();
  const demo = JSON.parse(await readFile(join(root, "data/demo.json"), "utf8"));
  const recordId = demo.rows.find((row) => row.split === "test").id;
  const reviewBody = {
    runId: savedRun.id,
    recordId,
    decision: "needs-context",
    note: "Persistent self-host integration review.",
  };
  assert.equal((await api("review", { cookie, body: reviewBody })).status, 200);
  await recordMemory("after static, upload and persistence writes");
  await stop();
  await start();
  const reloaded = await api("runs/" + savedRun.id, { cookie });
  assert.equal(reloaded.status, 200);
  assert.equal((await reloaded.json()).evaluation.selection.accepted, 0);
  const reviews = await api("reviews/" + savedRun.id, { cookie });
  assert.equal(reviews.status, 200);
  assert.ok(
    (await reviews.json()).reviews.some(
      (review) =>
        review.record_id === recordId && review.note === reviewBody.note,
    ),
  );
  const bootstrap = await api("bootstrap", { cookie });
  assert.equal((await bootstrap.json()).user.workspace, workspace);
  pass(
    "session, evaluation policy and human review survive a full server restart",
  );

  // Forty-one attempts cover at most one minute-boundary crossing in this short
  // sequential fixture; each request varies the untrusted Cloudflare header.
  let rateLimited = false;
  for (let index = 0; index < 41; index++) {
    const response = await api("session", {
      cookie,
      body: {},
      headers: { "CF-Connecting-IP": `198.51.100.${index + 1}` },
    });
    assert.ok([200, 429].includes(response.status));
    await response.arrayBuffer();
    if (response.status === 429) {
      rateLimited = true;
      break;
    }
  }
  assert.ok(
    rateLimited,
    "changing untrusted CF-Connecting-IP cannot evade the loopback client's session rate limit",
  );
  const proxyClient = await api("session", {
    body: {},
    headers: {
      "X-Real-IP": "203.0.113.21",
      "CF-Connecting-IP": "198.51.100.99",
    },
  });
  assert.equal(
    proxyClient.status,
    200,
    "the trusted loopback proxy can supply a distinct X-Real-IP client",
  );
  await proxyClient.arrayBuffer();
  pass(
    "session rate limits ignore spoofed Cloudflare IP headers and accept the loopback proxy's distinct client IP",
  );

  const backupDirectory = join(temporary, "backups");
  const backupResult = spawnSync(
    process.execPath,
    [join(root, "selfhost/backup.mjs")],
    {
      env: {
        ...process.env,
        MARGINLOOM_DB: databasePath,
        MARGINLOOM_BACKUPS: backupDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      timeout: 15000,
      killSignal: "SIGKILL",
    },
  );
  assert.ifError(backupResult.error);
  assert.equal(
    backupResult.status,
    0,
    backupResult.stdout + backupResult.stderr,
  );
  const backups = (await readdir(backupDirectory)).filter((name) =>
    name.endsWith(".sqlite"),
  );
  assert.equal(backups.length, 1);
  const restored = openDatabase(join(backupDirectory, backups[0]), migrations);
  try {
    assert.equal(
      await restored
        .prepare("SELECT workspace_id FROM runs WHERE id=?")
        .bind(savedRun.id)
        .first("workspace_id"),
      workspace,
    );
    assert.equal(
      await restored
        .prepare("SELECT note FROM reviews WHERE run_id=?")
        .bind(savedRun.id)
        .first("note"),
      reviewBody.note,
    );
    assert.equal(
      await restored.prepare("PRAGMA integrity_check").first("integrity_check"),
      "ok",
    );
  } finally {
    restored.close();
  }
  pass(
    "the backup command copies a running database and restores its saved evaluation and review",
  );
  await recordMemory("after restart and backup");
  console.log(
    JSON.stringify(
      {
        selfhostChecks: checks,
        environment: process.env.MARGINLOOM_TEST_ENV,
        memory,
        memoryNote:
          "Observed child-process RSS and kernel high-water marks where /proc is available; otherwise only the server's startup RSS is reported. Not a VPS capacity or production performance guarantee.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (logs) console.error("Node server output:\n" + logs);
  throw error;
} finally {
  try {
    await stop();
  } finally {
    if (previousEnvironment === undefined)
      delete process.env.MARGINLOOM_TEST_ENV;
    else process.env.MARGINLOOM_TEST_ENV = previousEnvironment;
    await rm(temporary, { recursive: true, force: true });
  }
}
