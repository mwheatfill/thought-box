-- Rename "Leader" → "Owner" across the schema.
-- All operations are metadata-only (no table rewrite, no row updates).
-- Idempotent: re-running is a no-op once applied.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'leader'
  ) THEN
    ALTER TYPE "user_role" RENAME VALUE 'leader' TO 'owner';
  END IF;
END
$$;

--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ideas' AND column_name = 'assigned_leader_id'
  ) THEN
    ALTER TABLE "ideas" RENAME COLUMN "assigned_leader_id" TO "assigned_owner_id";
  END IF;
END
$$;

--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ideas' AND column_name = 'leader_notes'
  ) THEN
    ALTER TABLE "ideas" RENAME COLUMN "leader_notes" TO "owner_notes";
  END IF;
END
$$;

--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'default_leader_id'
  ) THEN
    ALTER TABLE "categories" RENAME COLUMN "default_leader_id" TO "default_owner_id";
  END IF;
END
$$;
