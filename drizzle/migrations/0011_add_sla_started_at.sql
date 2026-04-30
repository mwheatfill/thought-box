ALTER TABLE "ideas" ADD COLUMN "sla_started_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "ideas"
SET "sla_started_at" = COALESCE(
  (SELECT MAX("created_at") FROM "idea_events" WHERE "idea_events"."idea_id" = "ideas"."id" AND "event_type" = 'reassigned'),
  "submitted_at"
)
WHERE "sla_started_at" IS NULL;
