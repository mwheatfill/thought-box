import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { z } from "zod";
import { db } from "#/server/db";
import { categories, conversations, ideaEvents, ideas, settings, users } from "#/server/db/schema";
import type { ConversationMessage } from "#/server/db/schema";
import {
	sendIdeaAssignedEmail,
	sendIdeaReassignedEmail,
	sendIdeaSubmittedEmail,
	sendStatusChangedEmail,
	sendWatcherAlert,
} from "#/server/functions/email";
import { audit } from "#/server/lib/audit";
import { businessDaysRemaining, calculateSlaDueDate } from "#/server/lib/sla";
import { nextSubmissionId } from "#/server/lib/submission-id";
import { trackEvent } from "#/server/lib/telemetry";
import { authMiddleware, leaderMiddleware } from "#/server/middleware/auth";

const CreateIdeaSchema = z.object({
	title: z.string().min(1),
	description: z.string().min(1),
	categoryId: z.string().min(1),
	expectedBenefit: z.string().optional(),
	impactArea: z.enum(["cost", "time", "safety", "customer", "culture"]).optional(),
	conversationMessages: z
		.array(
			z.object({
				role: z.enum(["user", "assistant", "system"]),
				content: z.string(),
				timestamp: z.string(),
			}),
		)
		.optional(),
});

/**
 * Create a new idea from the AI chat intake.
 * Generates submission ID, calculates SLA, assigns leader, logs event, saves conversation.
 */
export const createIdea = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(CreateIdeaSchema)
	.handler(async ({ context, data }) => {
		const now = new Date();

		// Look up the category to get the default leader
		const category = await db.query.categories.findFirst({
			where: eq(categories.id, data.categoryId),
		});

		if (!category) {
			return { error: "Category not found" };
		}

		// Generate submission ID from PostgreSQL sequence
		const connectionString = process.env.DATABASE_URL;
		if (!connectionString) throw new Error("DATABASE_URL is required");
		const sql = postgres(connectionString, { max: 1 });

		let submissionId: string;
		try {
			submissionId = await nextSubmissionId(sql);
		} finally {
			await sql.end();
		}

		const slaDueDate = calculateSlaDueDate(now);

		// Create the idea
		const [idea] = await db
			.insert(ideas)
			.values({
				submissionId,
				title: data.title,
				description: data.description,
				expectedBenefit: data.expectedBenefit ?? null,
				categoryId: data.categoryId,
				impactArea: data.impactArea ?? null,
				status: "new",
				submitterId: context.user.id,
				assignedLeaderId: category.defaultLeaderId,
				slaDueDate,
				submittedAt: now,
			})
			.returning();

		// Log the created event
		await db.insert(ideaEvents).values({
			ideaId: idea.id,
			eventType: "created",
			actorId: context.user.id,
			newValue: "new",
		});

		// Save the conversation
		if (data.conversationMessages && data.conversationMessages.length > 0) {
			await db.insert(conversations).values({
				ideaId: idea.id,
				userId: context.user.id,
				messages: data.conversationMessages as ConversationMessage[],
				classification: category.name,
				routingOutcome: "submitted",
			});
		}

		// Look up leader + count submitter's ideas for emails
		let assignedLeaderName: string | null = null;
		let leader: { displayName: string; email: string } | null = null;
		if (category.defaultLeaderId) {
			const found = await db.query.users.findFirst({
				where: eq(users.id, category.defaultLeaderId),
				columns: { displayName: true, email: true },
			});
			leader = found ?? null;
			assignedLeaderName = leader?.displayName ?? null;
		}

		const submitterIdeas = await db.query.ideas.findMany({
			where: eq(ideas.submitterId, context.user.id),
			columns: { id: true },
		});

		// Fire-and-forget: send confirmation to submitter
		sendIdeaSubmittedEmail({
			submitterEmail: context.user.email,
			submitterFirstName: context.user.displayName.split(" ")[0],
			submissionId,
			ideaTitle: data.title,
			categoryName: category.name,
			ideaCount: submitterIdeas.length,
		});

		// Fire-and-forget: notify assigned leader
		if (leader) {
			sendIdeaAssignedEmail({
				leaderEmail: leader.email,
				leaderFirstName: leader.displayName.split(" ")[0],
				submissionId,
				ideaTitle: data.title,
				categoryName: category.name,
				submitterName: context.user.displayName,
				submitterDepartment: context.user.department,
			});
		}

		// Fire-and-forget: notify watcher DL (if configured)
		const watcherSetting = await db.query.settings.findFirst({
			where: eq(settings.key, "watcher_email"),
		});
		sendWatcherAlert({
			watcherEmail: watcherSetting?.value?.trim() || null,
			submissionId,
			ideaTitle: data.title,
			ideaDescription: data.description,
			categoryName: category.name,
			submitterName: context.user.displayName,
			submitterDepartment: context.user.department,
			assignedLeaderName,
		});

		trackEvent("IdeaSubmitted", {
			ideaId: idea.id,
			submissionId,
			categoryId: data.categoryId,
			source: "form",
		});

		audit({
			actorId: context.user.id,
			action: "idea.created",
			resourceType: "idea",
			resourceId: idea.submissionId,
			details: { title: data.title, category: category.name, assignedTo: assignedLeaderName },
		});

		return {
			data: {
				id: idea.id,
				submissionId: idea.submissionId,
				title: idea.title,
				categoryName: category.name,
				assignedLeaderName,
			},
		};
	});

