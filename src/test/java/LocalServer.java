import java.nio.file.*;
import org.apache.catalina.startup.Tomcat;

public final class LocalServer {
  public static void main(String[] args) throws Exception {
    if (args.length > 1) {
      System.setProperty("marginloom.db.driver", "org.h2.Driver");
      System.setProperty(
          "marginloom.db.url",
          "jdbc:h2:file:"
              + Path.of("target/local-data").toAbsolutePath()
              + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;AUTO_SERVER=TRUE");
      System.setProperty("marginloom.db.user", "sa");
      System.setProperty("marginloom.schema.auto.init", "true");
    }
    Tomcat t = new Tomcat();
    t.setBaseDir(Files.createTempDirectory("java-web-tomcat").toString());
    t.setPort(Integer.parseInt(args[0]));
    t.getConnector().setProperty("address", "127.0.0.1");
    var context = t.addWebapp("", Path.of("src/main/JavaWeb/WebAPP").toAbsolutePath().toString());
    context.setParentClassLoader(LocalServer.class.getClassLoader());
    t.start();
    Runtime.getRuntime()
        .addShutdownHook(
            new Thread(
                () -> {
                  try {
                    t.stop();
                    t.destroy();
                  } catch (Exception e) {
                  }
                }));
    t.getServer().await();
  }
}
