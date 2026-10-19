package DatabaseService;

import java.sql.*;
import javax.servlet.*;
import javax.servlet.annotation.WebListener;

@WebListener
public final class DatabaseLifecycle implements ServletContextListener {
  @Override
  public void contextDestroyed(ServletContextEvent event) {
    com.mysql.cj.jdbc.AbandonedConnectionCleanupThread.checkedShutdown();
    var drivers = DriverManager.getDrivers();
    while (drivers.hasMoreElements()) {
      Driver driver = drivers.nextElement();
      if (driver.getClass().getClassLoader() == getClass().getClassLoader())
        try {
          DriverManager.deregisterDriver(driver);
        } catch (SQLException ex) {
          event.getServletContext().log("Driver cleanup failed", ex);
        }
    }
  }
}
