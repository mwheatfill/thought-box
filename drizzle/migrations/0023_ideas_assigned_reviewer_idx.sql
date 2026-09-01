-- Role derivation now counts a user's assigned ideas on every request
-- (assignment confers the Owner role — 2026-09-01 prod incident fix), so the
-- assigned_reviewer_id lookup needs an index. Idempotent.
CREATE INDEX IF NOT EXISTS "ideas_assigned_reviewer_idx" ON "ideas" ("assigned_reviewer_id");
