CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" varchar(128) PRIMARY KEY,
  "actor_id" varchar(128),
  "action" varchar(255) NOT NULL,
  "resource_type" varchar(100) NOT NULL,
  "resource_id" varchar(255),
  "details" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log" ("action");
CREATE INDEX IF NOT EXISTS "audit_log_resource_type_idx" ON "audit_log" ("resource_type");
