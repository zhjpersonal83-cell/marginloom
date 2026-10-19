# Marginloom — Java Web

Evidence for when your model should defer.

[Live application](https://marginloom.zhongjiehuang.com) · [Source](https://github.com/zhjpersonal83-cell/marginloom) · [Migration and verification](docs/JAVA_WEB_MIGRATION.md)

## Stack and structure

Aligned with IAFM: **Java 21, Maven WAR, Servlet 4 (`javax.servlet`), Tomcat 9, HTML/CSS/native JavaScript**, with JDBC/MySQL for Marginloom persistence. There is no Node, React, TypeScript, FastAPI, Cloudflare or SQLite application runtime. Optional offline Python research tools are kept separately, as in IAFM.

```text
pom.xml
src/main/JavaWeb/Java/
  Controller/       # HTTP/API and validation boundary
  Model/            # Classifier/reliability and application logic
  DatabaseService/  # JDBC lifecycle, schema and migration (Marginloom)
src/main/JavaWeb/WebAPP/
  index.html
  assets/css/app.css
  assets/js/app.js
  WEB-INF/web.xml
src/main/resources/ # Trained model and frozen evaluation data
src/main/Python/    # Optional offline research/reproduction only
src/test/java/     # Numeric parity, isolation and real Tomcat tests
src/test/resources/
docs/
deploy/
```

## Existing capabilities

Marginloom preserves calibration, raw/calibrated metrics, risk–coverage curves, slice and confusion analysis, prediction imports, local ensemble inference, human-review notes, immutable policy snapshots, JSON evidence exports, actual audit events, descriptive distribution comparisons, scoped API keys and the synthetic segmentation viewer/report. The original model coefficients, generated data and vision assets are retained. Workspace capabilities, API-key hashes and persisted evidence can be migrated from SQLite to MySQL without changing record identities.


## Build and test

Install Java 21 and Maven 3.9+, then run:

```sh
mvn verify
```

Deploy `target/Marginloom.war` to Tomcat 9. Maven runs independent numeric fixtures and real HTTP requests against embedded Tomcat. H2 in MySQL mode is used only by tests; live Marginloom uses MySQL. Native browser scripts require no frontend build step.

Configure MySQL using a private Tomcat Context or MARGINLOOM_DB_URL, MARGINLOOM_DB_USER and MARGINLOOM_DB_PASSWORD. Run DatabaseService.Migrate with a maintenance identity to initialize schema; the production web identity needs only SELECT, INSERT, UPDATE and DELETE. See the deployment guide before starting Tomcat.

## Boundaries

Synthetic, non-commercial research and engineering demonstration, developed with AI assistance. Existing limitations remain: synthetic metrics do not establish real-world safety, interactive threshold exploration is not independent validation, and human reviews do not rewrite benchmark labels. No fabricated learning or benchmark improvement.

Historical deployment records describe the superseded implementations. Current operation is documented in [Java Web migration](docs/JAVA_WEB_MIGRATION.md). First-party licensing and retained third-party notices remain in force.

## Optional research reproduction

Install `src/main/Python/requirements.txt` in a separate Python 3.12 environment, then run `make reproduce` and `make research-test`. The exporter updates Java model resources and vision assets from the original deterministic experiments. Run `mvn verify` before accepting regenerated assets; parity fixtures are preserved as independent references. Python is not part of the deployed request path.
