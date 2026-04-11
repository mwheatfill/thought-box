CREATE TABLE IF NOT EXISTS "email_log" (
  "id" varchar(128) PRIMARY KEY,
  "recipient" varchar(255) NOT NULL,
  "subject" varchar(500) NOT NULL,
  "template" varchar(100) NOT NULL,
  "idea_id" varchar(128),
  "status" varchar(20) NOT NULL,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "email_log_created_at_idx" ON "email_log" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "email_log_status_idx" ON "email_log" ("status");
