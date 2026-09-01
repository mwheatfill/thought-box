import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";
import { createId } from "./utils";

// ── Enums ──────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["submitter", "owner", "admin"]);

export const userSourceEnum = pgEnum("user_source", ["graph", "login"]);

export const routingTypeEnum = pgEnum("routing_type", ["thoughtbox", "redirect"]);

export const ideaStatusEnum = pgEnum("idea_status", [
	"new",
	"under_review",
	"accepted",
	"declined",
	"redirected",
]);

export const declineReasonEnum = pgEnum("decline_reason", [
	"already_in_progress",
	"not_feasible",
	"not_aligned",
	"not_thoughtbox",
]);

export const impactAreaEnum = pgEnum("impact_area", [
	"cost",
	"time",
	"safety",
	"customer",
	"culture",
]);

export const eventTypeEnum = pgEnum("event_type", [
	"created",
	"status_changed",
	// `reassigned` = the Change Category lever (idea moved between Categories);
	// `assigned` = the Assignment lever (the single Active reviewer changed). Two
	// distinct levers under the category-centric model (ADR-0001/0002).
	"reassigned",
	"assigned",
	"note_added",
	"message",
	"internal_note",
	"communicated",
	"reminder_sent",
	"attachment_added",
	"attachment_deleted",
]);

export const routingOutcomeEnum = pgEnum("routing_outcome", [
	"submitted",
	"redirected",
	"abandoned",
]);

