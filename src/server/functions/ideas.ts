import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	CLOSED_STATUSES,
	REASSIGNMENT_REASONS,
	REVIEWED_STATUSES,
	type ReassignmentReason,
} from "#/lib/constants";
import { db, sql } from "#/server/db";
import {
	categories,
	categoryContributors,
	conversations,
	ideaEvents,
	ideaWatchers,
	ideas,
	settings,
	users,
} from "#/server/db/schema";
import type { ConversationMessage } from "#/server/db/schema";
import {
	sendIdeaAssignedEmail,
	sendIdeaReassignedEmail,
	sendIdeaReassignedSubmitterEmail,
	sendIdeaSubmittedEmail,
	sendStatusChangedEmail,
	sendWatcherAlert,
} from "#/server/functions/email";
import { isScopedToCategory, planAssignment } from "#/server/lib/assignment";
import { audit } from "#/server/lib/audit";
import { planCategoryChange } from "#/server/lib/category-change";
import { loadIdeaCapabilities } from "#/server/lib/idea-authz";
import {
	anonymizeActorName,
	resolveIdeaAccess,
	shouldShowOwner,
} from "#/server/lib/owner-visibility";
import { resolveIdeaOwnership } from "#/server/lib/ownership";
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

		// Look up the category to get its accountable Owner (ADR-0001).
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
				// ADR-0001: don't snapshot the Category Owner onto the idea. The
				// active reviewer derives to the Category Owner until one is assigned.
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

		// Look up the Category Owner (the accountable owner, ADR-0001) + count
		// submitter's ideas for emails.
		let ownerName: string | null = null;
		let owner: { displayName: string; email: string } | null = null;
		if (category.ownerId) {
			const found = await db.query.users.findFirst({
				where: eq(users.id, category.ownerId),
				columns: { displayName: true, email: true },
			});
			owner = found ?? null;
			ownerName = owner?.displayName ?? null;
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
			assignedOwnerName: ownerName,
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
			details: { title: data.title, category: category.name, assignedTo: ownerName },
		});

		return {
			data: {
				id: idea.id,
				submissionId: idea.submissionId,
				title: idea.title,
				categoryName: category.name,
				assignedOwnerName: ownerName,
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
				category: {
					columns: { name: true },
					with: {
						// The accountable Owner is derived from the Category (ADR-0001).
						owner: {
							columns: { id: true, displayName: true, email: true, photoUrl: true },
						},
					},
				},
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
				// The optionally-assigned reviewer (a delegation, not ownership).
				assignedReviewer: {
					columns: { id: true, displayName: true, email: true, photoUrl: true },
				},
			},
		});

		if (!idea) {
			throw new Error("Idea not found");
		}

		// Derive ownership (ADR-0001): the accountable Owner is the Category Owner;
		// the active reviewer is the assigned reviewer when set, else the Owner.
		const categoryOwner = idea.category.owner;
		const { activeReviewerId } = resolveIdeaOwnership({
			categoryOwnerId: categoryOwner?.id ?? null,
			assignedReviewerId: idea.assignedReviewerId,
		});
		// The active reviewer's full record — the assigned reviewer if one is set,
		// otherwise the Category Owner. This is who the UI shows as "Reviewer".
		const activeReviewer =
			idea.assignedReviewerId && idea.assignedReviewer ? idea.assignedReviewer : categoryOwner;

		// Access & perspective are based on the viewer's relationship to THIS
		// idea, not their global role. A user with the "owner" role who submitted
		// an idea whose Category someone else owns still views it — as its submitter
		// (sees the message thread, not internal notes).
		const isAdminViewer = context.user.role === "admin";
		const isOwnerLikeViewer =
			categoryOwner?.id === context.user.id || idea.assignedReviewerId === context.user.id;
		// A roster Contributor may view (and watch) their Category's ideas even when
		// unassigned (ADR-0002). Only look it up when it could change the answer.
		let isCategoryContributor = false;
		if (!isAdminViewer && !isOwnerLikeViewer && idea.submitterId !== context.user.id) {
			const onRoster = await db.query.categoryContributors.findFirst({
				where: and(
					eq(categoryContributors.categoryId, idea.categoryId),
					eq(categoryContributors.userId, context.user.id),
				),
				columns: { id: true },
			});
			isCategoryContributor = !!onRoster;
		}

		const { canView, viewerRole, canEdit } = resolveIdeaAccess({
			userId: context.user.id,
			userRole: context.user.role,
			submitterId: idea.submitterId,
			categoryOwnerId: categoryOwner?.id ?? null,
			assignedReviewerId: idea.assignedReviewerId,
			isCategoryContributor,
		});
		if (!canView) {
			throw new Error("Not found");
		}

		// Load activity events. Internal notes are owner/admin + assigned-reviewer
		// only (never the submitter or an unassigned Contributor); the `assigned`
		// delegation event is hidden from the submitter.
		const canReadInternal = isAdminViewer || isOwnerLikeViewer;
		const isSubmitter = viewerRole === "submitter";
		const allEvents = await db.query.ideaEvents.findMany({
			where: eq(ideaEvents.ideaId, idea.id),
			orderBy: (e, { asc }) => [asc(e.createdAt)],
			with: {
				actor: { columns: { displayName: true, photoUrl: true } },
			},
		});
		const events = allEvents.filter((e) => {
			if (e.eventType === "internal_note") return canReadInternal;
			if (e.eventType === "assigned") return !isSubmitter;
			return true;
		});

		const daysRemaining = businessDaysRemaining(idea.slaDueDate);
		const showOwner = shouldShowOwner(viewerRole, idea.hasBeenReviewed);

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
			declineReason: idea.declineReason,
			messageToSubmitter: idea.messageToSubmitter,
			submittedAt: idea.submittedAt.toISOString(),
			closedAt: idea.closedAt?.toISOString() ?? null,
			slaDueDate: idea.slaDueDate?.toISOString() ?? null,
			slaDaysRemaining: daysRemaining,
			slaStatus: calculateSlaStatus(idea.status, daysRemaining),
			closureSlaDueDate: idea.closureSlaDueDate?.toISOString() ?? null,
			closureSlaDaysRemaining: businessDaysRemaining(idea.closureSlaDueDate),
			submitter: idea.submitter,
			// The active reviewer (assigned reviewer, else the derived Category
			// Owner) — shown to the submitter only once the idea has been reviewed.
			assignedOwner: showOwner ? activeReviewer : null,
			events: events.map((e) => {
				const redactReassign = e.eventType === "reassigned" && !showOwner;
				// Anonymize the owner/reviewer's identity (Category Owner or the
				// active reviewer) from a not-yet-reviewed submitter's view.
				const isOwnerLikeActor =
					e.actorId === (categoryOwner?.id ?? null) || e.actorId === activeReviewerId;
				return {
					id: e.id,
					eventType: e.eventType,
					actorId: e.actorId,
					actorName: anonymizeActorName(
						e.actor.displayName,
						e.actorId,
						categoryOwner?.id ?? null,
						activeReviewerId,
						viewerRole,
						idea.hasBeenReviewed,
					),
					actorPhotoUrl: showOwner || !isOwnerLikeActor ? e.actor.photoUrl : null,
					oldValue: redactReassign ? null : e.oldValue,
					newValue: redactReassign ? null : e.newValue,
					reason: redactReassign ? null : e.reason,
					note: redactReassign ? null : e.note,
					createdAt: e.createdAt.toISOString(),
				};
			}),
			canEdit,
		};
	});

