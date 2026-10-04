import { z } from "zod";
import demoData from "@/data/demo.json";
import modelData from "@/data/model.json";
import {
  evaluate,
  validateDataset,
  inspect,
  defaultPolicy,
} from "@/lib/reliability/engine";
import type { Dataset, Policy } from "@/lib/reliability/engine";
import { predictText } from "@/lib/reliability/inference";
import {
  db,
  digest,
  uid,
  identity,
  newSession,
  checkMutation,
  readBody,
  writeAudit,
  rateLimit,
  json,
  HttpError,
} from "@/lib/server";
const demo = () => validateDataset(demoData);
const policySchema = z.object({
  threshold: z.number().min(0).max(1),
  maxDisagreement: z.number().min(0).max(2.5),
  maxOod: z.number().min(0).max(1),
});
async function getRun(id: string, workspace: string) {
  if (id === "demo")
    return {
      id: "demo",
      dataset: demo(),
      evaluation: evaluate(demo()),
      datasetHash: await digest(JSON.stringify(demoData)),
      createdAt: null,
      source: "Synthetic, reproducible demo",
    };
  const r = await db()
    .prepare(
      "SELECT id,payload,dataset_hash,created_at FROM runs WHERE id=? AND workspace_id=?",
    )
    .bind(id, workspace)
    .first<{
      id: string;
      payload: string;
      dataset_hash: string;
      created_at: number;
    }>();
  if (!r) throw new HttpError(404, "Run not found in this workspace.");
  return {
    id: r.id,
    ...JSON.parse(r.payload),
    datasetHash: r.dataset_hash,
    createdAt: r.created_at,
    source: JSON.parse(r.payload).source ?? "Imported predictions",
  };
}
async function handle(request: Request) {
  const start = performance.now(),
    requestId = uid(),
    path = new URL(request.url).pathname.replace(/^\/api\//, "").split("/"),
    method = request.method;
  try {
    if (method === "GET" && path[0] === "health") {
      await db().prepare("SELECT 1").first();
      return json({
        status: "ok",
        service: "marginloom",
        version: "0.1.0",
        database: "ready",
      });
    }
    if (method === "POST") checkMutation(request);
    if (method === "POST" && path[0] === "session") {
      const s = await newSession(request);
      return json(
        { workspace: s.workspace, role: s.role, kind: s.kind },
        200,
        s.cookie ? { "Set-Cookie": s.cookie } : {},
      );
    }
    const user = await identity(request);
    await rateLimit(user.workspace, 120);
    if (method === "GET" && path[0] === "bootstrap") {
      const saved = await db()
        .prepare(
          "SELECT id,name,dataset_hash,created_at FROM runs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 30",
        )
        .bind(user.workspace)
        .all();
      const reviews = await db()
        .prepare(
          "SELECT run_id,record_id,decision,note,created_at FROM reviews WHERE workspace_id=? AND run_id=? ORDER BY created_at DESC LIMIT 2000",
        )
        .bind(user.workspace, "demo")
        .all();
      return json({
        user,
        run: await getRun("demo", user.workspace),
        runs: saved.results,
        reviews: reviews.results,
        model: {
          name: "Triage ensemble",
          version: "1.0.0",
          type: "3 × logistic regression",
          data: "Author-generated synthetic support messages",
          license: "MIT",
        },
      });
    }
    if (method === "GET" && path[0] === "runs" && path[1])
      return json(await getRun(path[1], user.workspace));
    if (method === "POST" && path[0] === "evaluate") {
      await rateLimit(user.workspace + ":evaluate", 8);
      const count = await db()
        .prepare("SELECT COUNT(*) AS n FROM runs WHERE workspace_id=?")
        .bind(user.workspace)
        .first<{ n: number }>();
      if ((count?.n ?? 0) >= 30)
        throw new HttpError(
          409,
          "Workspace limit: 30 evaluation runs. Export your runs before starting a new workspace.",
        );
      let dataset: Dataset;
      try {
        dataset = validateDataset(await readBody(request));
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(
          422,
          e instanceof Error ? e.message : "Invalid dataset.",
        );
      }
      const result = evaluate(dataset);
      if (
        new TextEncoder().encode(
          JSON.stringify({
            dataset,
            evaluation: result,
            source: "Imported predictions",
          }),
        ).length > 1500000
      )
        throw new HttpError(
          413,
          "Evaluation exceeds the 1.5 MB storage limit. Reduce records or slices.",
        );
      const id = uid(),
        hash = await digest(JSON.stringify(dataset)),
        createdAt = Date.now();
      await db().batch([
        db()
          .prepare(
            "INSERT INTO runs (id,workspace_id,name,dataset_hash,payload,created_at) VALUES (?,?,?,?,?,?)",
          )
          .bind(
            id,
            user.workspace,
            dataset.name,
            hash,
            JSON.stringify({
              dataset,
              evaluation: result,
              source: "Imported predictions",
            }),
            createdAt,
          ),
        db()
          .prepare(
            "INSERT INTO audit (id,workspace_id,action,detail,created_at) VALUES (?,?,?,?,?)",
          )
          .bind(
            uid(),
            user.workspace,
            "evaluation.completed",
            `${dataset.name}: ${result.testCount} held-out records`,
            createdAt,
          ),
      ]);
      return json(
        {
          id,
          dataset,
          evaluation: result,
          datasetHash: hash,
          createdAt,
          source: "Imported predictions",
        },
        201,
      );
    }
    if (method === "POST" && path[0] === "policy") {
      const body = z
        .object({ runId: z.string().max(100), policy: policySchema })
        .parse(await readBody(request));
      const run = await getRun(body.runId, user.workspace);
      const policy: Policy = body.policy;
      const result = evaluate(run.dataset, policy);
      // The demo is immutable; saving creates an explicit versioned snapshot.
      const id = uid(),
        createdAt = Date.now();
      const count = await db()
        .prepare("SELECT COUNT(*) AS n FROM runs WHERE workspace_id=?")
        .bind(user.workspace)
        .first<{ n: number }>();
      if ((count?.n ?? 0) >= 30)
        throw new HttpError(409, "Workspace limit: 30 runs.");
      await db().batch([
        db()
          .prepare(
            "INSERT INTO runs (id,workspace_id,name,dataset_hash,payload,created_at) VALUES (?,?,?,?,?,?)",
          )
          .bind(
            id,
            user.workspace,
            run.dataset.name,
            run.datasetHash,
            JSON.stringify({
              dataset: run.dataset,
              evaluation: result,
              source: run.source,
              parentRunId: run.id,
            }),
            createdAt,
          ),
        db()
          .prepare(
            "INSERT INTO audit (id,workspace_id,action,detail,created_at) VALUES (?,?,?,?,?)",
          )
          .bind(
            uid(),
            user.workspace,
            "policy.saved",
            `Exploratory threshold ${policy.threshold}; run ${id}`,
            createdAt,
          ),
      ]);
      return json(
        { ...run, id, evaluation: result, createdAt, parentRunId: run.id },
        201,
      );
    }
    if (method === "POST" && path[0] === "predict") {
      const body = z
        .object({
          text: z.string().trim().min(3).max(2000),
          policy: policySchema.optional(),
        })
        .parse(await readBody(request));
      const result = predictText(
        body.text,
        modelData,
        body.policy ?? defaultPolicy,
      );
      await writeAudit(
        user.workspace,
        "inference.completed",
        `${result.accepted ? "Accepted" : "Review"}; ${result.predictionLabel}; text not logged`,
      );
      return json(result);
    }
    if (method === "POST" && path[0] === "review") {
      const b = z
        .object({
          runId: z.string().max(100),
          recordId: z.string().max(100),
          decision: z.enum(["confirmed", "corrected", "needs-context"]),
          note: z.string().max(500),
        })
        .refine(
          (v) => v.decision !== "corrected" || v.note.trim().length > 0,
          "Correction notes must be nonempty.",
        )
        .parse(await readBody(request));
      const run = await getRun(b.runId, user.workspace);
      const record = run.dataset.rows.find(
        (r: { id: string; split: string }) =>
          r.id === b.recordId && r.split === "test",
      );
      if (!record) throw new HttpError(404, "Test record not found.");
      await db().batch([
        db()
          .prepare(
            "INSERT INTO reviews (id,workspace_id,run_id,record_id,decision,note,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(workspace_id,run_id,record_id) DO UPDATE SET decision=excluded.decision,note=excluded.note,created_at=excluded.created_at",
          )
          .bind(
            uid(),
            user.workspace,
            b.runId,
            b.recordId,
            b.decision,
            b.note,
            Date.now(),
          ),
        db()
          .prepare(
            "INSERT INTO audit (id,workspace_id,action,detail,created_at) VALUES (?,?,?,?,?)",
          )
          .bind(
            uid(),
            user.workspace,
            "review.recorded",
            `${b.recordId}: ${b.decision}`,
            Date.now(),
          ),
      ]);
      return json({ saved: true, ...b });
    }
    if (method === "GET" && path[0] === "reviews" && path[1]) {
      await getRun(path[1], user.workspace);
      const r = await db()
        .prepare(
          "SELECT run_id,record_id,decision,note,created_at FROM reviews WHERE workspace_id=? AND run_id=? ORDER BY created_at DESC LIMIT 2000",
        )
        .bind(user.workspace, path[1])
        .all();
      return json({ reviews: r.results });
    }
    if (method === "GET" && path[0] === "audit") {
      const r = await db()
        .prepare(
          "SELECT id,action,detail,created_at FROM audit WHERE workspace_id=? ORDER BY created_at DESC LIMIT 100",
        )
        .bind(user.workspace)
        .all();
      return json({ events: r.results });
    }
    if (
      (method === "GET" || method === "POST") &&
      path[0] === "report" &&
      path[1]
    ) {
      const run = await getRun(path[1], user.workspace);
      if (method === "POST") {
        const body = z
          .object({ policy: policySchema })
          .parse(await readBody(request));
        run.evaluation = evaluate(run.dataset, body.policy);
      }
      const reviews = await db()
        .prepare(
          "SELECT record_id,decision,note,created_at FROM reviews WHERE workspace_id=? AND run_id=? ORDER BY created_at",
        )
        .bind(user.workspace, run.id)
        .all();
      await writeAudit(user.workspace, "report.exported", run.id);
      return json(
        {
          reviews: reviews.results,
          schemaVersion: "1.0",
          policySource:
            method === "POST"
              ? "current exploratory policy"
              : "persisted policy",
          generatedAt: new Date().toISOString(),
          ...run,
          limitations: [
            "Synthetic results do not establish real-world performance.",
            "Threshold exploration on test labels is descriptive, not an independent release validation.",
            "Human review does not change the original benchmark labels.",
          ],
          records: run.dataset.rows
            .filter((r: { split: string }) => r.split === "test")
            .map((r: Dataset["rows"][0]) =>
              inspect(r, run.evaluation.temperature, run.evaluation.policy),
            ),
        },
        200,
        {
          "Content-Disposition": `attachment; filename="marginloom-report-${run.id}.json"`,
        },
      );
    }
    if (method === "POST" && path[0] === "keys") {
      await rateLimit(user.workspace + ":keys", 3);
      const token =
        "ml_" + uid().replaceAll("-", "") + uid().replaceAll("-", "");
      await db().batch([
        db()
          .prepare("DELETE FROM api_keys WHERE workspace_id=?")
          .bind(user.workspace),
        db()
          .prepare(
            "INSERT INTO api_keys (token_hash,workspace_id,created_at) VALUES (?,?,?)",
          )
          .bind(await digest(token), user.workspace, Date.now()),
        db()
          .prepare(
            "INSERT INTO audit (id,workspace_id,action,detail,created_at) VALUES (?,?,?,?,?)",
          )
          .bind(
            uid(),
            user.workspace,
            "api-key.rotated",
            "Previous key revoked; new key shown once",
            Date.now(),
          ),
      ]);
      return json({ key: token }, 201);
    }
    throw new HttpError(404, "Endpoint not found.");
  } catch (e) {
    const quota =
      String(e).includes("workspace run quota exceeded") ||
      String((e as Error)?.cause).includes("workspace run quota exceeded");
    if (quota)
      return json({ error: "Workspace limit: 30 evaluation runs." }, 409);
    const status =
      e instanceof HttpError ? e.status : e instanceof z.ZodError ? 422 : 500;
    console.error(
      JSON.stringify({
        requestId,
        path: path.join("/"),
        status,
        error: status < 500 ? String(e) : "Internal failure",
      }),
    );
    return json(
      {
        error:
          status < 500
            ? e instanceof z.ZodError
              ? "Invalid request fields."
              : (e as Error).message
            : "The service is temporarily unavailable. Please retry.",
        requestId,
      },
      status,
    );
  } finally {
    console.log(
      JSON.stringify({
        requestId,
        method,
        path: path.join("/"),
        latencyMs: Math.round(performance.now() - start),
      }),
    );
  }
}
export const GET = handle;
export const POST = handle;