// ── Get Idea Detail ───────────────────────────────────────────────────────

export const getIdeaDetail = createServerFn()
	.middleware([authMiddleware])
	.inputValidator(z.object({ submissionId: z.string() }))
	.handler(async ({ context, data }) => {
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.submissionId, data.submissionId),
			with: {
				category: { columns: { name: true } },
				submitter: {
					columns: {
						id: true,
						displayName: true,
						email: true,
						jobTitle: true,
						department: true,
						officeLocation: true,
						managerDisplayName: true,
						photoUrl: true,
					},
				},
				assignedLeader: {
					columns: { id: true, displayName: true, email: true, photoUrl: true },
				},
			},
		});

		if (!idea) {
			throw new Error("Idea not found");
		}

		// Access check: submitters can only see their own ideas
		if (context.user.role === "submitter" && idea.submitterId !== context.user.id) {
			throw new Error("Not found");
		}

		// Leaders can only see ideas assigned to them (admins see all)
		if (context.user.role === "leader" && idea.assignedLeaderId !== context.user.id) {
			throw new Error("Not found");
		}

		// Load activity events
		const events = await db.query.ideaEvents.findMany({
			where: eq(ideaEvents.ideaId, idea.id),
			orderBy: (e, { asc }) => [asc(e.createdAt)],
			with: {
				actor: { columns: { displayName: true, photoUrl: true } },
			},
		});

		const daysRemaining = businessDaysRemaining(idea.slaDueDate);

		return {
			id: idea.id,
			submissionId: idea.submissionId,
			title: idea.title,
			description: idea.description,
			expectedBenefit: idea.expectedBenefit,
			categoryName: idea.category.name,
			categoryId: idea.categoryId,
			impactArea: idea.impactArea,
			status: idea.status,
			rejectionReason: idea.rejectionReason,
			leaderNotes: idea.leaderNotes,
			actionTaken: idea.actionTaken,
			submittedAt: idea.submittedAt.toISOString(),
			slaDueDate: idea.slaDueDate?.toISOString() ?? null,
			slaDaysRemaining: daysRemaining,
			slaStatus:
				daysRemaining === null
					? ("none" as const)
					: daysRemaining <= 0
						? ("overdue" as const)
						: daysRemaining <= 3
							? ("approaching" as const)
							: ("on_track" as const),
			closureSlaDueDate: idea.closureSlaDueDate?.toISOString() ?? null,
			closureSlaDaysRemaining: businessDaysRemaining(idea.closureSlaDueDate),
			submitter: idea.submitter,
			assignedLeader: idea.assignedLeader,
			events: events.map((e) => ({
				id: e.id,
				eventType: e.eventType,
				actorName: e.actor.displayName,
				actorPhotoUrl: e.actor.photoUrl,
				oldValue: e.oldValue,
				newValue: e.newValue,
				note: e.note,
				createdAt: e.createdAt.toISOString(),
			})),
			canEdit:
				context.user.role === "admin" ||
				(context.user.role === "leader" && idea.assignedLeaderId === context.user.id),
		};
	});