// ── Tables ─────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
	id: varchar("id", { length: 128 }).$defaultFn(createId).primaryKey(),
	entraId: varchar("entra_id", { length: 255 }).notNull().unique(),
	email: varchar("email", { length: 255 }).notNull(),
	displayName: varchar("display_name", { length: 255 }).notNull(),
	department: varchar("department", { length: 255 }),
	jobTitle: varchar("job_title", { length: 255 }),
	officeLocation: varchar("office_location", { length: 255 }),
	managerId: varchar("manager_id", { length: 128 }),
	managerEntraId: varchar("manager_entra_id", { length: 255 }),
	managerDisplayName: varchar("manager_display_name", { length: 255 }),
	photoUrl: varchar("photo_url", { length: 500 }),
	photoLastFetched: timestamp("photo_last_fetched", { withTimezone: true }),
	role: userRoleEnum("role").notNull().default("submitter"),
	source: userSourceEnum("source").notNull().default("login"),
	firstSeen: timestamp("first_seen", { withTimezone: true }),
	active: boolean("active").notNull().default(true),
	profileEnrichedAt: timestamp("profile_enriched_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable("categories", {
	id: varchar("id", { length: 128 }).$defaultFn(createId).primaryKey(),
	name: varchar("name", { length: 255 }).notNull(),
	description: text("description").notNull(),
	routingType: routingTypeEnum("routing_type").notNull(),
	redirectUrl: varchar("redirect_url", { length: 500 }),
	redirectLabel: varchar("redirect_label", { length: 255 }),
	ownerId: varchar("owner_id", { length: 128 }),
	keystoneFields: boolean("keystone_fields").notNull().default(false),
	sortOrder: integer("sort_order").notNull().default(0),
	active: boolean("active").notNull().default(true),
	deletedAt: timestamp("deleted_at", { withTimezone: true }),
	deletedById: varchar("deleted_by_id", { length: 128 }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ideas = pgTable(
	"ideas",
	{
		id: varchar("id", { length: 128 }).$defaultFn(createId).primaryKey(),
		submissionId: varchar("submission_id", { length: 20 }).notNull().unique(),
		title: varchar("title", { length: 500 }).notNull(),
		description: text("description").notNull(),
		expectedBenefit: text("expected_benefit"),
		categoryId: varchar("category_id", { length: 128 }).notNull(),
		impactArea: impactAreaEnum("impact_area"),
		status: ideaStatusEnum("status").notNull().default("new"),
		declineReason: declineReasonEnum("decline_reason"),
		submitterId: varchar("submitter_id", { length: 128 }).notNull(),
		assignedReviewerId: varchar("assigned_reviewer_id", { length: 128 }),
		messageToSubmitter: text("message_to_submitter"),
		slaDueDate: timestamp("sla_due_date", { withTimezone: true }),
		closureSlaDueDate: timestamp("closure_sla_due_date", { withTimezone: true }),
		slaStartedAt: timestamp("sla_started_at", { withTimezone: true }),
		hasBeenReviewed: boolean("has_been_reviewed").notNull().default(false),
		closedAt: timestamp("closed_at", { withTimezone: true }),
		submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
		// Role derivation counts a user's assigned ideas on every request (0023).
	},
	(t) => [index("ideas_assigned_reviewer_idx").on(t.assignedReviewerId)],
);

export const ideaEvents = pgTable("idea_events", {
	id: varchar("id", { length: 128 }).$defaultFn(createId).primaryKey(),
	ideaId: varchar("idea_id", { length: 128 }).notNull(),
	eventType: eventTypeEnum("event_type").notNull(),
	actorId: varchar("actor_id", { length: 128 }).notNull(),
	oldValue: varchar("old_value", { length: 500 }),
	newValue: varchar("new_value", { length: 500 }),
	reason: varchar("reason", { length: 50 }),
	note: text("note"),
	mentions: jsonb("mentions").$type<string[]>(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
	id: varchar("id", { length: 128 }).$defaultFn(createId).primaryKey(),
	ideaId: varchar("idea_id", { length: 128 }),
	userId: varchar("user_id", { length: 128 }).notNull(),
	messages: jsonb("messages").notNull().$type<ConversationMessage[]>(),
	classification: varchar("classification", { length: 255 }),
	routingOutcome: routingOutcomeEnum("routing_outcome"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const keystoneDetails = pgTable("keystone_details", {
	id: varchar("id", { length: 128 }).$defaultFn(createId).primaryKey(),
	ideaId: varchar("idea_id", { length: 128 }).notNull().unique(),
	keystoneCategory: varchar("keystone_category", { length: 255 }),
	currentTime: varchar("current_time", { length: 255 }),
	frequency: varchar("frequency", { length: 255 }),
	painPoint: text("pain_point"),
	estimatedTimeSavings: varchar("estimated_time_savings", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attachments = pgTable("attachments", {
	id: varchar("id", { length: 128 }).$defaultFn(createId).primaryKey(),
	ideaId: varchar("idea_id", { length: 128 }).notNull(),
	messageId: varchar("message_id", { length: 128 }),
	filename: varchar("filename", { length: 500 }).notNull(),
	contentType: varchar("content_type", { length: 255 }).notNull(),
	sizeBytes: integer("size_bytes").notNull(),
	blobName: varchar("blob_name", { length: 500 }).notNull(),
	uploadedById: varchar("uploaded_by_id", { length: 128 }).notNull(),
	isInternal: boolean("is_internal").notNull().default(false),
	deletedAt: timestamp("deleted_at", { withTimezone: true }),
	deletedById: varchar("deleted_by_id", { length: 128 }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailLog = pgTable("email_log", {
	id: varchar("id", { length: 128 }).$defaultFn(createId).primaryKey(),
	recipient: varchar("recipient", { length: 255 }).notNull(),
	subject: varchar("subject", { length: 500 }).notNull(),
	template: varchar("template", { length: 100 }).notNull(),
	ideaId: varchar("idea_id", { length: 128 }),
	status: varchar("status", { length: 20 }).notNull(), // sent, failed, dev_skipped, skipped_placeholder
	error: text("error"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
	id: varchar("id", { length: 128 }).$defaultFn(createId).primaryKey(),
	actorId: varchar("actor_id", { length: 128 }),
	action: varchar("action", { length: 255 }).notNull(),
	resourceType: varchar("resource_type", { length: 100 }).notNull(),
	resourceId: varchar("resource_id", { length: 255 }),
	details: jsonb("details"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
	key: varchar("key", { length: 255 }).primaryKey(),
	value: text("value").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Category Teams: Contributor roster + Idea Watchers ─────────────────────

export const watcherSourceEnum = pgEnum("watcher_source", ["self", "owner_added", "assignment"]);

/** The Contributor roster for a Category (ADR-0002). Roster membership grants the contributor role. */
export const categoryContributors = pgTable(
	"category_contributors",
	{
		id: varchar("id", { length: 128 }).$defaultFn(createId).primaryKey(),
		categoryId: varchar("category_id", { length: 128 }).notNull(),
		userId: varchar("user_id", { length: 128 }).notNull(),
		addedById: varchar("added_by_id", { length: 128 }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("category_contributors_category_user_uniq").on(t.categoryId, t.userId),
		index("category_contributors_user_idx").on(t.userId),
	],
);

/** Per-Idea Watcher subscriptions. `source` records how the subscription was created. */
export const ideaWatchers = pgTable(
	"idea_watchers",
	{
		id: varchar("id", { length: 128 }).$defaultFn(createId).primaryKey(),
		ideaId: varchar("idea_id", { length: 128 }).notNull(),
		userId: varchar("user_id", { length: 128 }).notNull(),
		source: watcherSourceEnum("source").notNull().default("self"),
		addedById: varchar("added_by_id", { length: 128 }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("idea_watchers_idea_user_uniq").on(t.ideaId, t.userId),
		index("idea_watchers_user_idx").on(t.userId),
	],
);

// ── Relations ──────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
	manager: one(users, {
		fields: [users.managerId],
		references: [users.id],
		relationName: "managerRelation",
	}),
	submittedIdeas: many(ideas, { relationName: "submitterRelation" }),
	reviewingIdeas: many(ideas, { relationName: "reviewerRelation" }),
	ownedCategories: many(categories, { relationName: "categoryOwner" }),
	contributorRosters: many(categoryContributors),
	watchedIdeas: many(ideaWatchers),
	events: many(ideaEvents),
	conversations: many(conversations),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
	owner: one(users, {
		fields: [categories.ownerId],
		references: [users.id],
		relationName: "categoryOwner",
	}),
	contributors: many(categoryContributors),
	ideas: many(ideas),
}));

export const ideasRelations = relations(ideas, ({ one, many }) => ({
	category: one(categories, {
		fields: [ideas.categoryId],
		references: [categories.id],
	}),
	submitter: one(users, {
		fields: [ideas.submitterId],
		references: [users.id],
		relationName: "submitterRelation",
	}),
	assignedReviewer: one(users, {
		fields: [ideas.assignedReviewerId],
		references: [users.id],
		relationName: "reviewerRelation",
	}),
	watchers: many(ideaWatchers),
	events: many(ideaEvents),
	conversations: many(conversations),
	keystoneDetails: one(keystoneDetails),
	attachments: many(attachments),
}));

export const categoryContributorsRelations = relations(categoryContributors, ({ one }) => ({
	category: one(categories, {
		fields: [categoryContributors.categoryId],
		references: [categories.id],
	}),
	user: one(users, {
		fields: [categoryContributors.userId],
		references: [users.id],
	}),
}));

export const ideaWatchersRelations = relations(ideaWatchers, ({ one }) => ({
	idea: one(ideas, {
		fields: [ideaWatchers.ideaId],
		references: [ideas.id],
	}),
	user: one(users, {
		fields: [ideaWatchers.userId],
		references: [users.id],
	}),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
	idea: one(ideas, {
		fields: [attachments.ideaId],
		references: [ideas.id],
	}),
	uploadedBy: one(users, {
		fields: [attachments.uploadedById],
		references: [users.id],
	}),
}));

export const ideaEventsRelations = relations(ideaEvents, ({ one }) => ({
	idea: one(ideas, {
		fields: [ideaEvents.ideaId],
		references: [ideas.id],
	}),
	actor: one(users, {
		fields: [ideaEvents.actorId],
		references: [users.id],
	}),
}));

export const conversationsRelations = relations(conversations, ({ one }) => ({
	idea: one(ideas, {
		fields: [conversations.ideaId],
		references: [ideas.id],
	}),
	user: one(users, {
		fields: [conversations.userId],
		references: [users.id],
	}),
}));

export const keystoneDetailsRelations = relations(keystoneDetails, ({ one }) => ({
	idea: one(ideas, {
		fields: [keystoneDetails.ideaId],
		references: [ideas.id],
	}),
}));

// ── Types ──────────────────────────────────────────────────────────────────

export interface ConversationMessage {
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: string;
}
