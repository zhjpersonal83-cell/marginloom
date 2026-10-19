package Model;

import Controller.HttpError;
import DatabaseService.DatabaseInit;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import org.json.*;

/** Workspace-scoped transactions. Locking the owner row makes the 30-run quota atomic. */
public final class WorkspaceService {
  public final JSONObject demo, model;
  private final JSONObject demoEvaluation;

  public WorkspaceService() {
    try {
      demo = Reliability.validate(resource("demo.json"));
      model = resource("model.json");
      demoEvaluation = Reliability.evaluate(demo, Reliability.policy());
    } catch (Exception ex) {
      throw new IllegalStateException("Invalid model resources", ex);
    }
  }

  private static JSONObject resource(String name) throws Exception {
    try (var in = WorkspaceService.class.getResourceAsStream("/" + name)) {
      return new JSONObject(new String(in.readAllBytes(), StandardCharsets.UTF_8));
    }
  }

  public static String uid() {
    return UUID.randomUUID().toString();
  }

  public static String digest(String text) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException(ex);
    }
  }

  public static String canonical(Object value) {
    if (value instanceof JSONObject o) {
      List<String> keys = new ArrayList<>(o.keySet());
      Collections.sort(keys);
      return "{"
          + keys.stream()
              .map(k -> JSONObject.quote(k) + ":" + canonical(o.get(k)))
              .collect(java.util.stream.Collectors.joining(","))
          + "}";
    }
    if (value instanceof JSONArray a) {
      List<String> values = new ArrayList<>();
      for (Object o : a) values.add(canonical(o));
      return "[" + String.join(",", values) + "]";
    }
    return JSONObject.valueToString(value);
  }

  public JSONObject identity(Connection c, String token, String bearer) throws Exception {
    JSONObject row;
    if (bearer != null) {
      row =
          DatabaseInit.first(
              c, "SELECT workspace_id FROM api_keys WHERE token_hash=?", digest(bearer));
      if (row == null) throw new HttpError(401, "Invalid API key.");
    } else {
      if (token == null) throw new HttpError(401, "Open a demo workspace first.");
      row =
          DatabaseInit.first(
              c,
              "SELECT workspace_id FROM sessions WHERE token_hash=? AND expires_at>?",
              digest(token),
              System.currentTimeMillis());
      if (row == null) throw new HttpError(401, "Session expired. Open a new demo workspace.");
    }
    return new JSONObject()
        .put("workspace", row.getString("workspace_id"))
        .put("role", "owner")
        .put("kind", bearer == null ? "demo" : "api");
  }

  public JSONObject session(Connection c, String token, String bearer) throws Exception {
    try {
      return identity(c, token, bearer);
    } catch (HttpError ex) {
      if (ex.status != 401) throw ex;
    }
    String workspace = uid(), fresh = uid() + uid();
    long now = System.currentTimeMillis();
    DatabaseInit.execute(
        c,
        "INSERT INTO workspaces(id,name,created_at) VALUES(?,?,?)",
        workspace,
        "My reliability workspace",
        now);
    DatabaseInit.execute(
        c,
        "INSERT INTO sessions(token_hash,workspace_id,expires_at) VALUES(?,?,?)",
        digest(fresh),
        workspace,
        now + 7 * 86400000L);
    audit(c, workspace, "workspace.created", "Isolated demo workspace opened");
    return new JSONObject()
        .put("workspace", workspace)
        .put("role", "owner")
        .put("kind", "demo")
        .put("token", fresh);
  }

  public void rate(Connection c, String key, int max) throws Exception {
    long now = System.currentTimeMillis();
    DatabaseInit.execute(c, "DELETE FROM counters WHERE expires_at<?", now);
    DatabaseInit.execute(c, "DELETE FROM sessions WHERE expires_at<?", now);
    String id = key + ":" + (now / 60000);
    DatabaseInit.execute(
        c,
        "INSERT INTO counters(counter_key,count,expires_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE count=count+1",
        id,
        now + 120000);
    JSONObject row = DatabaseInit.first(c, "SELECT count FROM counters WHERE counter_key=?", id);
    if (row.getInt("count") > max)
      throw new HttpError(429, "Rate limit reached. Try again in a minute.");
  }

  public void audit(Connection c, String workspace, String action, String detail) throws Exception {
    DatabaseInit.execute(
        c,
        "INSERT INTO audit(id,workspace_id,action,detail,created_at) VALUES(?,?,?,?,?)",
        uid(),
        workspace,
        action,
        detail,
        System.currentTimeMillis());
  }

  public JSONObject run(Connection c, String id, String workspace) throws Exception {
    if (id.equals("demo"))
      return new JSONObject()
          .put("id", "demo")
          .put("dataset", new JSONObject(demo.toString()))
          .put("evaluation", new JSONObject(demoEvaluation.toString()))
          .put("datasetHash", digest(canonical(demo)))
          .put("createdAt", JSONObject.NULL)
          .put("source", "Synthetic, reproducible demo");
    JSONObject row =
        DatabaseInit.first(
            c,
            "SELECT id,payload,dataset_hash,created_at FROM runs WHERE id=? AND workspace_id=?",
            id,
            workspace);
    if (row == null) throw new HttpError(404, "Run not found in this workspace.");
    return new JSONObject(row.getString("payload"))
        .put("id", id)
        .put("datasetHash", row.getString("dataset_hash"))
        .put("createdAt", row.getLong("created_at"));
  }

  private void quota(Connection c, String workspace) throws Exception {
    DatabaseInit.first(c, "SELECT id FROM workspaces WHERE id=? FOR UPDATE", workspace);
    JSONObject row =
        DatabaseInit.first(c, "SELECT COUNT(*) AS n FROM runs WHERE workspace_id=?", workspace);
    if (row.getInt("n") >= 30) throw new HttpError(409, "Workspace limit: 30 evaluation runs.");
  }

  private JSONObject save(
      Connection c,
      String workspace,
      JSONObject dataset,
      JSONObject evaluation,
      String source,
      String hash,
      String parent)
      throws Exception {
    quota(c, workspace);
    String id = uid();
    long now = System.currentTimeMillis();
    JSONObject payload =
        new JSONObject()
            .put("dataset", dataset)
            .put("evaluation", evaluation)
            .put("source", source);
    if (parent != null) payload.put("parentRunId", parent);
    String text = payload.toString();
    if (text.getBytes(StandardCharsets.UTF_8).length > 1500000)
      throw new HttpError(413, "Evaluation exceeds the 1.5 MB storage limit.");
    DatabaseInit.execute(
        c,
        "INSERT INTO runs(id,workspace_id,name,dataset_hash,payload,created_at) VALUES(?,?,?,?,?,?)",
        id,
        workspace,
        dataset.getString("name"),
        hash,
        text,
        now);
    audit(
        c,
        workspace,
        parent == null ? "evaluation.completed" : "policy.saved",
        parent == null
            ? dataset.getString("name")
                + ": "
                + evaluation.getInt("testCount")
                + " held-out records"
            : "Exploratory policy; run " + id);
    return payload.put("id", id).put("datasetHash", hash).put("createdAt", now);
  }

  public JSONObject evaluate(Connection c, String workspace, JSONObject input) throws Exception {
    JSONObject d = Reliability.validate(input);
    return save(
        c,
        workspace,
        d,
        Reliability.evaluate(d, Reliability.policy()),
        "Imported predictions",
        digest(canonical(d)),
        null);
  }

  public JSONObject policy(Connection c, String workspace, String runId, JSONObject p)
      throws Exception {
    JSONObject r = run(c, runId, workspace);
    return save(
        c,
        workspace,
        r.getJSONObject("dataset"),
        Reliability.evaluate(r.getJSONObject("dataset"), Reliability.policy(p)),
        r.getString("source"),
        r.getString("datasetHash"),
        runId);
  }

  public JSONObject review(Connection c, String workspace, JSONObject b) throws Exception {
    String runId = Controller.JsonServlet.string(b, "runId", 1, 100),
        record = Controller.JsonServlet.string(b, "recordId", 1, 100),
        decision = Controller.JsonServlet.string(b, "decision", 1, 32),
        note = Controller.JsonServlet.string(b, "note", 0, 500);
    if (!List.of("confirmed", "corrected", "needs-context").contains(decision)
        || decision.equals("corrected") && note.isBlank())
      throw new HttpError(422, "Invalid review decision or correction note.");
    JSONObject r = run(c, runId, workspace);
    boolean exists =
        Reliability.rows(r.getJSONObject("dataset"), "test").stream()
            .anyMatch(x -> x.getString("id").equals(record));
    if (!exists) throw new HttpError(404, "Test record not found.");
    DatabaseInit.execute(
        c,
        "INSERT INTO reviews(id,workspace_id,run_id,record_id,decision,note,created_at) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE decision=VALUES(decision),note=VALUES(note),created_at=VALUES(created_at)",
        uid(),
        workspace,
        runId,
        record,
        decision,
        note,
        System.currentTimeMillis());
    audit(c, workspace, "review.recorded", record + ": " + decision);
    return new JSONObject(b.toString()).put("saved", true);
  }

  public JSONArray reviews(Connection c, String workspace, String runId) throws Exception {
    run(c, runId, workspace);
    return DatabaseInit.query(
        c,
        "SELECT run_id,record_id,decision,note,created_at FROM reviews WHERE workspace_id=? AND run_id=? ORDER BY created_at DESC LIMIT 2000",
        workspace,
        runId);
  }

  public JSONObject bootstrap(Connection c, JSONObject user) throws Exception {
    String w = user.getString("workspace");
    return new JSONObject()
        .put("user", user)
        .put("run", run(c, "demo", w))
        .put(
            "runs",
            DatabaseInit.query(
                c,
                "SELECT id,name,dataset_hash,created_at FROM runs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 30",
                w))
        .put("reviews", reviews(c, w, "demo"))
        .put(
            "model",
            new JSONObject()
                .put("name", "Triage ensemble")
                .put("version", "1.0.0")
                .put("type", "3 × logistic regression")
                .put("data", "Author-generated synthetic support messages")
                .put("license", "MIT"));
  }

  public JSONObject report(Connection c, String workspace, String runId, JSONObject policy)
      throws Exception {
    JSONObject r = run(c, runId, workspace);
    if (policy != null)
      r.put(
          "evaluation",
          Reliability.evaluate(r.getJSONObject("dataset"), Reliability.policy(policy)));
    JSONObject e = r.getJSONObject("evaluation");
    JSONArray records = new JSONArray();
    for (JSONObject record : Reliability.rows(r.getJSONObject("dataset"), "test"))
      records.put(
          Reliability.inspect(record, e.getDouble("temperature"), e.getJSONObject("policy")));
    audit(c, workspace, "report.exported", runId);
    return r.put("reviews", reviews(c, workspace, runId))
        .put("schemaVersion", "1.0")
        .put("policySource", policy == null ? "persisted policy" : "current exploratory policy")
        .put("generatedAt", Instant.now().toString())
        .put(
            "limitations",
            new JSONArray(
                List.of(
                    "Synthetic results do not establish real-world performance.",
                    "Threshold exploration on test labels is descriptive, not an independent release validation.",
                    "Human review does not change the original benchmark labels.")))
        .put("records", records);
  }

  public JSONObject key(Connection c, String workspace) throws Exception {
    DatabaseInit.first(c, "SELECT id FROM workspaces WHERE id=? FOR UPDATE", workspace);
    String key = "ml_" + uid().replace("-", "") + uid().replace("-", "");
    DatabaseInit.execute(c, "DELETE FROM api_keys WHERE workspace_id=?", workspace);
    DatabaseInit.execute(
        c,
        "INSERT INTO api_keys(token_hash,workspace_id,created_at) VALUES(?,?,?)",
        digest(key),
        workspace,
        System.currentTimeMillis());
    audit(c, workspace, "api-key.rotated", "Previous key revoked; new key shown once");
    return new JSONObject().put("key", key);
  }
}
