-- Run with a maintenance identity before DatabaseService.Migrate.
-- Keep identifiers case-sensitive, matching the original SQLite record-ID semantics.
CREATE DATABASE IF NOT EXISTS marginloom CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
ALTER DATABASE marginloom CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
