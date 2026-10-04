import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("idx_sessions_expiry").on(t.expiresAt)],
);
export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    datasetHash: text("dataset_hash").notNull(),
    payload: text("payload").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_runs_workspace_created").on(t.workspaceId, t.createdAt)],
);
export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    runId: text("run_id").notNull(),
    recordId: text("record_id").notNull(),
    decision: text("decision").notNull(),
    note: text("note").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_reviews_workspace_record").on(
      t.workspaceId,
      t.runId,
      t.recordId,
    ),
  ],
);
export const audit = sqliteTable(
  "audit",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    action: text("action").notNull(),
    detail: text("detail").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_audit_workspace_created").on(t.workspaceId, t.createdAt)],
);
export const apiKeys = sqliteTable(
  "api_keys",
  {
    tokenHash: text("token_hash").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_api_keys_workspace").on(t.workspaceId)],
);
export const counters = sqliteTable(
  "counters",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("idx_counters_expiry").on(t.expiresAt)],
);
