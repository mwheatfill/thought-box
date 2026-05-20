-- Workflow refinement:
--   * Drop the legacy `action_taken` column (field removed from product).
--   * Rename `owner_notes` → `message_to_submitter` to free `owner_notes` for a
--     future internal-notes field, and to better describe what this column is
--     (the outbound message that accompanies a status decision).
--   * Rename `rejection_reason` column + enum type → `decline_reason`. The enum
--     *values* are unchanged.
--
-- All operations are metadata-only (no table rewrite, no row updates).
-- Idempotent: re-running is a no-op once applied.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ideas' AND column_name = 'action_taken'
  ) THEN
    ALTER TABLE "ideas" DROP COLUMN "action_taken";
  END IF;
END
$$;

--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ideas' AND column_name = 'owner_notes'
  ) THEN
    ALTER TABLE "ideas" RENAME COLUMN "owner_notes" TO "message_to_submitter";
  END IF;
END
$$;

--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ideas' AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE "ideas" RENAME COLUMN "rejection_reason" TO "decline_reason";
  END IF;
END
$$;

--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'rejection_reason'
  ) THEN
    ALTER TYPE "rejection_reason" RENAME TO "decline_reason";
  END IF;
END
$$;
