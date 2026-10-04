import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

/** Implements only the prepared-statement D1 methods used by Marginloom. */
export function openDatabase(path, migrations) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(path, { timeout: 5000 });
  database.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA cache_size=-4096;",
  );
  // Bound demo storage so this service cannot consume the host's entire disk.
  const pageSize = database.prepare("PRAGMA page_size").get().page_size;
  database.exec(
    `PRAGMA max_page_count=${Math.floor((256 * 1024 * 1024) / pageSize)}`,
  );
  database.exec(
    "CREATE TABLE IF NOT EXISTS marginloom_migrations (name TEXT PRIMARY KEY, hash TEXT NOT NULL, applied_at INTEGER NOT NULL)",
  );
  for (const name of readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(resolve(migrations, name), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const applied = database
      .prepare("SELECT hash FROM marginloom_migrations WHERE name=?")
      .get(name);
    if (applied) {
      if (applied.hash !== hash)
        throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(sql);
      database
        .prepare("INSERT INTO marginloom_migrations VALUES (?,?,?)")
        .run(name, hash, Date.now());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  function prepare(sql, params = []) {
    function execute() {
      const statement = database.prepare(sql);
      return { results: statement.all(...params), success: true };
    }
    return {
      bind(...values) {
        return prepare(sql, values);
      },
      async first(column) {
        const row = database.prepare(sql).get(...params);
        return row === undefined ? null : column ? row[column] : row;
      },
      async all() {
        return execute();
      },
      async run() {
        const result = database.prepare(sql).run(...params);
        return {
          results: [],
          success: true,
          meta: {
            changes: Number(result.changes),
            last_row_id: Number(result.lastInsertRowid),
          },
        };
      },
      execute,
    };
  }
  return {
    prepare,
    async batch(statements) {
      // No awaits inside the transaction: other requests cannot interleave.
      database.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => statement.execute());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      database.close();
    },
    async backup(destination) {
      return backup(database, destination);
    },
  };
}
