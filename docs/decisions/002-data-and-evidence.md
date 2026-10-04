# ADR 002: Immutable snapshots and separate human evidence

Status: accepted for v0.1.

Store bounded prediction bundles and computed evaluations as immutable JSON snapshots in a relational workspace envelope. Content SHA-256 identifies exact inputs; random run IDs identify separate policy snapshots. Preserve source and parent-run provenance.

Review dispositions and notes live in a separate table keyed by workspace/run/record. They never replace reference labels or feed model fitting implicitly. Reports include both original benchmark evidence and review evidence. The current policy is explicitly recomputed for an exploratory export.

Trade-off: policy snapshots duplicate data. This is acceptable at 2,000 records and 30 runs/workspace, but object-backed datasets and normalized policy tables are the path for larger workloads.
