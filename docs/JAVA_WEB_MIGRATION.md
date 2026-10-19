# Java Web migration — 19 October 2026

## Requested scope

Reimplement Marginloom using the same code layout and application technology as IAFM while retaining its functionality. This is a Java application rewrite, not a Java wrapper around the original runtime. The original implementations remain in Git history and in preserved deployment releases.

Marginloom preserves calibration, raw/calibrated metrics, risk–coverage curves, slice and confusion analysis, prediction imports, local ensemble inference, human-review notes, immutable policy snapshots, JSON evidence exports, actual audit events, descriptive distribution comparisons, scoped API keys and the synthetic segmentation viewer/report. The original model coefficients, generated data and vision assets are retained. Workspace capabilities, API-key hashes and persisted evidence can be migrated from SQLite to MySQL without changing record identities.


## Architecture

Browser HTML/CSS/JavaScript → Servlet controller → Java model/domain logic → JDBC → MySQL.

Java 21 and Maven package a WAR for Servlet 4 / Tomcat 9. The Java source and WebAPP paths match the IAFM Maven configuration. Controllers use explicit input validation and bounded bodies. Responses do not cache capability-scoped data. Database queries use parameters and workspace constraints. Only trusted loopback reverse proxies may supply forwarded identity/scheme headers.

The frontend uses standard DOM APIs and same-origin fetch; supplied text is rendered with textContent, not HTML injection. It retains the existing product operations and responsive views; React component internals are replaced by native browser code. The visual layout has been adapted where needed for this implementation.

## Build

```sh
mvn verify
```

`target/Marginloom.war` is the application. `target/surefire-reports/` records tests. The test-scoped embedded Tomcat/H2 dependencies are excluded from production WARs. Optional Python experiments do not serve requests.

## Verification

- Numeric parity fixtures were captured from the original implementations before migration.
- The complete original evaluation result compares within 1e-6 (bounded temperature-search floating-point variation); portable inference compares within 1e-12. Independent Python metric fixtures, split leakage validation and empty selections are tested.
- Real embedded Tomcat requests verify static resources, HTTP methods, input validation and end-to-end flows under a non-root context path.
- Real MySQL staging checks cover imports, workspace isolation, persisted review/report evidence, API-key revocation and atomic 30-run quota under concurrent policy saves.
- Browser checks cover interactive prediction/policy/review/vision behavior and responsive layout. API tests separately inspect report contents; download-button activation alone is not treated as proof of local file saving.

## Tomcat deployment

Use Tomcat 9 with Java 21. For the existing shared server, deploy `Marginloom.war` as `/Marginloom` and configure Nginx to proxy the existing domain to that context. Preserve the domain and TLS configuration. Browser URLs remain on the existing domain root; Nginx strips the internal context from cookie paths and redirects. Enable trusted-loopback RemoteIpValve at the application Context so HTTPS cookies/origin validation use the original public scheme.

Private Context entries use names `marginloom/DB_URL`, `marginloom/DB_USER`, `marginloom/DB_PASSWORD`, `marginloom/SCHEMA_AUTO_INIT`. Alternatively use matching MARGINLOOM_* environment variables or marginloom.db.* Java properties. Credentials stay outside the WAR/repository. Automatic schema creation defaults to false.

Initialize schema with an offline maintenance identity:

```sh
java -cp 'WEB-INF/classes:WEB-INF/lib/*' DatabaseService.Migrate
```

Use a dedicated MySQL schema with utf8mb4_bin collation (see deploy/mysql-database.sql) and a runtime identity limited to DML on that schema. Case-sensitive record IDs preserve the original SQLite review semantics. For a pre-existing schema, verify the reviews.record_id column also uses utf8mb4_bin before importing. Workspaces are locked with SELECT FOR UPDATE before checking/inserting a run, making the 30-run quota transactional. API-key rotation is also serialized per workspace. Session, run, review and audit data are scoped to the authenticated workspace.

## Migration and rollback

Before switching traffic, stop the old writer briefly and use SQLite backup() to capture committed WAL data. Export all seven original tables using tools/export_sqlite.py into a private JSON file. Import into the dedicated MySQL schema with DatabaseService.Migrate PRIVATE_EXPORT.json. Token hashes and record IDs are preserved. `--replace` performs an explicit transactional replacement of only those application tables in the configured target; use it only for the migration target after taking a backup. A failed import rolls back.

Validate counts and content hashes against the SQLite export. Keep the old SQLite database, original Node service and Nginx configuration intact. If switching back after MySQL writes begin, reconcile new MySQL evidence before rollback; the old SQLite copy does not automatically receive new writes.

No IAFM database, portfolio source, or unrelated service is changed by this migration.

## Documentation references

[Tomcat 9 documentation](https://tomcat.apache.org/tomcat-9.0-doc/) defines the Servlet 4 container configuration. Historical files elsewhere in docs/ remain dated evidence for earlier implementations and must not be used as current build instructions.

## Verified live cutover

On 19 October 2026, the existing HTTPS domain was switched to the Java WAR in the shared Tomcat service. Health reports Java 21 / Servlet 4 and MySQL ready. Browser operations were checked through the public domain. IAFM and the portfolio remained available (HTTP 200), and their Tomcat service was not restarted. Original application services were stopped and disabled, with their releases retained for rollback.

WAR SHA-256: `80e125f4120395f131973810e249886bbf832f76796a637843ab393382cb6373`.

Maven verification passed 6 JUnit tests, including numeric parity and real Tomcat HTTP flows. The final SQLite backup contained 25 workspaces, 10 sessions, 1 saved run, 26 audit events, no review records and no API keys. Imported counts matched, and every persisted field in those records was independently compared after import. The new app uses a dedicated schema and DML-only runtime identity.
