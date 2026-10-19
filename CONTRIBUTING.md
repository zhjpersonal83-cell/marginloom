# Contributing

Use Java 21 and Maven 3.9+. Run `mvn verify` before submitting changes. The deployed application uses Servlet 4 on Tomcat 9, native HTML/CSS/JavaScript, and (for Marginloom) JDBC/MySQL.

Keep changes focused on existing behavior and add regression coverage for calculation, isolation, or persistence changes. Java source follows the IAFM package layout: Controller, Model, and DatabaseService. Web assets belong under src/main/JavaWeb/WebAPP.

Preserve calibration/test separation, immutable benchmark labels, reproducible model provenance, authorization boundaries and clear limitations. Do not include credentials or private data. This project was developed with AI assistance.
