# Database

D1 uses SQLite. Local Docker/dev uses Wrangler's persisted SQLite-backed D1 emulator. Schema lives in `db/schema.ts`; generated SQL is in `drizzle/`.

| Table      | Key data                                                | Boundary                                     |
| ---------- | ------------------------------------------------------- | -------------------------------------------- |
| workspaces | UUID, name, created_at                                  | Isolation unit                               |
| sessions   | hashed token, workspace, expires_at                     | Seven-day browser capability                 |
| api_keys   | hashed token, workspace                                 | One active programmatic capability           |
| runs       | UUID, workspace, dataset hash, JSON payload, created_at | Immutable data/evaluation/policy snapshot    |
| reviews    | workspace, run, record, disposition, note, timestamp    | Unique per workspace/run/record              |
| audit      | workspace, action, safe detail, timestamp               | Operational trace, not a tamper-proof ledger |
| counters   | bucket key, count, expiry                               | Atomic fixed-window limiting                 |

Prepared SQL binds all external values. Queries for runs/reviews/audit always bind a resolved workspace. Indexes cover workspace + created_at, review lookup and expiry cleanup. A generated custom migration installs the per-workspace run-quota trigger, closing the concurrent count-then-insert race.

Run payloads duplicate records to keep this bounded demo simple and reproducible. Stored snapshots preserve source and parent-run provenance. A later design should normalize large immutable datasets into object storage and reference them from smaller policy records.

Mutating API keys, policy snapshots and review records includes audit inserts in the same D1 batch. Expired rate counters and sessions are cleaned on requests. Persistent run/review retention and backups are operator responsibilities in this release. Do not use an ephemeral filesystem for the Docker volume.

Generate migrations with `pnpm db:generate`; inspect SQL before applying. `pnpm db:migrate` applies local migrations only. Never rewrite an already-deployed migration; append the next migration and retain its Drizzle journal/snapshot.