// ── Update Idea (Owner/Admin) ────────────────────────────────────────────

const UpdateIdeaSchema = z.object({
	ideaId: z.string(),
	status: z.enum(["under_review", "accepted", "declined"]).optional(),
	declineReason: z
		.enum(["already_in_progress", "not_feasible", "not_aligned", "not_thoughtbox"])
		.nullable()
		.optional(),
	messageToSubmitter: z.string().nullable().optional(),
});

export const updateIdea = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(UpdateIdeaSchema)
	.handler(async ({ context, data }) => {
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, data.ideaId),
			columns: {
				id: true,
				submissionId: true,
				title: true,
				status: true,
				categoryId: true,
				hasBeenReviewed: true,
				submitterId: true,
				assignedReviewerId: true,
				messageToSubmitter: true,
			},
			with: {
				category: { columns: { ownerId: true } },
				submitter: { columns: { email: true, displayName: true } },
			},
		});

		if (!idea) throw new Error("Idea not found");

		// Closed ideas are locked. UI hides the edit form, but enforce server-side
		// too so direct API calls can't bypass the lock.
		if ((CLOSED_STATUSES as readonly string[]).includes(idea.status)) {
			throw new Error("This idea is closed and locked. No further edits are allowed.");
		}

		// Capability-gated (ADR-0002): the verdict (Accept/Decline) is reserved to
		// owner/admin; advancing to Under Review and editing notes/messages extend
		// to a Contributor assigned to this idea. Gated on the actual relationship,
		// not the stored role — a Contributor carries the `submitter` role.
		const caps = await loadIdeaCapabilities(context.user, {
			status: idea.status,
			submitterId: idea.submitterId,
			assignedReviewerId: idea.assignedReviewerId,
			categoryId: idea.categoryId,
			categoryOwnerId: idea.category.ownerId,
		});
		const allowed =
			data.status === "accepted" || data.status === "declined"
				? caps.canDecide
				: data.status === "under_review"
					? caps.canAdvanceToUnderReview
					: caps.canEditOwnerNotes;
		if (!allowed) {
			throw new Error("Forbidden");
		}

		// Required-field enforcement for terminal statuses. Accepted/Declined both
		// require a Message to Submitter; Declined additionally requires a reason.
		if (data.status === "accepted" || data.status === "declined") {
			const message = data.messageToSubmitter?.trim();
			if (!message) {
				throw new Error("A message to the submitter is required when accepting or declining.");
			}
			if (data.status === "declined" && !data.declineReason) {
				throw new Error("A decline reason is required when declining an idea.");
			}
		}

		const updates: Record<string, unknown> = { updatedAt: new Date() };

		if (data.status !== undefined) updates.status = data.status;
		if (data.declineReason !== undefined) updates.declineReason = data.declineReason;
		if (data.messageToSubmitter !== undefined) updates.messageToSubmitter = data.messageToSubmitter;
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
				reason: data.status === "declined" ? (data.declineReason ?? null) : null,
				note: data.messageToSubmitter?.trim() || null,
			});

			trackEvent("IdeaStatusChanged", {
				ideaId: data.ideaId,
				submissionId: idea.submissionId,
				oldStatus: idea.status,
				newStatus: data.status,
			});

			// Fire-and-forget: notify submitter of status change
			const ownerVisible =
				idea.hasBeenReviewed || (REVIEWED_STATUSES as readonly string[]).includes(data.status);
			sendStatusChangedEmail({
				submitterEmail: idea.submitter.email,
				submitterFirstName: idea.submitter.displayName.split(" ")[0],
				submissionId: idea.submissionId,
				ideaTitle: idea.title,
				newStatus: data.status,
				ownerFirstName: ownerVisible ? context.user.displayName.split(" ")[0] : "Your reviewer",
				messageToSubmitter: data.messageToSubmitter ?? idea.messageToSubmitter ?? null,
				declineReason: data.declineReason ?? null,
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

// Bulk is intentionally restricted to `under_review` only. Accepted/Declined
// require a per-idea Message to Submitter (and Declined a reason), which the
// bulk action cannot collect. Those transitions must happen one idea at a time
// via updateIdea.
export const bulkUpdateStatus = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			ideaIds: z.array(z.string()).min(1),
			status: z.enum(["under_review"]),
		}),
	)
	.handler(async ({ context, data }) => {
		const candidates = await db.query.ideas.findMany({
			where: inArray(ideas.id, data.ideaIds),
			columns: { id: true, status: true, assignedReviewerId: true },
			with: { category: { columns: { ownerId: true } } },
		});

		const isAdmin = context.user.role === "admin";
		const targets = candidates.filter((idea) => {
			// Advancing to Under Review is the assigned actor's to do (owner/admin or
			// the assigned reviewer, ADR-0002) and only valid from New — which also
			// excludes closed ideas. An unassigned roster Contributor can't, so no
			// roster lookup is needed here.
			const assignedActor =
				isAdmin ||
				idea.category.ownerId === context.user.id ||
				idea.assignedReviewerId === context.user.id;
			return assignedActor && idea.status === "new";
		});

		if (targets.length === 0) {
			return { success: true, count: 0 };
		}

		const now = new Date();
		const targetIds = targets.map((t) => t.id);

		await Promise.all([
			db
				.update(ideas)
				.set({ status: data.status, hasBeenReviewed: true, updatedAt: now })
				.where(inArray(ideas.id, targetIds)),
			db.insert(ideaEvents).values(
				targets.map((t) => ({
					ideaId: t.id,
					eventType: "status_changed" as const,
					actorId: context.user.id,
					oldValue: t.status,
					newValue: data.status,
				})),
			),
		]);

		trackEvent("BulkStatusChanged", { newStatus: data.status }, { count: targets.length });

		return { success: true, count: targets.length };
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
				assignedReviewerId: true,
				submitterId: true,
			},
			with: {
				category: { columns: { name: true, ownerId: true } },
				submitter: { columns: { displayName: true, email: true, department: true } },
			},
		});

		if (!idea) throw new Error("Idea not found");

		// Owners can only reassign ideas they're responsible for: ones whose
		// Category they own (ADR-0001) or that are assigned to them. Admins any.
		const isResponsible =
			idea.category.ownerId === context.user.id || idea.assignedReviewerId === context.user.id;
		if (context.user.role === "owner" && !isResponsible) {
			throw new Error("Forbidden");
		}

		// Closed ideas are locked. Reassignment would reset SLA timers and fire
		// notification emails — meaningless on an already-finalized decision.
		if ((CLOSED_STATUSES as readonly string[]).includes(idea.status)) {
			throw new Error("This idea is closed and locked. Reassignment is not allowed.");
		}

		const [oldOwner, newOwner] = await Promise.all([
			idea.assignedReviewerId
				? db.query.users.findFirst({
						where: eq(users.id, idea.assignedReviewerId),
						columns: { displayName: true },
					})
				: Promise.resolve(null),
			db.query.users.findFirst({
				where: eq(users.id, data.newOwnerId),
				columns: { id: true, displayName: true, email: true },
			}),
		]);

		if (!newOwner) throw new Error("Owner not found");

		// First-time assignment skips reason/note — there's no prior assigned
		// reviewer to describe a reassignment from.
		const isReassignment = !!idea.assignedReviewerId;
		const note = data.note?.trim() || null;
		let reason: ReassignmentReason | null = null;

		if (isReassignment) {
			if (!data.reason) {
				throw new Error("A reassignment reason is required.");
			}
			reason = data.reason;
		}

		// Reset SLA and update assignment. Reassignment also rolls status back to
		// `new` — the incoming owner starts fresh. (Direct rollback to `new` is
		// not exposed in the UI; reassignment is the only path back.)
		const now = new Date();
		const newSlaDueDate = calculateSlaDueDate(now, 15);
		const newClosureSlaDueDate = calculateSlaDueDate(now, 30);
		const statusWillReset = isReassignment && idea.status !== "new";

		await db
			.update(ideas)
			.set({
				assignedReviewerId: data.newOwnerId,
				slaDueDate: newSlaDueDate,
				closureSlaDueDate: newClosureSlaDueDate,
				slaStartedAt: now,
				updatedAt: now,
				...(statusWillReset ? { status: "new" as const } : {}),
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

			if (statusWillReset) {
				await db.insert(ideaEvents).values({
					ideaId: data.ideaId,
					eventType: "status_changed",
					actorId: context.user.id,
					oldValue: idea.status,
					newValue: "new",
				});
			}
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

// ── Active Owners + Admins directory ─────────────────────────────────────

/**
 * Active owner/admin directory. Used by the reassign picker and the
 * @mention picker — both want the same filter, sort, and (superset of)
 * columns.
 */
export const getActiveOwnersAndAdmins = createServerFn()
	.middleware([ownerMiddleware])
	.handler(async () => {
		return db.query.users.findMany({
			where: (u, { or, eq: e, and }) =>
				and(or(e(u.role, "owner"), e(u.role, "admin")), e(u.active, true)),
			columns: {
				id: true,
				displayName: true,
				email: true,
				role: true,
				jobTitle: true,
				department: true,
				photoUrl: true,
			},
			orderBy: (u, { asc }) => [asc(u.displayName)],
		});
	});

// ── Change Category (the accountability lever, ADR-0001) ──────────────────

/**
 * Move an Idea to a different Category — the accountability lever. Changing the
 * Category changes the Idea's *derived* Owner, so this is how an Idea is "reassigned"
 * under the category-centric model. It clears any assigned reviewer (they aren't
 * scoped to the new Category), resets the SLA (a new team starts its own clock),
 * rolls the status back to New, records a reason, and notifies the new Owner only
 * — the move is administrative, so the submitter is not pinged (mirrors the
 * Watcher event filter, which excludes administrative events).
 */
export const changeIdeaCategory = createServerFn({ method: "POST" })
	// authMiddleware (not ownerMiddleware): a Category Owner is gated by the
	// `isOwnerLike` relationship check below, not their stored role (which may
	// still be `submitter` until Phase 8 derives it).
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			ideaId: z.string(),
			newCategoryId: z.string(),
			reason: z.enum(REASSIGN_REASON_KEYS),
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
				categoryId: true,
				submitterId: true,
			},
			with: {
				category: { columns: { name: true, ownerId: true } },
				submitter: { columns: { displayName: true } },
			},
		});

		if (!idea) throw new Error("Idea not found");

		// Change Category is reserved to owner/admin (ADR-0002 canChangeCategory):
		// the CURRENT Category's Owner, or an Admin. A delegated Contributor does
		// the legwork, not the accountability lever.
		const isOwnerLike = context.user.role === "admin" || idea.category.ownerId === context.user.id;
		if (!isOwnerLike) throw new Error("Forbidden");

		// Closed ideas are locked; Reopen (Phase 7) is the only path back and may
		// recategorize in the same step.
		if ((CLOSED_STATUSES as readonly string[]).includes(idea.status)) {
			throw new Error("This idea is closed and locked. Reopen it to move it.");
		}

		if (data.newCategoryId === idea.categoryId) {
			throw new Error("This idea is already in that category.");
		}

		// The target must be a live destination: an active, ThoughtBox-routing
		// Category with an Owner. (Redirect categories don't hold ideas; an unowned
		// Category would leave the idea without an accountable Owner.)
		const newCategory = await db.query.categories.findFirst({
			where: eq(categories.id, data.newCategoryId),
			columns: { id: true, name: true, active: true, routingType: true, ownerId: true },
		});
		if (!newCategory || !newCategory.active || newCategory.routingType !== "thoughtbox") {
			throw new Error("That category can't receive ideas.");
		}
		if (!newCategory.ownerId) {
			throw new Error("That category has no owner yet. Pick a category with an owner.");
		}

		const plan = planCategoryChange({
			newCategoryId: newCategory.id,
			newCategoryOwnerId: newCategory.ownerId,
			reason: data.reason,
		});

		const now = new Date();
		// Status returns to New so the idea lands fresh in the new Owner's queue.
		const statusResets = idea.status !== "new";

		await db
			.update(ideas)
			.set({
				categoryId: plan.newCategoryId,
				assignedReviewerId: null, // plan.clearsAssignment
				slaDueDate: calculateSlaDueDate(now, 15), // plan.resetsSla
				closureSlaDueDate: calculateSlaDueDate(now, 30),
				slaStartedAt: now,
				updatedAt: now,
				...(statusResets ? { status: "new" as const } : {}),
			})
			.where(eq(ideas.id, data.ideaId));

		// Drop pending reminders so the fresh SLA clock starts clean.
		await db
			.delete(ideaEvents)
			.where(and(eq(ideaEvents.ideaId, data.ideaId), eq(ideaEvents.eventType, "reminder_sent")));

		// Log the move (administrative — not watcher-facing). old/new = Category names.
		await db.insert(ideaEvents).values({
			ideaId: data.ideaId,
			eventType: "reassigned",
			actorId: context.user.id,
			oldValue: idea.category.name,
			newValue: newCategory.name,
			reason: data.reason,
		});
		if (statusResets) {
			await db.insert(ideaEvents).values({
				ideaId: data.ideaId,
				eventType: "status_changed",
				actorId: context.user.id,
				oldValue: idea.status,
				newValue: "new",
			});
		}

		// Notify the new accountable Owner only. (plan.notifyOwnerId is guaranteed
		// non-null here — we rejected unowned targets above.)
		const newOwner = await db.query.users.findFirst({
			where: eq(users.id, newCategory.ownerId),
			columns: { displayName: true, email: true },
		});
		if (newOwner) {
			sendIdeaReassignedEmail({
				ownerEmail: newOwner.email,
				ownerFirstName: newOwner.displayName.split(" ")[0],
				submissionId: idea.submissionId,
				ideaTitle: idea.title,
				categoryName: newCategory.name,
				submitterName: idea.submitter.displayName,
				reassignedByName: context.user.displayName,
				reasonLabel: REASSIGNMENT_REASONS[data.reason],
				note: null,
			});
		}

		trackEvent("IdeaCategoryChanged", {
			ideaId: data.ideaId,
			submissionId: idea.submissionId,
			fromCategoryId: idea.categoryId,
			toCategoryId: newCategory.id,
		});

		audit({
			actorId: context.user.id,
			action: "idea.reassigned",
			resourceType: "idea",
			resourceId: idea.submissionId,
			details: {
				lever: "change_category",
				from: idea.category.name,
				to: newCategory.name,
				reason: data.reason,
			},
		});

		return {
			success: true,
			newCategoryName: newCategory.name,
			newOwnerName: newOwner?.displayName ?? null,
		};
	});

