import static org.junit.Assert.*;

import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import org.apache.catalina.startup.Tomcat;
import org.json.*;
import org.junit.*;

public class ServletIntegrationTest {
  static Tomcat tomcat;
  static String base;
  static HttpClient client;

  @BeforeClass
  public static void start() throws Exception {
    System.setProperty("marginloom.db.driver", "org.h2.Driver");
    System.setProperty(
        "marginloom.db.url", "jdbc:h2:mem:api;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1");
    System.setProperty("marginloom.db.user", "sa");
    System.setProperty("marginloom.schema.auto.init", "true");
    tomcat = new Tomcat();
    tomcat.setBaseDir(Files.createTempDirectory("test-tomcat").toString());
    tomcat.setPort(0);
    tomcat.getConnector().setProperty("address", "127.0.0.1");
    var context =
        tomcat.addWebapp("/test", Path.of("src/main/JavaWeb/WebAPP").toAbsolutePath().toString());
    context.setParentClassLoader(ServletIntegrationTest.class.getClassLoader());
    tomcat.start();
    base = "http://127.0.0.1:" + tomcat.getConnector().getLocalPort() + "/test/";
    client =
        HttpClient.newBuilder()
            .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
            .build();
  }

  @AfterClass
  public static void stop() throws Exception {
    tomcat.stop();
    tomcat.destroy();
  }

  static HttpResponse<String> call(HttpClient c, String path, String body, boolean csrf)
      throws Exception {
    var b = HttpRequest.newBuilder(URI.create(base + path));
    if (body != null) {
      b.POST(HttpRequest.BodyPublishers.ofString(body)).header("Content-Type", "application/json");
      if (csrf) b.header("X-Marginloom-Client", "1");
    }
    return c.send(b.build(), HttpResponse.BodyHandlers.ofString());
  }

  @Test
  public void staticAndHttpContract() throws Exception {
    assertEquals(200, call(client, "index.html", null, false).statusCode());
    assertEquals(200, call(client, "api/health", null, false).statusCode());
    assertEquals(200, call(client, "assets/js/app.js", null, false).statusCode());
    assertEquals(401, call(client, "api/bootstrap", null, false).statusCode());
    assertEquals(403, call(client, "api/session", "{}", false).statusCode());
    assertEquals(200, call(client, "api/session", "{}", true).statusCode());
    var response = call(client, "api/bootstrap", null, false);
    assertEquals(response.body(), 200, response.statusCode());
    JSONObject boot = new JSONObject(response.body());
    assertEquals(360, boot.getJSONObject("run").getJSONObject("evaluation").getInt("testCount"));
    var imported =
        call(
            client,
            "api/evaluate",
            boot.getJSONObject("run").getJSONObject("dataset").toString(),
            true);
    assertEquals(imported.body(), 201, imported.statusCode());
    String id = new JSONObject(imported.body()).getString("id");
    HttpClient stranger =
        HttpClient.newBuilder()
            .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
            .build();
    call(stranger, "api/session", "{}", true);
    assertEquals(404, call(stranger, "api/runs/" + id, null, false).statusCode());
    assertEquals(200, call(client, "api/runs/" + id, null, false).statusCode());
    assertEquals(
        422,
        call(
                client,
                "api/review",
                "{\"runId\":\"demo\",\"recordId\":\"bad\",\"decision\":\"corrected\",\"note\":\"\"}",
                true)
            .statusCode());
    assertEquals(
        200,
        call(
                client,
                "api/report/demo",
                "{\"policy\":{\"threshold\":1,\"maxDisagreement\":0.12,\"maxOod\":0.65}}",
                true)
            .statusCode());
    assertEquals(405, call(client, "api/evaluate", null, true).statusCode());
  }
}
