package Controller;

import java.io.IOException;
import javax.servlet.*;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.*;

/** Preserve the original shareable workbench routes without a frontend router runtime. */
@WebServlet(
    urlPatterns = {
      "/overview",
      "/evaluation",
      "/data",
      "/playground",
      "/vision",
      "/review",
      "/monitoring"
    })
public final class ViewServlet extends HttpServlet {
  @Override
  protected void doGet(HttpServletRequest req, HttpServletResponse res)
      throws ServletException, IOException {
    req.getRequestDispatcher("/index.html").forward(req, res);
  }
}
