CREATE TRIGGER enforce_workspace_run_quota
BEFORE INSERT ON runs
WHEN (SELECT COUNT(*) FROM runs WHERE workspace_id=NEW.workspace_id) >= 30
BEGIN
  SELECT RAISE(ABORT, 'workspace run quota exceeded');
END;