// ── Update Idea (Leader/Admin) ────────────────────────────────────────────

const UpdateIdeaSchema = z.object({
	ideaId: z.string(),
	status: z
		.enum(["new", "under_review", "accepted", "in_progress", "implemented", "declined"])
		.optional(),
	rejectionReason: z
		.enum(["already_in_progress", "not_feasible", "not_aligned", "not_thoughtbox"])
		.nullable()
		.optional(),
	leaderNotes: z.string().nullable().optional(),
	actionTaken: z.string().nullable().optional(),
});

export const updateIdea = createServerFn({ method: "POST" })
	.middleware([leaderMiddleware])
	.inputValidator(UpdateIdeaSchema)
	.handler(async ({ context, data }) => {
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, data.ideaId),
			columns: {
				id: true,
				submissionId: true,
				title: true,
				status: true,
				submitterId: true,
				assignedLeaderId: true,
				leaderNotes: true,
			},
			with: {
				submitter: { columns: { email: true, displayName: true } },
			},
		});

		if (!idea) throw new Error("Idea not found");

		// Leaders can only update their own assigned ideas (admins can update any)
		if (context.user.role === "leader" && idea.assignedLeaderId !== context.user.id) {
			throw new Error("Forbidden");
		}

		const updates: Record<string, unknown> = { updatedAt: new Date() };

		if (data.status !== undefined) updates.status = data.status;
		if (data.rejectionReason !== undefined) updates.rejectionReason = data.rejectionReason;
		if (data.leaderNotes !== undefined) updates.leaderNotes = data.leaderNotes;
		if (data.actionTaken !== undefined) updates.actionTaken = data.actionTaken;
		// Track closure
		if (data.status && ["accepted", "implemented", "declined"].includes(data.status)) {
			updates.closedAt = new Date();
		}

		await db.update(ideas).set(updates).where(eq(ideas.id, data.ideaId));

		// Log status change event and send email
		if (data.status && data.status !== idea.status) {
			await db.insert(ideaEvents).values({
				ideaId: data.ideaId,
				eventType: "status_changed",
				actorId: context.user.id,
				oldValue: idea.status,
				newValue: data.status,
			});

			trackEvent("IdeaStatusChanged", {
				ideaId: data.ideaId,
				submissionId: idea.submissionId,
				oldStatus: idea.status,
				newStatus: data.status,
			});

			// Fire-and-forget: notify submitter of status change
			const emailStatuses = ["under_review", "accepted", "declined"] as const;
			if (emailStatuses.includes(data.status as (typeof emailStatuses)[number])) {
				sendStatusChangedEmail({
					submitterEmail: idea.submitter.email,
					submitterFirstName: idea.submitter.displayName.split(" ")[0],
					submissionId: idea.submissionId,
					ideaTitle: idea.title,
					newStatus: data.status as "under_review" | "accepted" | "declined",
					leaderFirstName: context.user.displayName.split(" ")[0],
					leaderNotes: data.leaderNotes ?? idea.leaderNotes ?? null,
					rejectionReason: data.rejectionReason ?? null,
				});
			}
		}

		// Log note event
		if (data.leaderNotes !== undefined && data.leaderNotes !== null) {
			await db.insert(ideaEvents).values({
				ideaId: data.ideaId,
				eventType: "note_added",
				actorId: context.user.id,
				note: data.leaderNotes,
			});
		}

		if (data.status && data.status !== idea.status) {
			audit({
				actorId: context.user.id,
				action: "idea.status_changed",
				resourceType: "idea",
				resourceId: idea.submissionId,
				details: { from: idea.status, to: data.status },
			});
		}

		return { success: true };
	});

// ── Bulk Update Status ────────────────────────────────────────────────────