// ── Assignment (the person lever, ADR-0002) ───────────────────────────────

/**
 * Set an Idea's single Active reviewer — the person lever. The candidate must be
 * scoped to the Idea's Category (its Owner, a roster Contributor, or an Admin);
 * `reviewerId: null` (or assigning back to the Owner) reverts the Active reviewer
 * to the derived Owner. Unlike Change Category, assignment is pure delegation: it
 * never touches the SLA or ownership. The assignee is auto-subscribed as a
 * Watcher and emailed.
 */
export const assignReviewer = createServerFn({ method: "POST" })
	// authMiddleware (not ownerMiddleware): the Category Owner is gated by the
	// `isOwnerLike` relationship check below, independent of stored role.
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			ideaId: z.string(),
			reviewerId: z.string().nullable(),
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
				assignedReviewerId: true,
				submitterId: true,
			},
			with: {
				category: {
					columns: { name: true, ownerId: true },
					with: { contributors: { columns: { userId: true } } },
				},
				submitter: { columns: { displayName: true, department: true } },
			},
		});

		if (!idea) throw new Error("Idea not found");

		// Assignment is reserved to owner/admin (ADR-0002 canAssignReviewer).
		const isOwnerLike = context.user.role === "admin" || idea.category.ownerId === context.user.id;
		if (!isOwnerLike) throw new Error("Forbidden");

		if ((CLOSED_STATUSES as readonly string[]).includes(idea.status)) {
			throw new Error("This idea is closed and locked. Reopen it to assign a reviewer.");
		}

		// Validate the candidate is scoped to the Category (unless unassigning).
		let candidate: { id: string; displayName: string; email: string } | null = null;
		if (data.reviewerId) {
			const target = await db.query.users.findFirst({
				where: eq(users.id, data.reviewerId),
				columns: { id: true, displayName: true, email: true, role: true, active: true },
			});
			if (!target || !target.active) {
				throw new Error("That person can't be assigned.");
			}
			const onRoster = idea.category.contributors.some((c) => c.userId === target.id);
			const scoped = isScopedToCategory({
				isAdmin: target.role === "admin",
				isCategoryOwner: target.id === idea.category.ownerId,
				isCategoryContributor: onRoster,
			});
			if (!scoped) {
				throw new Error("That person isn't on this category's team.");
			}
			candidate = { id: target.id, displayName: target.displayName, email: target.email };
		}

		const plan = planAssignment({
			reviewerId: data.reviewerId,
			categoryOwnerId: idea.category.ownerId,
		});

		// No-op guard: nothing to do if the assignment is unchanged.
		if (plan.assignedReviewerId === (idea.assignedReviewerId ?? null)) {
			return { success: true, assignedReviewerName: candidate?.displayName ?? null };
		}

		const now = new Date();
		// Assignment never resets the SLA (slaResetsOnAction: assign_reviewer → false).
		await db
			.update(ideas)
			.set({ assignedReviewerId: plan.assignedReviewerId, updatedAt: now })
			.where(eq(ideas.id, data.ideaId));

		// Auto-subscribe the assignee as a Watcher (idempotent).
		if (plan.addsWatcher && plan.assignedReviewerId) {
			await db
				.insert(ideaWatchers)
				.values({
					ideaId: data.ideaId,
					userId: plan.assignedReviewerId,
					source: "assignment",
					addedById: context.user.id,
				})
				.onConflictDoNothing();
		}

		// Name the prior reviewer for the event trail.
		const prior = idea.assignedReviewerId
			? await db.query.users.findFirst({
					where: eq(users.id, idea.assignedReviewerId),
					columns: { displayName: true },
				})
			: null;

		await db.insert(ideaEvents).values({
			ideaId: data.ideaId,
			eventType: "assigned",
			actorId: context.user.id,
			oldValue: prior?.displayName ?? null,
			// Null newValue = reverted to the derived Category Owner.
			newValue: candidate?.displayName ?? null,
		});

		// Notify the assignee (skipped on unassign / assign-to-Owner).
		if (plan.notifiesAssignee && candidate) {
			sendIdeaAssignedEmail({
				ownerEmail: candidate.email,
				ownerFirstName: candidate.displayName.split(" ")[0],
				submissionId: idea.submissionId,
				ideaTitle: idea.title,
				categoryName: idea.category.name,
				submitterName: idea.submitter.displayName,
				submitterDepartment: idea.submitter.department,
			});
		}

		trackEvent("IdeaAssigned", {
			ideaId: data.ideaId,
			submissionId: idea.submissionId,
			reviewerId: plan.assignedReviewerId ?? "owner",
		});

		audit({
			actorId: context.user.id,
			action: "idea.assigned",
			resourceType: "idea",
			resourceId: idea.submissionId,
			details: { to: candidate?.displayName ?? "Category Owner" },
		});

		return { success: true, assignedReviewerName: candidate?.displayName ?? null };
	});

