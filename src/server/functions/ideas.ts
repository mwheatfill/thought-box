import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { z } from "zod";
import { db } from "#/server/db";
import { categories, conversations, ideaEvents, ideas, users } from "#/server/db/schema";
import type { ConversationMessage } from "#/server/db/schema";
import { businessDaysRemaining, calculateSlaDueDate } from "#/server/lib/sla";
import { nextSubmissionId } from "#/server/lib/submission-id";
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

		// Look up the assigned leader's name for the confirmation message
		let assignedLeaderName: string | null = null;
		if (category.defaultLeaderId) {
			const leader = await db.query.users.findFirst({
				where: eq(users.id, category.defaultLeaderId),
				columns: { displayName: true },
			});
			assignedLeaderName = leader?.displayName ?? null;
		}

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
	.inputValidator(z.object({ ideaId: z.string() }))
	.handler(async ({ context, data }) => {
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, data.ideaId),
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
				actor: { columns: { displayName: true } },
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
			jiraTicketNumber: idea.jiraTicketNumber,
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
			submitter: idea.submitter,
			assignedLeader: idea.assignedLeader,
			events: events.map((e) => ({
				id: e.id,
				eventType: e.eventType,
				actorName: e.actor.displayName,
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
	jiraTicketNumber: z.string().nullable().optional(),
});

export const updateIdea = createServerFn({ method: "POST" })
	.middleware([leaderMiddleware])
	.inputValidator(UpdateIdeaSchema)
	.handler(async ({ context, data }) => {
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, data.ideaId),
			columns: { id: true, status: true, assignedLeaderId: true },
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
		if (data.jiraTicketNumber !== undefined) updates.jiraTicketNumber = data.jiraTicketNumber;

		// Track closure
		if (data.status && ["accepted", "implemented", "declined"].includes(data.status)) {
			updates.closedAt = new Date();
		}

		await db.update(ideas).set(updates).where(eq(ideas.id, data.ideaId));

		// Log status change event
		if (data.status && data.status !== idea.status) {
			await db.insert(ideaEvents).values({
				ideaId: data.ideaId,
				eventType: "status_changed",
				actorId: context.user.id,
				oldValue: idea.status,
				newValue: data.status,
			});
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

		return { success: true };
	});
