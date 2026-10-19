# Security and data boundaries

This is a synthetic portfolio demo, not a certified production service. Report issues privately to the repository owner before publishing sensitive details. Do not attach private data or credentials.

Marginloom now runs Java 21 / Servlet 4 on Tomcat 9. Review docs/JAVA_WEB_MIGRATION.md for current deployment and authorization boundaries. Prior threat/deployment records describe the original runtime.

Workspace sessions use hashed random capabilities in HttpOnly, SameSite=Strict cookies, with Secure behind HTTPS. API keys are hashed and rotated. Cross-origin writes are rejected; browser mutations require a custom header. JDBC queries are parameterized and workspace-scoped. Run quotas use a transactional owner-row lock. Runtime database credentials belong in private server configuration with DML-only privileges.
