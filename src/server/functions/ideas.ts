import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	CLOSED_STATUSES,
	REASSIGNMENT_REASONS,
	REVIEWED_STATUSES,
	type ReassignmentReason,
} from "#/lib/constants";
import { db, sql } from "#/server/db";
import { categories, conversations, ideaEvents, ideas, settings, users } from "#/server/db/schema";
import type { ConversationMessage } from "#/server/db/schema";
import {
	sendIdeaAssignedEmail,
	sendIdeaReassignedEmail,
	sendIdeaReassignedSubmitterEmail,
	sendIdeaSubmittedEmail,
	sendStatusChangedEmail,
	sendWatcherAlert,
} from "#/server/functions/email";
import { audit } from "#/server/lib/audit";
import { anonymizeActorName, shouldShowOwner } from "#/server/lib/owner-visibility";
import { businessDaysRemaining, calculateSlaDueDate, calculateSlaStatus } from "#/server/lib/sla";
import { nextSubmissionId } from "#/server/lib/submission-id";
import { trackEvent } from "#/server/lib/telemetry";
import { authMiddleware, ownerMiddleware } from "#/server/middleware/auth";

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
 * Generates submission ID, calculates SLA, assigns owner, logs event, saves conversation.
 */
export const createIdea = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(CreateIdeaSchema)
	.handler(async ({ context, data }) => {
		const now = new Date();

		// Look up the category to get the default owner
		const category = await db.query.categories.findFirst({
			where: eq(categories.id, data.categoryId),
		});

		if (!category) {
			return { error: "Category not found" };
		}

		// Generate submission ID from PostgreSQL sequence (reuses connection pool)
		const submissionId = await nextSubmissionId(sql);

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
				assignedOwnerId: category.defaultOwnerId,
				slaDueDate,
				closureSlaDueDate: calculateSlaDueDate(now, 30),
				slaStartedAt: now,
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

		// Look up owner + count submitter's ideas for emails
		let assignedOwnerName: string | null = null;
		let owner: { displayName: string; email: string } | null = null;
		if (category.defaultOwnerId) {
			const found = await db.query.users.findFirst({
				where: eq(users.id, category.defaultOwnerId),
				columns: { displayName: true, email: true },
			});
			owner = found ?? null;
			assignedOwnerName = owner?.displayName ?? null;
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

		// Fire-and-forget: notify assigned owner
		if (owner) {
			sendIdeaAssignedEmail({
				ownerEmail: owner.email,
				ownerFirstName: owner.displayName.split(" ")[0],
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
			assignedOwnerName,
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
			details: { title: data.title, category: category.name, assignedTo: assignedOwnerName },
		});

		return {
			data: {
				id: idea.id,
				submissionId: idea.submissionId,
				title: idea.title,
				categoryName: category.name,
				assignedOwnerName,
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
				assignedOwner: {
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

		// Owners can only see ideas assigned to them (admins see all)
		if (context.user.role === "owner" && idea.assignedOwnerId !== context.user.id) {
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
		const showOwner = shouldShowOwner(context.user.role, idea.hasBeenReviewed);

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
			ownerNotes: idea.ownerNotes,
			actionTaken: idea.actionTaken,
			submittedAt: idea.submittedAt.toISOString(),
			closedAt: idea.closedAt?.toISOString() ?? null,
			slaDueDate: idea.slaDueDate?.toISOString() ?? null,
			slaDaysRemaining: daysRemaining,
			slaStatus: calculateSlaStatus(idea.status, daysRemaining),
			closureSlaDueDate: idea.closureSlaDueDate?.toISOString() ?? null,
			closureSlaDaysRemaining: businessDaysRemaining(idea.closureSlaDueDate),
			submitter: idea.submitter,
			assignedOwner: showOwner ? idea.assignedOwner : null,
			events: events.map((e) => {
				const redactReassign = e.eventType === "reassigned" && !showOwner;
				return {
					id: e.id,
					eventType: e.eventType,
					actorId: e.actorId,
					actorName: anonymizeActorName(
						e.actor.displayName,
						e.actorId,
						idea.assignedOwnerId,
						context.user.role,
						idea.hasBeenReviewed,
					),
					actorPhotoUrl: showOwner || e.actorId !== idea.assignedOwnerId ? e.actor.photoUrl : null,
					oldValue: redactReassign ? null : e.oldValue,
					newValue: redactReassign ? null : e.newValue,
					reason: redactReassign ? null : e.reason,
					note: redactReassign ? null : e.note,
					createdAt: e.createdAt.toISOString(),
				};
			}),
			canEdit:
				context.user.role === "admin" ||
				(context.user.role === "owner" && idea.assignedOwnerId === context.user.id),
		};
	});

// ── Update Idea (Owner/Admin) ────────────────────────────────────────────

const UpdateIdeaSchema = z.object({
	ideaId: z.string(),
	status: z.enum(["new", "under_review", "accepted", "declined"]).optional(),
	rejectionReason: z
		.enum(["already_in_progress", "not_feasible", "not_aligned", "not_thoughtbox"])
		.nullable()
		.optional(),
	ownerNotes: z.string().nullable().optional(),
	actionTaken: z.string().nullable().optional(),
});

export const updateIdea = createServerFn({ method: "POST" })
	.middleware([ownerMiddleware])
	.inputValidator(UpdateIdeaSchema)
	.handler(async ({ context, data }) => {
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, data.ideaId),
			columns: {
				id: true,
				submissionId: true,
				title: true,
				status: true,
				hasBeenReviewed: true,
				submitterId: true,
				assignedOwnerId: true,
				ownerNotes: true,
			},
			with: {
				submitter: { columns: { email: true, displayName: true } },
			},
		});

		if (!idea) throw new Error("Idea not found");

		// Owners can only update their own assigned ideas (admins can update any)
		if (context.user.role === "owner" && idea.assignedOwnerId !== context.user.id) {
			throw new Error("Forbidden");
		}

		// Closed ideas are locked. UI hides the edit form, but enforce server-side
		// too so direct API calls can't bypass the lock.
		if ((CLOSED_STATUSES as readonly string[]).includes(idea.status)) {
			throw new Error("This idea is closed and locked. No further edits are allowed.");
		}

		const updates: Record<string, unknown> = { updatedAt: new Date() };

		if (data.status !== undefined) updates.status = data.status;
		if (data.rejectionReason !== undefined) updates.rejectionReason = data.rejectionReason;
		if (data.ownerNotes !== undefined) updates.ownerNotes = data.ownerNotes;
		if (data.actionTaken !== undefined) updates.actionTaken = data.actionTaken;
		// Track when idea enters active review (for owner anonymity)
		if (data.status && (REVIEWED_STATUSES as readonly string[]).includes(data.status)) {
			updates.hasBeenReviewed = true;
		}
		// Track closure
		if (data.status && (CLOSED_STATUSES as readonly string[]).includes(data.status)) {
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
				// Owner is visible if idea has been (or is being) reviewed
				const ownerVisible =
					idea.hasBeenReviewed || (REVIEWED_STATUSES as readonly string[]).includes(data.status);
				sendStatusChangedEmail({
					submitterEmail: idea.submitter.email,
					submitterFirstName: idea.submitter.displayName.split(" ")[0],
					submissionId: idea.submissionId,
					ideaTitle: idea.title,
					newStatus: data.status as "under_review" | "accepted" | "declined",
					ownerFirstName: ownerVisible ? context.user.displayName.split(" ")[0] : "Your reviewer",
					ownerNotes: data.ownerNotes ?? idea.ownerNotes ?? null,
					rejectionReason: data.rejectionReason ?? null,
				});
			}
		}

		// Log note event
		if (data.ownerNotes !== undefined && data.ownerNotes !== null) {
			await db.insert(ideaEvents).values({
				ideaId: data.ideaId,
				eventType: "note_added",
				actorId: context.user.id,
				note: data.ownerNotes,
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
	.middleware([ownerMiddleware])
	.inputValidator(
		z.object({
			ideaIds: z.array(z.string()).min(1),
			status: z.enum(["new", "under_review", "accepted", "declined"]),
		}),
	)
	.handler(async ({ context, data }) => {
		for (const ideaId of data.ideaIds) {
			const idea = await db.query.ideas.findFirst({
				where: eq(ideas.id, ideaId),
				columns: { id: true, status: true, assignedOwnerId: true },
			});

			if (!idea) continue;
			if (context.user.role === "owner" && idea.assignedOwnerId !== context.user.id) continue;
			if (idea.status === data.status) continue;

			const updates: Record<string, unknown> = { status: data.status, updatedAt: new Date() };
			if ((REVIEWED_STATUSES as readonly string[]).includes(data.status)) {
				updates.hasBeenReviewed = true;
			}
			if ((CLOSED_STATUSES as readonly string[]).includes(data.status)) {
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

const REASSIGN_REASON_KEYS = Object.keys(REASSIGNMENT_REASONS) as [
	ReassignmentReason,
	...ReassignmentReason[],
];

export const reassignIdea = createServerFn({ method: "POST" })
	.middleware([ownerMiddleware])
	.inputValidator(
		z.object({
			ideaId: z.string(),
			newOwnerId: z.string(),
			reason: z.enum(REASSIGN_REASON_KEYS).optional(),
			note: z.string().trim().max(500).optional(),
		}),
	)
	.handler(async ({ context, data }) => {
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, data.ideaId),
			columns: {
				id: true,
				submissionId: true,
				title: true,
				status: true,
				assignedOwnerId: true,
				submitterId: true,
			},
			with: {
				category: { columns: { name: true } },
				submitter: { columns: { displayName: true, email: true, department: true } },
			},
		});

		if (!idea) throw new Error("Idea not found");

		// Owners can only reassign their own ideas (admins can reassign any)
		if (context.user.role === "owner" && idea.assignedOwnerId !== context.user.id) {
			throw new Error("Forbidden");
		}

		// Closed ideas are locked. Reassignment would reset SLA timers and fire
		// notification emails — meaningless on an already-finalized decision.
		if ((CLOSED_STATUSES as readonly string[]).includes(idea.status)) {
			throw new Error("This idea is closed and locked. Reassignment is not allowed.");
		}

		const [oldOwner, newOwner] = await Promise.all([
			idea.assignedOwnerId
				? db.query.users.findFirst({
						where: eq(users.id, idea.assignedOwnerId),
						columns: { displayName: true },
					})
				: Promise.resolve(null),
			db.query.users.findFirst({
				where: eq(users.id, data.newOwnerId),
				columns: { id: true, displayName: true, email: true },
			}),
		]);

		if (!newOwner) throw new Error("Owner not found");

		// First-time assignment skips reason/note — there's no prior owner to
		// describe a reassignment from.
		const isReassignment = !!idea.assignedOwnerId;
		const note = data.note?.trim() || null;
		let reason: ReassignmentReason | null = null;

		if (isReassignment) {
			if (!data.reason) {
				throw new Error("A reassignment reason is required.");
			}
			reason = data.reason;
		}

		// Reset SLA and update assignment
		const now = new Date();
		const newSlaDueDate = calculateSlaDueDate(now, 15);
		const newClosureSlaDueDate = calculateSlaDueDate(now, 30);

		await db
			.update(ideas)
			.set({
				assignedOwnerId: data.newOwnerId,
				slaDueDate: newSlaDueDate,
				closureSlaDueDate: newClosureSlaDueDate,
				slaStartedAt: now,
				updatedAt: now,
			})
			.where(eq(ideas.id, data.ideaId));

		// First-time assignment writes no event and has no prior reminders to
		// clear, matching the auto-assign-at-submission path.
		if (isReassignment) {
			await db
				.delete(ideaEvents)
				.where(and(eq(ideaEvents.ideaId, data.ideaId), eq(ideaEvents.eventType, "reminder_sent")));

			await db.insert(ideaEvents).values({
				ideaId: data.ideaId,
				eventType: "reassigned",
				actorId: context.user.id,
				oldValue: oldOwner?.displayName ?? null,
				newValue: newOwner.displayName,
				reason,
				note,
			});
		}

		if (isReassignment) {
			sendIdeaReassignedEmail({
				ownerEmail: newOwner.email,
				ownerFirstName: newOwner.displayName.split(" ")[0],
				submissionId: idea.submissionId,
				ideaTitle: idea.title,
				categoryName: idea.category.name,
				submitterName: idea.submitter.displayName,
				reassignedByName: context.user.displayName,
				reasonLabel: reason ? REASSIGNMENT_REASONS[reason] : null,
				note,
			});
			sendIdeaReassignedSubmitterEmail({
				submitterEmail: idea.submitter.email,
				submitterFirstName: idea.submitter.displayName.split(" ")[0],
				submissionId: idea.submissionId,
				ideaTitle: idea.title,
				categoryName: idea.category.name,
			});
		} else {
			// First-time assign mirrors the auto-assign-at-submission flow:
			// owner-only notification, no submitter ping.
			sendIdeaAssignedEmail({
				ownerEmail: newOwner.email,
				ownerFirstName: newOwner.displayName.split(" ")[0],
				submissionId: idea.submissionId,
				ideaTitle: idea.title,
				categoryName: idea.category.name,
				submitterName: idea.submitter.displayName,
				submitterDepartment: idea.submitter.department,
			});
		}

		audit({
			actorId: context.user.id,
			action: isReassignment ? "idea.reassigned" : "idea.assigned",
			resourceType: "idea",
			resourceId: idea.submissionId,
			details: isReassignment
				? { from: oldOwner?.displayName, to: newOwner.displayName, reason, note }
				: { to: newOwner.displayName },
		});

		return { success: true, newOwnerName: newOwner.displayName };
	});

// ── Get Owners for Reassignment ──────────────────────────────────────────

export const getOwnersForReassign = createServerFn()
	.middleware([ownerMiddleware])
	.handler(async () => {
		return db.query.users.findMany({
			where: (u, { or, eq: e, and }) =>
				and(or(e(u.role, "owner"), e(u.role, "admin")), e(u.active, true)),
			columns: {
				id: true,
				displayName: true,
				role: true,
				jobTitle: true,
				department: true,
				photoUrl: true,
			},
			orderBy: (u, { asc }) => [asc(u.displayName)],
		});
	});
