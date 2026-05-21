-- Adds an is_internal flag to attachments so owners can mark direct
-- Attachments-tab uploads as owner/admin-only. Previously, visibility was
-- derived solely from the parent event type (internal_note → private); this
-- column lets idea-level uploads (no parent event) also be private.
--
-- Idempotent: re-running is a no-op once applied.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attachments' AND column_name = 'is_internal'
  ) THEN
    ALTER TABLE "attachments" ADD COLUMN "is_internal" boolean NOT NULL DEFAULT false;
  END IF;
END
$$;
