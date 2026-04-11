-- Add soft delete columns to categories
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "deleted_by_id" varchar(128);

-- Add soft delete columns to attachments
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "deleted_by_id" varchar(128);

-- Add new event types
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'attachment_added';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'attachment_deleted';
