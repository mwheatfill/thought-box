CREATE TABLE IF NOT EXISTS "attachments" (
  "id" varchar(128) PRIMARY KEY,
  "idea_id" varchar(128) NOT NULL,
  "message_id" varchar(128),
  "filename" varchar(500) NOT NULL,
  "content_type" varchar(255) NOT NULL,
  "size_bytes" integer NOT NULL,
  "blob_name" varchar(500) NOT NULL,
  "uploaded_by_id" varchar(128) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "attachments_idea_id_idx" ON "attachments" ("idea_id");
