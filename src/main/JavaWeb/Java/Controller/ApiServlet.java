package Controller;

import DatabaseService.DatabaseInit;
import Model.*;
import java.sql.*;
import java.util.*;
import javax.servlet.*;
import javax.servlet.http.*;
import org.json.*;

public final class ApiServlet extends JsonServlet {
  private final WorkspaceService service = new WorkspaceService();

  @Override
  public void init() throws ServletException {
    try (Connection c = DatabaseInit.open()) {
      if (Boolean.parseBoolean(DatabaseInit.setting("SCHEMA_AUTO_INIT", "false")))
        DatabaseInit.schema(c);
      try (Statement s = c.createStatement()) {
        s.executeQuery("SELECT id FROM workspaces WHERE 1=0").close();
      }
    } catch (Exception ex) {
      throw new ServletException("Configure MySQL and apply schema before startup.", ex);
    }
  }

  private static String cookie(HttpServletRequest req) {
    javax.servlet.http.Cookie[] cookies = req.getCookies();
    if (cookies != null)
      for (javax.servlet.http.Cookie c : cookies)
        if (c.getName().equals("marginloom_session")) return c.getValue().replaceAll("^\"|\"$", "");
    return null;
  }

  private static String bearer(HttpServletRequest req) {
    String h = req.getHeader("Authorization");
    return h != null && h.startsWith("Bearer ") ? h.substring(7) : null;
  }

  private static void mutation(HttpServletRequest req) {
    if (!"1".equals(req.getHeader("X-Marginloom-Client")) && bearer(req) == null)
      throw new HttpError(403, "Missing CSRF protection header.");
    String origin = req.getHeader("Origin");
    if (origin != null) {
      String expected =
          req.getScheme()
              + "://"
              + req.getServerName()
              + ((req.getServerPort() == 80 || req.getServerPort() == 443)
                  ? ""
                  : ":" + req.getServerPort());
      if (!origin.equals(expected))
        throw new HttpError(403, "Cross-origin writes are not allowed.");
    }
  }

  @Override
  protected void handle(HttpServletRequest req, HttpServletResponse res) throws Exception {
    String method = req.getMethod(), path = req.getPathInfo() == null ? "" : req.getPathInfo();
    String[] parts = path.split("/");
    if (parts.length < 2) throw new HttpError(404, "Endpoint not found.");
    String action = parts[1], id = parts.length > 2 ? parts[2] : null;
    if (!List.of("GET", "POST").contains(method)) throw new HttpError(405, "Method not allowed.");
    if (method.equals("POST")) mutation(req);
    try (Connection c = DatabaseInit.open()) {
      c.setAutoCommit(false);
      c.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
      try {
        if (method.equals("GET") && action.equals("health")) {
          DatabaseInit.first(c, "SELECT 1 AS ready");
          json(
              res,
              new JSONObject()
                  .put("status", "ok")
                  .put("service", "marginloom")
                  .put("version", "0.2.0")
                  .put("runtime", "Java 21 / Servlet 4")
                  .put("database", "ready"));
          c.commit();
          return;
        }
        if (method.equals("POST") && action.equals("session")) {
          service.rate(c, "session:" + WorkspaceService.digest(req.getRemoteAddr()), 20);
          JSONObject s = service.session(c, cookie(req), bearer(req));
          if (s.has("token")) {
            String token = s.getString("token");
            s.remove("token");
            res.setHeader(
                "Set-Cookie",
                "marginloom_session="
                    + token
                    + "; HttpOnly; SameSite=Strict; Path="
                    + (req.getContextPath().isEmpty() ? "/" : req.getContextPath() + "/")
                    + "; Max-Age=604800"
                    + (req.isSecure() ? "; Secure" : ""));
          }
          c.commit();
          json(res, s);
          return;
        }
        JSONObject user = service.identity(c, cookie(req), bearer(req));
        String w = user.getString("workspace");
        service.rate(c, w, 120); // Persist rate accounting even when validation below fails.
        c.commit();
        JSONObject body = method.equals("POST") ? body(req, 900000) : null;
        Object result;
        switch (action) {
          case "bootstrap":
            if (!method.equals("GET")) throw new HttpError(405, "Method not allowed.");
            result = service.bootstrap(c, user);
            break;
          case "runs":
            if (!method.equals("GET") || id == null) throw new HttpError(404, "Run required.");
            result = service.run(c, id, w);
            break;
          case "evaluate":
            if (!method.equals("POST")) throw new HttpError(405, "Method not allowed.");
            service.rate(c, w + ":evaluate", 8);
            c.commit();
            result = service.evaluate(c, w, body);
            res.setStatus(201);
            break;
          case "preview":
            if (!method.equals("POST")) throw new HttpError(405, "Method not allowed.");
            JSONObject preview = service.run(c, string(body, "runId", 1, 100), w);
            JSONObject pe =
                Reliability.evaluate(
                    preview.getJSONObject("dataset"),
                    Reliability.policy(body.getJSONObject("policy")));
            JSONArray records = new JSONArray();
            for (JSONObject record : Reliability.rows(preview.getJSONObject("dataset"), "test"))
              records.put(
                  Reliability.inspect(
                      record, pe.getDouble("temperature"), pe.getJSONObject("policy")));
            result = new JSONObject().put("evaluation", pe).put("records", records);
            break;
          case "policy":
            if (!method.equals("POST")) throw new HttpError(405, "Method not allowed.");
            result =
                service.policy(c, w, string(body, "runId", 1, 100), body.getJSONObject("policy"));
            res.setStatus(201);
            break;
          case "predict":
            if (!method.equals("POST")) throw new HttpError(405, "Method not allowed.");
            String text = string(body, "text", 3, 2000).trim();
            if (text.length() < 3) throw new HttpError(422, "Text too short.");
            JSONObject p =
                body.has("policy")
                    ? Reliability.policy(body.getJSONObject("policy"))
                    : Reliability.policy();
            result = Reliability.predict(text, service.model, p);
            service.audit(
                c,
                w,
                "inference.completed",
                ((JSONObject) result).getString("predictionLabel") + "; text not logged");
            break;
          case "review":
            if (!method.equals("POST")) throw new HttpError(405, "Method not allowed.");
            result = service.review(c, w, body);
            break;
          case "reviews":
            if (!method.equals("GET") || id == null) throw new HttpError(404, "Run required.");
            result = new JSONObject().put("reviews", service.reviews(c, w, id));
            break;
          case "audit":
            if (!method.equals("GET")) throw new HttpError(405, "Method not allowed.");
            result =
                new JSONObject()
                    .put(
                        "events",
                        DatabaseInit.query(
                            c,
                            "SELECT id,action,detail,created_at FROM audit WHERE workspace_id=? ORDER BY created_at DESC LIMIT 100",
                            w));
            break;
          case "report":
            if (id == null) throw new HttpError(404, "Run required.");
            result = service.report(c, w, id, body == null ? null : body.getJSONObject("policy"));
            res.setHeader(
                "Content-Disposition",
                "attachment; filename=marginloom-report-"
                    + (id.equals("demo") ? "demo" : UUID.fromString(id))
                    + ".json");
            break;
          case "keys":
            if (!method.equals("POST")) throw new HttpError(405, "Method not allowed.");
            service.rate(c, w + ":keys", 3);
            c.commit();
            result = service.key(c, w);
            res.setStatus(201);
            break;
          default:
            throw new HttpError(404, "Endpoint not found.");
        }
        c.commit();
        json(res, result);
      } catch (Exception ex) {
        c.rollback();
        throw ex;
      }
    }
  }
}