// ── Assignable reviewers (scoped to a Category) ───────────────────────────

/**
 * The people scoped to a Category and therefore assignable to its Ideas: the
 * Category Owner, its roster Contributors, and all Admins (who can act anywhere).
 * Each is labeled by their *scoped* role for the picker — a roster Contributor
 * whose global role is still `submitter` shows as "contributor" here.
 */
export const getAssignableReviewers = createServerFn()
	.middleware([ownerMiddleware])
	.inputValidator(z.object({ categoryId: z.string() }))
	.handler(async ({ data }) => {
		const category = await db.query.categories.findFirst({
			where: eq(categories.id, data.categoryId),
			columns: { ownerId: true },
			with: { contributors: { columns: { userId: true } } },
		});
		if (!category) throw new Error("Category not found");

		const contributorIds = new Set(category.contributors.map((c) => c.userId));
		const scopedIds = new Set<string>(contributorIds);
		if (category.ownerId) scopedIds.add(category.ownerId);

		const admins = await db.query.users.findMany({
			where: (u, { eq: e, and }) => and(e(u.role, "admin"), e(u.active, true)),
			columns: { id: true },
		});
		for (const a of admins) scopedIds.add(a.id);

		if (scopedIds.size === 0) return [];

		const people = await db.query.users.findMany({
			where: (u, { inArray: ia, eq: e, and }) => and(ia(u.id, [...scopedIds]), e(u.active, true)),
			columns: {
				id: true,
				displayName: true,
				email: true,
				role: true,
				jobTitle: true,
				department: true,
				photoUrl: true,
			},
			orderBy: (u, { asc }) => [asc(u.displayName)],
		});

		return people.map((p) => ({
			id: p.id,
			displayName: p.displayName,
			email: p.email,
			jobTitle: p.jobTitle,
			department: p.department,
			photoUrl: p.photoUrl,
			// Scoped role label: Owner of THIS category, else roster Contributor,
			// else their global role (an Admin reaching in).
			scopedRole:
				p.id === category.ownerId ? "owner" : contributorIds.has(p.id) ? "contributor" : p.role,
		}));
	});
