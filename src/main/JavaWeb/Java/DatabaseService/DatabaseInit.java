package DatabaseService;

import java.sql.*;
import java.util.*;
import javax.naming.InitialContext;
import javax.sql.DataSource;
import org.json.*;

/** JDBC boundary matching IAFM: JNDI datasource or environment-configured MySQL. */
public final class DatabaseInit {
  private DatabaseInit() {}

  public static String setting(String key, String fallback) {
    try {
      Object value = new InitialContext().lookup("java:comp/env/marginloom/" + key);
      if (value != null) return value.toString();
    } catch (javax.naming.NamingException ignored) {
    }
    return System.getProperty(
        "marginloom." + key.toLowerCase(Locale.ROOT).replace('_', '.'),
        System.getenv().getOrDefault("MARGINLOOM_" + key, fallback));
  }

  public static Connection open() throws Exception {
    String jndi = setting("DB_JNDI", "");
    if (!jndi.isBlank()) return ((DataSource) new InitialContext().lookup(jndi)).getConnection();
    Class.forName(setting("DB_DRIVER", "com.mysql.cj.jdbc.Driver"));
    return DriverManager.getConnection(
        setting("DB_URL", "jdbc:mysql://127.0.0.1:3306/marginloom?connectionTimeZone=UTC"),
        setting("DB_USER", "marginloom"),
        setting("DB_PASSWORD", ""));
  }

  public static void schema(Connection c) throws SQLException {
    String[] ddl = {
      "CREATE TABLE IF NOT EXISTS workspaces (id VARCHAR(100) PRIMARY KEY,name VARCHAR(100) NOT NULL,created_at BIGINT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS sessions (token_hash VARCHAR(64) PRIMARY KEY,workspace_id VARCHAR(100) NOT NULL,expires_at BIGINT NOT NULL,FOREIGN KEY(workspace_id) REFERENCES workspaces(id))",
      "CREATE TABLE IF NOT EXISTS api_keys (token_hash VARCHAR(64) PRIMARY KEY,workspace_id VARCHAR(100) NOT NULL,created_at BIGINT NOT NULL,FOREIGN KEY(workspace_id) REFERENCES workspaces(id))",
      "CREATE TABLE IF NOT EXISTS runs (id VARCHAR(100) PRIMARY KEY,workspace_id VARCHAR(100) NOT NULL,name VARCHAR(80) NOT NULL,dataset_hash VARCHAR(64) NOT NULL,payload MEDIUMTEXT NOT NULL,created_at BIGINT NOT NULL,FOREIGN KEY(workspace_id) REFERENCES workspaces(id))",
      "CREATE TABLE IF NOT EXISTS reviews (id VARCHAR(100) PRIMARY KEY,workspace_id VARCHAR(100) NOT NULL,run_id VARCHAR(100) NOT NULL,record_id VARCHAR(100) NOT NULL,decision VARCHAR(32) NOT NULL,note TEXT NOT NULL,created_at BIGINT NOT NULL,CONSTRAINT review_identity UNIQUE(workspace_id,run_id,record_id),FOREIGN KEY(workspace_id) REFERENCES workspaces(id))",
      "CREATE TABLE IF NOT EXISTS audit (id VARCHAR(100) PRIMARY KEY,workspace_id VARCHAR(100) NOT NULL,action VARCHAR(100) NOT NULL,detail TEXT NOT NULL,created_at BIGINT NOT NULL,FOREIGN KEY(workspace_id) REFERENCES workspaces(id))",
      "CREATE TABLE IF NOT EXISTS counters (counter_key VARCHAR(200) PRIMARY KEY,count INT NOT NULL,expires_at BIGINT NOT NULL)"
    };
    try (Statement s = c.createStatement()) {
      for (String sql : ddl) s.execute(sql);
    }
  }

  public static int execute(Connection c, String sql, Object... args) throws SQLException {
    try (PreparedStatement s = c.prepareStatement(sql)) {
      bind(s, args);
      return s.executeUpdate();
    }
  }

  private static void bind(PreparedStatement s, Object[] args) throws SQLException {
    for (int i = 0; i < args.length; i++) s.setObject(i + 1, args[i]);
  }

  public static JSONArray query(Connection c, String sql, Object... args) throws SQLException {
    try (PreparedStatement s = c.prepareStatement(sql)) {
      bind(s, args);
      try (ResultSet r = s.executeQuery()) {
        JSONArray rows = new JSONArray();
        ResultSetMetaData m = r.getMetaData();
        while (r.next()) {
          JSONObject row = new JSONObject();
          for (int i = 1; i <= m.getColumnCount(); i++)
            row.put(
                m.getColumnLabel(i).toLowerCase(Locale.ROOT),
                Optional.ofNullable(r.getObject(i)).orElse(JSONObject.NULL));
          rows.put(row);
        }
        return rows;
      }
    }
  }

  public static JSONObject first(Connection c, String sql, Object... args) throws SQLException {
    return query(c, sql, args).optJSONObject(0);
  }
}
