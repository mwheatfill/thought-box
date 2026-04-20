-- Migrate existing ideas with removed statuses to "accepted"
UPDATE "ideas" SET "status" = 'accepted' WHERE "status" IN ('in_progress', 'implemented');

-- PostgreSQL doesn't support DROP VALUE from enums directly.
-- We need to: create new enum, alter column, drop old enum, rename new.
ALTER TYPE "idea_status" RENAME TO "idea_status_old";

CREATE TYPE "idea_status" AS ENUM('new', 'under_review', 'accepted', 'declined', 'redirected');

ALTER TABLE "ideas" ALTER COLUMN "status" TYPE "idea_status" USING "status"::text::"idea_status";

DROP TYPE "idea_status_old";
