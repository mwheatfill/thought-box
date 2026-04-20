import { relations } from "drizzle-orm";
import {
	boolean,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { createId } from "./utils";

// ── Enums ──────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["submitter", "leader", "admin"]);

export const userSourceEnum = pgEnum("user_source", ["graph", "login"]);

export const routingTypeEnum = pgEnum("routing_type", ["thoughtbox", "redirect"]);

export const ideaStatusEnum = pgEnum("idea_status", [
	"new",
	"under_review",
	"accepted",
	"declined",
	"redirected",
]);

export const rejectionReasonEnum = pgEnum("rejection_reason", [
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
	"reassigned",
	"note_added",
	"message",
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
	defaultLeaderId: varchar("default_leader_id", { length: 128 }),
	keystoneFields: boolean("keystone_fields").notNull().default(false),
	sortOrder: integer("sort_order").notNull().default(0),
	active: boolean("active").notNull().default(true),
	deletedAt: timestamp("deleted_at", { withTimezone: true }),
	deletedById: varchar("deleted_by_id", { length: 128 }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ideas = pgTable("ideas", {
	id: varchar("id", { length: 128 }).$defaultFn(createId).primaryKey(),
	submissionId: varchar("submission_id", { length: 20 }).notNull().unique(),
	title: varchar("title", { length: 500 }).notNull(),
	description: text("description").notNull(),
	expectedBenefit: text("expected_benefit"),
	categoryId: varchar("category_id", { length: 128 }).notNull(),
	impactArea: impactAreaEnum("impact_area"),
	status: ideaStatusEnum("status").notNull().default("new"),
	rejectionReason: rejectionReasonEnum("rejection_reason"),
	submitterId: varchar("submitter_id", { length: 128 }).notNull(),
	assignedLeaderId: varchar("assigned_leader_id", { length: 128 }),
	leaderNotes: text("leader_notes"),
	actionTaken: varchar("action_taken", { length: 255 }),
	slaDueDate: timestamp("sla_due_date", { withTimezone: true }),
	closureSlaDueDate: timestamp("closure_sla_due_date", { withTimezone: true }),
	closedAt: timestamp("closed_at", { withTimezone: true }),
	submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ideaEvents = pgTable("idea_events", {
	id: varchar("id", { length: 128 }).$defaultFn(createId).primaryKey(),
	ideaId: varchar("idea_id", { length: 128 }).notNull(),
	eventType: eventTypeEnum("event_type").notNull(),
	actorId: varchar("actor_id", { length: 128 }).notNull(),
	oldValue: varchar("old_value", { length: 500 }),
	newValue: varchar("new_value", { length: 500 }),
	note: text("note"),
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
	status: varchar("status", { length: 20 }).notNull(), // sent, failed, dev_skipped
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

// ── Relations ──────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
	manager: one(users, {
		fields: [users.managerId],
		references: [users.id],
		relationName: "managerRelation",
	}),
	submittedIdeas: many(ideas, { relationName: "submitterRelation" }),
	assignedIdeas: many(ideas, { relationName: "leaderRelation" }),
	events: many(ideaEvents),
	conversations: many(conversations),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
	defaultLeader: one(users, {
		fields: [categories.defaultLeaderId],
		references: [users.id],
	}),
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
	assignedLeader: one(users, {
		fields: [ideas.assignedLeaderId],
		references: [users.id],
		relationName: "leaderRelation",
	}),
	events: many(ideaEvents),
	conversations: many(conversations),
	keystoneDetails: one(keystoneDetails),
	attachments: many(attachments),
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
