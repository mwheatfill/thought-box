-- Align idea_report's SLA columns with the dual-SLA model (ledger row 48):
--
-- * `sla_met` previously compared closed_at to sla_due_date — the 15-business-day
--   REVIEW deadline — which is neither the review metric nor a closure metric.
--   It now means "closed within the 30-day CLOSURE SLA": TRUE/FALSE once closed,
--   FALSE while open and already past the closure due date (a breach in
--   progress), NULL while open with time remaining.
-- * `closure_sla_due_date` is exposed so date-column math is possible. Power BI
--   must use this column, never submitted_at + 30 — the closure clock resets on
--   Change Category and Reopen, and only the stored due date reflects that.
-- * `review_sla_met` mirrors the in-app dashboard compliance metric
--   (summarizeReviewCompliance): first move to Under Review (direct closes use
--   closed_at) within sla_due_date; still-New-past-due counts as FALSE; NULL
--   when the review clock hasn't concluded.
--
-- CREATE OR REPLACE VIEW only permits appending columns, so the new columns sit
-- at the end and every pre-existing column keeps its position and type.
--
-- Hand-authored (Drizzle doesn't manage views) — apply via direct SQL, same as
-- 0017–0020.

CREATE OR REPLACE VIEW idea_report AS
SELECT
  i.id                                          AS idea_id,
  i.submission_id,
  i.title,
  -- Dimensions
  i.category_id,
  c.name                                        AS category_name,
  c.owner_id,
  owner_u.display_name                          AS owner_name,
  COALESCE(i.assigned_reviewer_id, c.owner_id)  AS active_reviewer_id,
  reviewer_u.display_name                       AS active_reviewer_name,
  (i.assigned_reviewer_id IS NOT NULL)          AS is_delegated,
  i.submitter_id,
  sub_u.display_name                            AS submitter_name,
  sub_u.department                              AS submitter_department,
  i.impact_area,
  i.status,
  CASE WHEN i.status IN ('accepted','declined','redirected') THEN i.status::text ELSE 'open' END AS outcome,
  i.decline_reason,
  -- Lifecycle timestamps
  i.submitted_at,
  fr.first_reviewed_at,
  i.closed_at,
  la.last_activity_at,
  -- Durations (calendar + business days)
  CASE WHEN i.closed_at IS NOT NULL
    THEN round((extract(epoch FROM (i.closed_at - i.submitted_at)) / 86400.0)::numeric, 2) END AS calendar_days_to_close,
  CASE WHEN i.closed_at IS NOT NULL
    THEN business_days_between(i.submitted_at, i.closed_at) END                                 AS business_days_to_close,
  CASE WHEN fr.first_reviewed_at IS NOT NULL
    THEN round((extract(epoch FROM (fr.first_reviewed_at - i.submitted_at)) / 86400.0)::numeric, 2) END AS calendar_days_to_first_review,
  CASE WHEN fr.first_reviewed_at IS NOT NULL
    THEN business_days_between(i.submitted_at, fr.first_reviewed_at) END                        AS business_days_to_first_review,
  -- SLA (review due date; closure columns appended below)
  i.sla_due_date,
  -- "SLA met" = the 30-day CLOSURE SLA (row 48). NULL while open with time left.
  CASE
    WHEN i.closed_at IS NOT NULL THEN (i.closed_at <= i.closure_sla_due_date)
    WHEN i.status IN ('new','under_review')
      AND i.closure_sla_due_date IS NOT NULL
      AND now() > i.closure_sla_due_date THEN false
    ELSE NULL
  END                                           AS sla_met,
  (i.status IN ('new','under_review') AND i.sla_due_date IS NOT NULL AND now() > i.sla_due_date) AS is_overdue,
  -- Counts (assignment accuracy = improper_assignment_count > 0)
  COALESCE(ev.reassignment_count, 0)            AS reassignment_count,
  COALESCE(ev.improper_assignment_count, 0)     AS improper_assignment_count,
  COALESCE(ev.message_count, 0)                 AS message_count,
  COALESCE(ev.reminder_count, 0)                AS reminder_count,
  -- Time grouping helpers
  extract(year FROM i.submitted_at)::int        AS submitted_year,
  to_char(i.submitted_at, 'YYYY-MM')            AS submitted_month,
  -- Appended (CREATE OR REPLACE VIEW can only add at the end)
  i.closure_sla_due_date,
  -- Mirrors the in-app dashboard's review compliance exactly.
  CASE
    WHEN COALESCE(fr.first_reviewed_at, CASE WHEN i.status <> 'new' THEN i.closed_at END) IS NOT NULL
      THEN (i.sla_due_date IS NULL
        OR COALESCE(fr.first_reviewed_at, i.closed_at) <= i.sla_due_date)
    WHEN i.status = 'new' AND i.sla_due_date IS NOT NULL AND now() > i.sla_due_date THEN false
    ELSE NULL
  END                                           AS review_sla_met
FROM ideas i
LEFT JOIN categories c     ON i.category_id = c.id
LEFT JOIN users owner_u    ON c.owner_id = owner_u.id
LEFT JOIN users reviewer_u ON COALESCE(i.assigned_reviewer_id, c.owner_id) = reviewer_u.id
LEFT JOIN users sub_u      ON i.submitter_id = sub_u.id
LEFT JOIN LATERAL (
  SELECT MIN(created_at) AS first_reviewed_at
  FROM idea_events e
  WHERE e.idea_id = i.id AND e.event_type = 'status_changed' AND e.new_value = 'under_review'
) fr ON true
LEFT JOIN LATERAL (
  SELECT MAX(created_at) AS last_activity_at FROM idea_events e WHERE e.idea_id = i.id
) la ON true
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE event_type = 'reassigned')                                       AS reassignment_count,
    count(*) FILTER (WHERE event_type = 'reassigned' AND reason = 'improperly_assigned')    AS improper_assignment_count,
    count(*) FILTER (WHERE event_type = 'message')                                          AS message_count,
    count(*) FILTER (WHERE event_type = 'reminder_sent')                                    AS reminder_count
  FROM idea_events e WHERE e.idea_id = i.id
) ev ON true;
