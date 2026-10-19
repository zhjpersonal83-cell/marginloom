package Controller;

import java.io.*;
import java.nio.charset.StandardCharsets;
import javax.servlet.*;
import javax.servlet.http.*;
import org.json.*;

public abstract class JsonServlet extends HttpServlet {
  protected JSONObject body(HttpServletRequest req, int max) throws IOException {
    if (req.getContentType() == null
        || !req.getContentType().toLowerCase().startsWith("application/json"))
      throw new HttpError(415, "Use application/json.");
    byte[] bytes = req.getInputStream().readNBytes(max + 1);
    if (bytes.length > max) throw new HttpError(413, "Request too large.");
    try {
      return new JSONObject(new String(bytes, StandardCharsets.UTF_8));
    } catch (JSONException ex) {
      throw new HttpError(400, "Invalid JSON.");
    }
  }

  protected void json(HttpServletResponse res, Object value) throws IOException {
    res.setContentType("application/json;charset=UTF-8");
    res.getWriter().write(value.toString());
  }

  protected void error(HttpServletResponse res, int status, String message) throws IOException {
    res.setStatus(status);
    json(res, new JSONObject().put("error", message).put("detail", message));
  }

  protected abstract void handle(HttpServletRequest req, HttpServletResponse res) throws Exception;

  @Override
  protected final void service(HttpServletRequest req, HttpServletResponse res) throws IOException {
    req.setCharacterEncoding("UTF-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    try {
      handle(req, res);
    } catch (HttpError ex) {
      error(res, ex.status, ex.getMessage());
    } catch (JSONException | IllegalArgumentException ex) {
      error(res, 422, "Invalid request fields.");
    } catch (Exception ex) {
      getServletContext().log("API internal failure", ex);
      error(res, 500, "The service is temporarily unavailable.");
    }
  }

  public static String string(JSONObject b, String k, int min, int max) {
    Object v = b.opt(k);
    if (!(v instanceof String s) || s.length() < min || s.length() > max)
      throw new HttpError(422, "Invalid " + k + ".");
    return s;
  }
}
