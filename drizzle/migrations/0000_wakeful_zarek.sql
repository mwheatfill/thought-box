CREATE TYPE "public"."event_type" AS ENUM('created', 'status_changed', 'reassigned', 'note_added', 'message', 'communicated');--> statement-breakpoint
CREATE TYPE "public"."idea_status" AS ENUM('new', 'under_review', 'accepted', 'in_progress', 'implemented', 'declined', 'redirected');--> statement-breakpoint
CREATE TYPE "public"."impact_area" AS ENUM('cost', 'time', 'safety', 'customer', 'culture');--> statement-breakpoint
CREATE TYPE "public"."rejection_reason" AS ENUM('already_in_progress', 'not_feasible', 'not_aligned', 'not_thoughtbox');--> statement-breakpoint
CREATE TYPE "public"."routing_outcome" AS ENUM('submitted', 'redirected', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."routing_type" AS ENUM('thoughtbox', 'redirect');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('submitter', 'leader', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_source" AS ENUM('graph', 'login');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"routing_type" "routing_type" NOT NULL,
	"redirect_url" varchar(500),
	"redirect_label" varchar(255),
	"default_leader_id" varchar(128),
	"keystone_fields" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"idea_id" varchar(128),
	"user_id" varchar(128) NOT NULL,
	"messages" jsonb NOT NULL,
	"classification" varchar(255),
	"routing_outcome" "routing_outcome",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_events" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"idea_id" varchar(128) NOT NULL,
	"event_type" "event_type" NOT NULL,
	"actor_id" varchar(128) NOT NULL,
	"old_value" varchar(500),
	"new_value" varchar(500),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"submission_id" varchar(20) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text NOT NULL,
	"expected_benefit" text,
	"category_id" varchar(128) NOT NULL,
	"impact_area" "impact_area",
	"status" "idea_status" DEFAULT 'new' NOT NULL,
	"rejection_reason" "rejection_reason",
	"submitter_id" varchar(128) NOT NULL,
	"assigned_leader_id" varchar(128),
	"leader_notes" text,
	"action_taken" varchar(255),
	"jira_ticket_number" varchar(50),
	"sla_due_date" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ideas_submission_id_unique" UNIQUE("submission_id")
);
--> statement-breakpoint
CREATE TABLE "keystone_details" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"idea_id" varchar(128) NOT NULL,
	"keystone_category" varchar(255),
	"current_time" varchar(255),
	"frequency" varchar(255),
	"pain_point" text,
	"estimated_time_savings" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keystone_details_idea_id_unique" UNIQUE("idea_id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"entra_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"department" varchar(255),
	"job_title" varchar(255),
	"office_location" varchar(255),
	"manager_id" varchar(128),
	"manager_entra_id" varchar(255),
	"manager_display_name" varchar(255),
	"photo_url" varchar(500),
	"photo_last_fetched" timestamp with time zone,
	"role" "user_role" DEFAULT 'submitter' NOT NULL,
	"source" "user_source" DEFAULT 'login' NOT NULL,
	"first_seen" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"profile_enriched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_entra_id_unique" UNIQUE("entra_id")
);
