> Historical record from before the Java Web migration. For the current runtime, structure, build, tests and deployment, see [Java Web migration](JAVA_WEB_MIGRATION.md).

# Production deployment record

Checked on 2026-10-17 (Europe/London).

- Application: <https://marginloom.zhongjiehuang.com/>
- Source repository: <https://github.com/zhjpersonal83-cell/marginloom>
- Application source commit: `d18d722ce70d9d0c426abb508b4022d1fc5a9510`.
- Build metadata: `dirty: false`, runtime `Node.js 24`, built at `2026-10-04T14:05:33.111Z`.
- Deployed release: `/opt/marginloom/releases/20261004T142449Z`, selected by `/opt/marginloom/current`.
- Service entry point: `/opt/marginloom/current/runtime/node --max-old-space-size=192 server/server.mjs`.
- Release verification: all **67** entries in `SHA256SUMS` matched the deployed files.
- Server bundle SHA-256: `e44c57a2b9a7a7fd975a16a32cca1d44f33316d11ab8e2e8c409f2d3bbaa7e19`.
- `GET /api/health`: status `ok`, version `0.1.0`, database `ready`.

The service was running during the check. These observations verify the selected release and its basic service/database health; they are not a new end-to-end test of every product workflow. The application's existing tests and their historical results are documented in [testing.md](testing.md).

The source package is reconstructed from that GitHub commit with this documentation update. Application code and model artifacts match the deployed source. The owner's ZIP also includes the [verified Ubuntu release archive](../deploy/releases/README.md); this runtime bundle is excluded from Git. Runtime configuration, SQLite files, cookies, API keys and user workspaces are not part of the repository or package. Follow [self-hosting.md](self-hosting.md) to build or deploy a release while preserving existing settings and data.
