-- Internal notes: owner/admin-only thread on an idea, separate from the
-- submitter-facing Messages thread. Stored in idea_events with the new
-- `internal_note` event type. Mentions of other owners are captured in a
-- jsonb array of user IDs so mention notifications can fire without
-- re-parsing the note text.
--
-- All operations are metadata-only.
-- Idempotent: re-running is a no-op once applied.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'event_type' AND e.enumlabel = 'internal_note'
  ) THEN
    ALTER TYPE "event_type" ADD VALUE 'internal_note';
  END IF;
END
$$;

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'idea_events' AND column_name = 'mentions'
  ) THEN
    ALTER TABLE "idea_events" ADD COLUMN "mentions" jsonb;
  END IF;
END
$$;