export const bulkUpdateStatus = createServerFn({ method: "POST" })
	.middleware([leaderMiddleware])
	.inputValidator(
		z.object({
			ideaIds: z.array(z.string()).min(1),
			status: z.enum(["new", "under_review", "accepted", "in_progress", "implemented", "declined"]),
		}),
	)
	.handler(async ({ context, data }) => {
		for (const ideaId of data.ideaIds) {
			const idea = await db.query.ideas.findFirst({
				where: eq(ideas.id, ideaId),
				columns: { id: true, status: true, assignedLeaderId: true },
			});

			if (!idea) continue;
			if (context.user.role === "leader" && idea.assignedLeaderId !== context.user.id) continue;
			if (idea.status === data.status) continue;

			const updates: Record<string, unknown> = { status: data.status, updatedAt: new Date() };
			if (["accepted", "implemented", "declined"].includes(data.status)) {
				updates.closedAt = new Date();
			}

			await db.update(ideas).set(updates).where(eq(ideas.id, ideaId));
			await db.insert(ideaEvents).values({
				ideaId,
				eventType: "status_changed",
				actorId: context.user.id,
				oldValue: idea.status,
				newValue: data.status,
			});
		}

		trackEvent("BulkStatusChanged", { newStatus: data.status }, { count: data.ideaIds.length });

		return { success: true, count: data.ideaIds.length };
	});

// ── Reassign Idea ─────────────────────────────────────────────────────────

export const reassignIdea = createServerFn({ method: "POST" })
	.middleware([leaderMiddleware])
	.inputValidator(z.object({ ideaId: z.string(), newLeaderId: z.string() }))
	.handler(async ({ context, data }) => {
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, data.ideaId),
			columns: {
				id: true,
				submissionId: true,
				title: true,
				assignedLeaderId: true,
				submitterId: true,
			},
			with: {
				category: { columns: { name: true } },
				submitter: { columns: { displayName: true } },
			},
		});

		if (!idea) throw new Error("Idea not found");

		// Leaders can only reassign their own ideas (admins can reassign any)
		if (context.user.role === "leader" && idea.assignedLeaderId !== context.user.id) {
			throw new Error("Forbidden");
		}

		// Look up old and new leaders
		const oldLeader = idea.assignedLeaderId
			? await db.query.users.findFirst({
					where: eq(users.id, idea.assignedLeaderId),
					columns: { displayName: true },
				})
			: null;

		const newLeader = await db.query.users.findFirst({
			where: eq(users.id, data.newLeaderId),
			columns: { id: true, displayName: true, email: true },
		});

		if (!newLeader) throw new Error("Leader not found");

		// Reset SLA and update assignment
		const now = new Date();
		const newSlaDueDate = calculateSlaDueDate(now, 15);
		const newClosureSlaDueDate = calculateSlaDueDate(now, 30);

		await db
			.update(ideas)
			.set({
				assignedLeaderId: data.newLeaderId,
				slaDueDate: newSlaDueDate,
				closureSlaDueDate: newClosureSlaDueDate,
				updatedAt: now,
			})
			.where(eq(ideas.id, data.ideaId));

		// Log reassignment event
		await db.insert(ideaEvents).values({
			ideaId: data.ideaId,
			eventType: "reassigned",
			actorId: context.user.id,
			oldValue: oldLeader?.displayName ?? null,
			newValue: newLeader.displayName,
		});

		// Fire-and-forget: notify new leader
		sendIdeaReassignedEmail({
			leaderEmail: newLeader.email,
			leaderFirstName: newLeader.displayName.split(" ")[0],
			submissionId: idea.submissionId,
			ideaTitle: idea.title,
			categoryName: idea.category.name,
			submitterName: idea.submitter.displayName,
			reassignedByName: context.user.displayName,
		});

		audit({
			actorId: context.user.id,
			action: "idea.reassigned",
			resourceType: "idea",
			resourceId: idea.submissionId,
			details: { from: oldLeader?.displayName, to: newLeader.displayName },
		});

		return { success: true, newLeaderName: newLeader.displayName };
	});

// ── Get Leaders for Reassignment ──────────────────────────────────────────

export const getLeadersForReassign = createServerFn()
	.middleware([leaderMiddleware])
	.handler(async () => {
		return db.query.users.findMany({
			where: (u, { or, eq: e, and }) =>
				and(or(e(u.role, "leader"), e(u.role, "admin")), e(u.active, true)),
			columns: { id: true, displayName: true, role: true },
			orderBy: (u, { asc }) => [asc(u.displayName)],
		});
	});
