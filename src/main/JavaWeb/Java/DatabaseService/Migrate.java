package DatabaseService;

import java.nio.file.*;
import java.sql.*;
import org.json.*;

/** Offline schema creation / transactional SQLite JSON import. Never used by web requests. */
public final class Migrate {
  public static void main(String[] args) throws Exception {
    try (Connection c = DatabaseInit.open()) {
      if (args.length == 0) {
        DatabaseInit.schema(c);
        System.out.println("Schema ready.");
        return;
      }
      JSONObject data = new JSONObject(Files.readString(Path.of(args[0])));
      c.setAutoCommit(false);
      try {
        if (args.length == 2 && args[1].equals("--replace")) {
          for (String table :
              new String[] {
                "counters", "audit", "reviews", "runs", "api_keys", "sessions", "workspaces"
              }) DatabaseInit.execute(c, "DELETE FROM " + table);
        }
        for (String table :
            new String[] {
              "workspaces", "sessions", "api_keys", "runs", "reviews", "audit", "counters"
            }) {
          for (Object o : data.getJSONArray(table)) {
            JSONObject r = (JSONObject) o;
            java.util.List<String> keys = new java.util.ArrayList<>(r.keySet());
            java.util.Collections.sort(keys);
            java.util.List<Object> values = new java.util.ArrayList<>();
            for (String k : keys) values.add(r.isNull(k) ? null : r.get(k));
            String columns =
                keys.stream()
                    .map(k -> k.equals("key") ? "counter_key" : k)
                    .collect(java.util.stream.Collectors.joining(","));
            if (!keys.stream().allMatch(k -> k.matches("[a-z_]+")))
              throw new IllegalArgumentException("Invalid columns");
            DatabaseInit.execute(
                c,
                "INSERT INTO "
                    + table
                    + " ("
                    + columns
                    + ") VALUES ("
                    + String.join(",", java.util.Collections.nCopies(keys.size(), "?"))
                    + ")",
                values.toArray());
          }
          System.out.println(table + ": " + data.getJSONArray(table).length() + " rows imported");
        }
        c.commit();
      } catch (Exception ex) {
        c.rollback();
        throw ex;
      }
    }
  }
}
