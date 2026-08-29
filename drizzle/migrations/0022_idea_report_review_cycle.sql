-- Two review-scored corrections to idea_report (session review findings):
--
-- 1. `review_sla_met` must ignore reviews from BEFORE a reopen: Reopen resets
--    sla_started_at/sla_due_date but the old `→ under_review` event survives,
--    so the previous definition scored every reopened idea permanently on-time.
--    A new `cfr` lateral takes the first Under Review event AT OR AFTER
--    COALESCE(sla_started_at, submitted_at) — the current SLA cycle — matching
--    the app's summarizeReviewCompliance exactly. (`fr`/first_reviewed_at keeps
--    its original all-time meaning for the duration columns.)
--
-- 2. Breach-day alignment: the app treats an idea as overdue ON the due date
--    (businessDaysRemaining <= 0); the view used now() > due, which flips one
--    day later. Both `review_sla_met`'s breach branch and `is_overdue` now use
--    now() >= date_trunc('day', due) so Power BI and the dashboard agree.
--
-- Column names/positions/types unchanged from 0021 (CREATE OR REPLACE VIEW
-- constraint). Hand-authored — apply via direct SQL, same as 0017–0021.

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
      AND now() >= date_trunc('day', i.closure_sla_due_date) THEN false
    ELSE NULL
  END                                           AS sla_met,
  (i.status IN ('new','under_review') AND i.sla_due_date IS NOT NULL
    AND now() >= date_trunc('day', i.sla_due_date))                                            AS is_overdue,
  -- Counts (assignment accuracy = improper_assignment_count > 0)
  COALESCE(ev.reassignment_count, 0)            AS reassignment_count,
  COALESCE(ev.improper_assignment_count, 0)     AS improper_assignment_count,
  COALESCE(ev.message_count, 0)                 AS message_count,
  COALESCE(ev.reminder_count, 0)                AS reminder_count,
  -- Time grouping helpers
  extract(year FROM i.submitted_at)::int        AS submitted_year,
  to_char(i.submitted_at, 'YYYY-MM')            AS submitted_month,
  -- Appended in 0021
  i.closure_sla_due_date,
  -- Mirrors the in-app dashboard's review compliance exactly: first review in
  -- the CURRENT SLA cycle (cfr), direct closes fall back to closed_at, and a
  -- still-New idea breaches from the start of its due date's day.
  CASE
    WHEN COALESCE(cfr.first_reviewed_at, CASE WHEN i.status <> 'new' THEN i.closed_at END) IS NOT NULL
      THEN (i.sla_due_date IS NULL
        OR COALESCE(cfr.first_reviewed_at, i.closed_at) <= i.sla_due_date)
    WHEN i.status = 'new' AND i.sla_due_date IS NOT NULL
      AND now() >= date_trunc('day', i.sla_due_date) THEN false
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
  SELECT MIN(created_at) AS first_reviewed_at
  FROM idea_events e
  WHERE e.idea_id = i.id AND e.event_type = 'status_changed' AND e.new_value = 'under_review'
    AND e.created_at >= COALESCE(i.sla_started_at, i.submitted_at)
) cfr ON true
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
