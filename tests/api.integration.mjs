import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
export async function runApiSuite(fetchTransport = fetch) {
  const origin = process.env.MARGINLOOM_TEST_URL || "http://127.0.0.1:8787";
  const demo = JSON.parse(
    readFileSync(new URL("../data/demo.json", import.meta.url), "utf8"),
  );
  const samples = [];
  let checks = 0;
  async function request(
    path,
    {
      cookie = "",
      key = "",
      body,
      headers = {},
      method = body === undefined ? "GET" : "POST",
    } = {},
  ) {
    const start = performance.now();
    const res = await fetchTransport(origin + "/api/" + path, {
      signal: AbortSignal.timeout(15000),
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(key ? { Authorization: "Bearer " + key } : {}),
        ...(body !== undefined
          ? { "Content-Type": "application/json", "X-Marginloom-Client": "1" }
          : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    samples.push({ path, ms: performance.now() - start, status: res.status });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
      headers: res.headers,
    };
  }
  function check(condition, message) {
    assert.ok(condition, message);
    checks++;
    console.log("PASS", message);
  }
  const health = await request("health");
  check(
    health.status === 200 && health.data.database === "ready",
    "health checks database",
  );
  check(
    (await request("bootstrap")).status === 401,
    "missing authentication rejected",
  );
  check(
    (
      await request("session", {
        body: {},
        headers: { "X-Marginloom-Client": "" },
      })
    ).status === 403,
    "missing CSRF header rejected",
  );
  check(
    (
      await request("session", {
        body: {},
        headers: { Origin: "https://attacker.example" },
      })
    ).status === 403,
    "cross-origin mutation rejected",
  );
  const a = await request("session", { body: {} }),
    b = await request("session", { body: {} });
  check(
    a.status === 200 &&
      b.status === 200 &&
      a.data.workspace !== b.data.workspace,
    "two sessions create isolated workspaces",
  );
  const cookie = a.cookie,
    other = b.cookie;
  const bootstrap = await request("bootstrap", { cookie });
  check(
    bootstrap.status === 200 && bootstrap.data.run.evaluation.testCount === 360,
    "seeded evaluation runs on backend",
  );
  const prediction = await request("predict", {
    cookie,
    body: {
      text: "quasar quantum nebula",
      policy: { threshold: 0.8, maxDisagreement: 0.12, maxOod: 0.65 },
    },
  });
  check(
    prediction.status === 200 &&
      !prediction.data.accepted &&
      prediction.data.oodScore > 0.65,
    "unfamiliar input escalates to review",
  );
  check(
    (
      await request("evaluate", {
        cookie,
        body: {
          ...demo,
          rows: demo.rows.map((r) => ({ ...r, group: "leak" })),
        },
      })
    ).status === 422,
    "cross-split leakage rejected by API",
  );
  const imported = await request("evaluate", {
    cookie,
    body: { ...demo, name: "Integration fixture" },
  });
  check(imported.status === 201, "prediction bundle evaluates and persists");
  const id = imported.data.id;
  check(
    (await request("runs/" + id, { cookie: other })).status === 404,
    "foreign workspace cannot read run",
  );
  check(
    (
      await request("policy", {
        cookie: other,
        body: {
          runId: id,
          policy: { threshold: 1, maxDisagreement: 0.12, maxOod: 0.65 },
        },
      })
    ).status === 404,
    "foreign workspace cannot modify run",
  );
  const policy = { threshold: 1, maxDisagreement: 0.12, maxOod: 0.65 };
  const snapshot = await request("policy", {
    cookie,
    body: { runId: "demo", policy },
  });
  check(
    snapshot.status === 201 &&
      snapshot.data.parentRunId === "demo" &&
      snapshot.data.evaluation.selection.accepted === 0 &&
      snapshot.data.evaluation.slices.every((s) => s.selection.accepted === 0),
    "policy snapshot updates overall and slice metrics",
  );
  const saved = await request("runs/" + snapshot.data.id, { cookie });
  check(
    saved.data.source.includes("Synthetic"),
    "synthetic provenance survives snapshot reload",
  );
  const recordId = demo.rows.find((r) => r.split === "test").id;
  check(
    (
      await request("review", {
        cookie,
        body: { runId: id, recordId, decision: "corrected", note: "" },
      })
    ).status === 422,
    "correction requires server-validated note",
  );
  check(
    (
      await request("review", {
        cookie,
        body: {
          runId: id,
          recordId,
          decision: "needs-context",
          note: "Context is missing in this test fixture.",
        },
      })
    ).status === 200,
    "human review persists",
  );
  const report = await request("report/" + id, { cookie, body: { policy } });
  check(
    report.status === 200 &&
      report.data.evaluation.selection.accepted === 0 &&
      report.data.records.every((r) => !r.accepted),
    "report uses current visible exploratory policy",
  );
  check(
    report.data.reviews.some((r) => r.record_id === recordId),
    "report includes independent review evidence",
  );
  const key = await request("keys", { cookie, body: {} });
  check(
    (await request("runs/" + id, { key: key.data.key })).status === 200,
    "scoped API key works",
  );
  await request("keys", { cookie, body: {} });
  check(
    (await request("runs/" + id, { key: key.data.key })).status === 401,
    "rotation revokes previous API key",
  );
  const reviews = await request("reviews/" + id, { cookie });
  check(
    reviews.data.reviews.length === 1,
    "selected-run review history loads independently",
  );
  const audit = await request("audit", { cookie });
  check(
    audit.data.events.some((e) => e.action === "review.recorded") &&
      audit.data.events.some((e) => e.action === "policy.saved"),
    "mutations create audit records",
  );
  const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        checks,
        requests: samples.length,
        environment:
          process.env.MARGINLOOM_TEST_ENV ||
          "local Miniflare Worker dispatch, sequential; not a network or load benchmark",
        medianMs: sorted[Math.floor(sorted.length * 0.5)],
        p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      },
      null,
      2,
    ),
  );
}
