-- Category-centric ownership (#3): derive Owner from Category, Contributor roster, Watchers.
-- Hand-authored: drizzle-kit generate needs a TTY to disambiguate the column renames.

ALTER TABLE "categories" RENAME COLUMN "default_owner_id" TO "owner_id";
--> statement-breakpoint
ALTER TABLE "ideas" RENAME COLUMN "assigned_owner_id" TO "assigned_reviewer_id";
--> statement-breakpoint
CREATE TYPE "public"."watcher_source" AS ENUM('self', 'owner_added', 'assignment');
--> statement-breakpoint
CREATE TABLE "category_contributors" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"category_id" varchar(128) NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"added_by_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_watchers" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"idea_id" varchar(128) NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"source" "watcher_source" DEFAULT 'self' NOT NULL,
	"added_by_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "category_contributors_category_user_uniq" ON "category_contributors" ("category_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "idea_watchers_idea_user_uniq" ON "idea_watchers" ("idea_id","user_id");
--> statement-breakpoint
CREATE INDEX "category_contributors_user_idx" ON "category_contributors" ("user_id");
--> statement-breakpoint
CREATE INDEX "idea_watchers_user_idx" ON "idea_watchers" ("user_id");
