import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	REASSIGNMENT_REASONS,
	REVIEWED_STATUSES,
	type ReassignmentReason,
	STATUS_LABELS,
	isClosedStatus,
} from "#/lib/constants";
import { firstName } from "#/lib/utils";
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
	sendIdeaReopenedEmail,
	sendIdeaSubmittedEmail,
	sendStatusChangedEmail,
	sendWatcherAlert,
} from "#/server/functions/email";
import { planAssignment } from "#/server/lib/assignment";
import { audit } from "#/server/lib/audit";
import { planCategoryChange } from "#/server/lib/category-change";
import { loadIdeaCapabilities } from "#/server/lib/idea-authz";
import { resolveIdeaCapabilities } from "#/server/lib/idea-permissions";
import {
	anonymizeActorName,
	resolveIdeaAccess,
	shouldShowOwner,
} from "#/server/lib/owner-visibility";
import { resolveIdeaOwnership } from "#/server/lib/ownership";
import { businessDaysRemaining, calculateSlaDueDate, calculateSlaStatus } from "#/server/lib/sla";
import { nextSubmissionId } from "#/server/lib/submission-id";
import { trackEvent } from "#/server/lib/telemetry";
import { DirectoryUserSchema, upsertActiveDirectoryUser } from "#/server/lib/user-upsert";
import { notifyIdeaWatchers } from "#/server/lib/watcher-notify";
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

		const [{ n: submitterIdeaCount }] = await db
			.select({ n: count() })
			.from(ideas)
			.where(eq(ideas.submitterId, context.user.id));

		// Fire-and-forget: send confirmation to submitter
		sendIdeaSubmittedEmail({
			submitterEmail: context.user.email,
			submitterFirstName: firstName(context.user.displayName),
			submissionId,
			ideaTitle: data.title,
			categoryName: category.name,
			ideaCount: submitterIdeaCount,
		});

		// Fire-and-forget: notify assigned owner
		if (owner) {
			sendIdeaAssignedEmail({
				ownerEmail: owner.email,
				ownerFirstName: firstName(owner.displayName),
				submissionId,
				ideaTitle: data.title,
				categoryName: category.name,
				submitterName: context.user.displayName,
				submitterDepartment: context.user.department,
			});
		}

		// Fire-and-forget: notify watcher DL (if configured)
		const watcherSetting = await db.query.settings.findFirst({
			where: eq(settings.key, "intake_notification_email"),
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
			details: {
				ideaId: idea.id,
				title: data.title,
				source: "form",
				categoryId: data.categoryId,
				category: category.name,
				impactArea: data.impactArea ?? null,
				ownerId: category.ownerId,
				assignedTo: ownerName,
			},
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
		// A roster Contributor may view their Category's ideas (reviewer side) and a
		// per-idea Watcher may view a looped-in idea (submitter side), even when
		// otherwise unrelated. Only look these up when they could change the answer.
		let isCategoryContributor = false;
		let isWatcher = false;
		if (!isAdminViewer && !isOwnerLikeViewer && idea.submitterId !== context.user.id) {
			const [onRoster, watching] = await Promise.all([
				db.query.categoryContributors.findFirst({
					where: and(
						eq(categoryContributors.categoryId, idea.categoryId),
						eq(categoryContributors.userId, context.user.id),
					),
					columns: { id: true },
				}),
				db.query.ideaWatchers.findFirst({
					where: and(eq(ideaWatchers.ideaId, idea.id), eq(ideaWatchers.userId, context.user.id)),
					columns: { id: true },
				}),
			]);
			isCategoryContributor = !!onRoster;
			isWatcher = !!watching;
		}

		const { canView, viewerRole, canEdit } = resolveIdeaAccess({
			userId: context.user.id,
			userRole: context.user.role,
			submitterId: idea.submitterId,
			categoryOwnerId: categoryOwner?.id ?? null,
			assignedReviewerId: idea.assignedReviewerId,
			isCategoryContributor,
			isWatcher,
		});
		if (!canView) {
			throw new Error("Not found");
		}

		// One capability resolution for the viewer — the same pure module addMessage
		// and the internal-notes endpoints gate on, so the UI can never disagree
		// with the server (e.g. on closed ideas).
		const caps = resolveIdeaCapabilities({
			isAdmin: isAdminViewer,
			isCategoryOwner: categoryOwner?.id === context.user.id,
			isAssignedReviewer: idea.assignedReviewerId === context.user.id,
			isCategoryContributor,
			isSubmitter: idea.submitterId === context.user.id,
			isWatcher,
			status: idea.status,
		});
		// Internal notes: review side only; readable after close (history).
		const canReadInternal = caps.canReadInternalNotes;
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
			// The *explicitly* assigned reviewer (null when the idea derives to the
			// Category Owner) — owner/admin only, so the Reviewer & routing card can
			// distinguish "delegated" from "sitting with the default owner".
			assignedReviewerId: isAdminViewer || isOwnerLikeViewer ? idea.assignedReviewerId : null,
			assignedReviewerName:
				(isAdminViewer || isOwnerLikeViewer) && idea.assignedReviewerId && idea.assignedReviewer
					? idea.assignedReviewer.displayName
					: null,
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
			// Who may post to the submitter-facing thread right now — addMessage's
			// exact gate: the submitter or the review side, never on a closed idea.
			// A per-idea watcher can read but not send.
			canMessage:
				(idea.submitterId === context.user.id && !isClosedStatus(idea.status)) ||
				caps.canMessageSubmitter,
			// Who may see the Internal Notes tab (and add notes) — the review side.
			canReadInternalNotes: canReadInternal,
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
		if (isClosedStatus(idea.status)) {
			throw new Error("This idea is closed and locked. No further edits are allowed.");
		}

		// Capability-gated (ADR-0002): the verdict (Accept/Decline) is reserved to
		// owner/admin; advancing to Under Review and editing notes/messages extend
		// to a Contributor assigned to this idea. Gated on the actual relationship,
		// not the stored role — a Contributor carries the `submitter` role.
		const caps = await loadIdeaCapabilities(context.user, {
			id: idea.id,
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
		if (data.status && isClosedStatus(data.status)) {
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
				submitterFirstName: firstName(idea.submitter.displayName),
				submissionId: idea.submissionId,
				ideaTitle: idea.title,
				newStatus: data.status,
				ownerFirstName: ownerVisible ? firstName(context.user.displayName) : "Your reviewer",
				messageToSubmitter: data.messageToSubmitter ?? idea.messageToSubmitter ?? null,
				declineReason: data.declineReason ?? null,
			});

			// Fire-and-forget: notify Watchers + the active reviewer (so an assigned
			// reviewer learns the owner's verdict on their idea).
			notifyIdeaWatchers({
				ideaId: data.ideaId,
				submissionId: idea.submissionId,
				ideaTitle: idea.title,
				categoryId: idea.categoryId,
				eventType: "status_changed",
				actorId: context.user.id,
				submitterId: idea.submitterId,
				alsoNotifyId: idea.assignedReviewerId ?? idea.category.ownerId,
				update: { kind: "status", statusLabel: STATUS_LABELS[data.status] ?? data.status },
			});
		}

		if (data.status && data.status !== idea.status) {
			audit({
				actorId: context.user.id,
				action: "idea.status_changed",
				resourceType: "idea",
				resourceId: idea.submissionId,
				details: {
					ideaId: data.ideaId,
					from: idea.status,
					to: data.status,
					declineReason: data.status === "declined" ? (data.declineReason ?? null) : null,
				},
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
			columns: {
				id: true,
				status: true,
				assignedReviewerId: true,
				submissionId: true,
				title: true,
				submitterId: true,
				categoryId: true,
			},
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

		// Fire-and-forget: notify each idea's Watchers + active reviewer, matching
		// the single-idea updateIdea path (bulk previously dropped these silently).
		for (const t of targets) {
			notifyIdeaWatchers({
				ideaId: t.id,
				submissionId: t.submissionId,
				ideaTitle: t.title,
				categoryId: t.categoryId,
				eventType: "status_changed",
				actorId: context.user.id,
				submitterId: t.submitterId,
				alsoNotifyId: t.assignedReviewerId ?? t.category.ownerId,
				update: { kind: "status", statusLabel: STATUS_LABELS[data.status] ?? data.status },
			});
		}

		trackEvent("BulkStatusChanged", { newStatus: data.status }, { count: targets.length });

		audit({
			actorId: context.user.id,
			action: "idea.bulk_status_changed",
			resourceType: "idea",
			resourceId: null,
			details: { to: data.status, count: targets.length, ideaIds: targetIds },
		});

		return { success: true, count: targets.length };
	});

// ── Reassign Idea ─────────────────────────────────────────────────────────

const REASSIGN_REASON_KEYS = Object.keys(REASSIGNMENT_REASONS) as [
	ReassignmentReason,
	...ReassignmentReason[],
];

// (reassignIdea retired in Phase 9 — replaced by changeIdeaCategory + assignReviewer)

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
 * Resolve a Change-Category / Reopen target and assert it can receive ideas: an
 * active, ThoughtBox-routing Category with a live Owner. (Redirect categories
 * don't hold ideas; an unowned Category would leave the idea unaccountable.)
 * Returns the category with a guaranteed non-null `ownerId`.
 */
async function loadValidCategoryTarget(
	categoryId: string,
): Promise<{ id: string; name: string; ownerId: string }> {
	const category = await db.query.categories.findFirst({
		where: eq(categories.id, categoryId),
		columns: { id: true, name: true, active: true, routingType: true, ownerId: true },
	});
	if (!category || !category.active || category.routingType !== "thoughtbox") {
		throw new Error("That category can't receive ideas.");
	}
	if (!category.ownerId) {
		throw new Error("That category has no owner yet. Pick a category with an owner.");
	}
	return { id: category.id, name: category.name, ownerId: category.ownerId };
}

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
				assignedReviewerId: true,
			},
			with: {
				category: { columns: { name: true, ownerId: true } },
				submitter: { columns: { displayName: true } },
			},
		});

		if (!idea) throw new Error("Idea not found");

		// Change Category belongs to the idea's active owner — the assignee, the
		// current Category's Owner, or an Admin (client model, 2026-09-01).
		const isActiveOwner =
			context.user.role === "admin" ||
			idea.category.ownerId === context.user.id ||
			idea.assignedReviewerId === context.user.id;
		if (!isActiveOwner) throw new Error("Forbidden");

		// Closed ideas are locked; Reopen (Phase 7) is the only path back and may
		// recategorize in the same step.
		if (isClosedStatus(idea.status)) {
			throw new Error("This idea is closed and locked. Reopen it to move it.");
		}

		if (data.newCategoryId === idea.categoryId) {
			throw new Error("This idea is already in that category.");
		}

		const newCategory = await loadValidCategoryTarget(data.newCategoryId);

		const plan = planCategoryChange({
			newCategoryId: newCategory.id,
			newCategoryOwnerId: newCategory.ownerId,
			reason: data.reason,
		});

		const now = new Date();
		// Status returns to New so the idea lands fresh in the new Owner's queue.
		const statusResets = idea.status !== "new";

		// Atomic: move the idea + clear reminders + log the event(s) together.
		await db.transaction(async (tx) => {
			await tx
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
			await tx
				.delete(ideaEvents)
				.where(and(eq(ideaEvents.ideaId, data.ideaId), eq(ideaEvents.eventType, "reminder_sent")));

			// Log the move (administrative — not watcher-facing). old/new = Category names.
			await tx.insert(ideaEvents).values({
				ideaId: data.ideaId,
				eventType: "reassigned",
				actorId: context.user.id,
				oldValue: idea.category.name,
				newValue: newCategory.name,
				reason: data.reason,
			});
			if (statusResets) {
				await tx.insert(ideaEvents).values({
					ideaId: data.ideaId,
					eventType: "status_changed",
					actorId: context.user.id,
					oldValue: idea.status,
					newValue: "new",
				});
			}
		});

		// Notify the new accountable Owner only. (plan.notifyOwnerId is guaranteed
		// non-null here — we rejected unowned targets above.)
		const newOwner = await db.query.users.findFirst({
			where: eq(users.id, newCategory.ownerId),
			columns: { displayName: true, email: true },
		});
		if (newOwner) {
			sendIdeaReassignedEmail({
				ownerEmail: newOwner.email,
				ownerFirstName: firstName(newOwner.displayName),
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
				ideaId: data.ideaId,
				lever: "change_category",
				fromCategoryId: idea.categoryId,
				toCategoryId: newCategory.id,
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
		z
			.object({
				ideaId: z.string(),
				reviewerId: z.string().nullable().optional(),
				/** Assign anyone from the Entra directory (R29) — inline-created on first touch. */
				directory: DirectoryUserSchema.optional(),
			})
			.refine((d) => !(d.reviewerId != null && d.directory), {
				message: "Pass either reviewerId or directory, not both.",
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
				submitter: { columns: { displayName: true, department: true } },
			},
		});

		if (!idea) throw new Error("Idea not found");

		// Assignment (handing the ticket off) belongs to the idea's active owner —
		// the assignee, the Category Owner, or an Admin (client model, 2026-09-01).
		const isActiveOwner =
			context.user.role === "admin" ||
			idea.category.ownerId === context.user.id ||
			idea.assignedReviewerId === context.user.id;
		if (!isActiveOwner) throw new Error("Forbidden");

		if (isClosedStatus(idea.status)) {
			throw new Error("This idea is closed and locked. Reopen it to assign a reviewer.");
		}

		// Resolve the candidate: an existing user, or anyone from the Entra
		// directory (R29 — open assignment), inline-created on first touch.
		let candidate: { id: string; displayName: string; email: string } | null = null;
		let resolvedReviewerId: string | null = data.reviewerId ?? null;
		if (data.directory) {
			const up = await upsertActiveDirectoryUser(data.directory, context.user.id);
			resolvedReviewerId = up.id;
			candidate = {
				id: up.id,
				displayName: data.directory.displayName,
				email: data.directory.email,
			};
		} else if (data.reviewerId) {
			const target = await db.query.users.findFirst({
				where: eq(users.id, data.reviewerId),
				columns: { id: true, displayName: true, email: true, active: true },
			});
			if (!target || !target.active) {
				throw new Error("That person can't be assigned.");
			}
			candidate = { id: target.id, displayName: target.displayName, email: target.email };
		}

		const plan = planAssignment({
			reviewerId: resolvedReviewerId,
			categoryOwnerId: idea.category.ownerId,
		});

		// No-op guard: nothing to do if the assignment is unchanged.
		if (plan.assignedReviewerId === (idea.assignedReviewerId ?? null)) {
			return { success: true, assignedReviewerName: candidate?.displayName ?? null };
		}

		const now = new Date();

		// Name the prior reviewer for the event trail (read, outside the txn).
		const prior = idea.assignedReviewerId
			? await db.query.users.findFirst({
					where: eq(users.id, idea.assignedReviewerId),
					columns: { displayName: true },
				})
			: null;

		// Atomic: set the reviewer + log the event together. No watcher row — the
		// active reviewer *implicitly* follows the idea (they get replies + status
		// updates by being the reviewer), so there's nothing to subscribe or toggle.
		// Assignment never resets the SLA (slaResetsOnAction: assign_reviewer → false).
		await db.transaction(async (tx) => {
			await tx
				.update(ideas)
				.set({ assignedReviewerId: plan.assignedReviewerId, updatedAt: now })
				.where(eq(ideas.id, data.ideaId));

			await tx.insert(ideaEvents).values({
				ideaId: data.ideaId,
				eventType: "assigned",
				actorId: context.user.id,
				oldValue: prior?.displayName ?? null,
				// Null newValue = reverted to the derived Category Owner.
				newValue: candidate?.displayName ?? null,
			});
		});

		// Notify the assignee (skipped on unassign / assign-to-Owner).
		if (plan.notifiesAssignee && candidate) {
			sendIdeaAssignedEmail({
				ownerEmail: candidate.email,
				ownerFirstName: firstName(candidate.displayName),
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
			details: {
				ideaId: data.ideaId,
				from: prior?.displayName ?? "Category Owner",
				fromReviewerId: idea.assignedReviewerId,
				to: candidate?.displayName ?? "Category Owner",
				toReviewerId: plan.assignedReviewerId,
			},
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

// ── Reopen (closed idea → New, explicit and audited) ──────────────────────

/**
 * Reopen a closed (Accepted/Declined) idea — an explicit owner/admin action that
 * returns it to New, resets the SLA, clears the assignment for a fresh review,
 * and may recategorize in the same step (CONTEXT: Reopen). Distinct from a
 * Change Category on a closed idea, which is disallowed — reopening is always
 * deliberate.
 */
export const reopenIdea = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ ideaId: z.string(), newCategoryId: z.string().optional() }))
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
				assignedReviewerId: true,
			},
			with: {
				category: { columns: { name: true, ownerId: true } },
				submitter: { columns: { displayName: true, email: true } },
			},
		});
		if (!idea) throw new Error("Idea not found");

		// canReopen = owner/admin AND the idea is closed (ADR-0002).
		const caps = await loadIdeaCapabilities(context.user, {
			id: idea.id,
			status: idea.status,
			submitterId: idea.submitterId,
			assignedReviewerId: idea.assignedReviewerId,
			categoryId: idea.categoryId,
			categoryOwnerId: idea.category.ownerId,
		});
		if (!caps.canReopen) {
			throw new Error("Only an owner or admin can reopen a closed idea.");
		}

		// Optional recategorize in the same step.
		const target =
			data.newCategoryId && data.newCategoryId !== idea.categoryId
				? await loadValidCategoryTarget(data.newCategoryId)
				: null;

		const now = new Date();
		// Atomic: reset the idea + clear reminders + log the event(s) together.
		await db.transaction(async (tx) => {
			await tx
				.update(ideas)
				.set({
					status: "new",
					categoryId: target ? target.id : idea.categoryId,
					assignedReviewerId: null, // fresh review
					declineReason: null, // no longer declined
					closedAt: null,
					slaDueDate: calculateSlaDueDate(now, 15),
					closureSlaDueDate: calculateSlaDueDate(now, 30),
					slaStartedAt: now,
					updatedAt: now,
				})
				.where(eq(ideas.id, data.ideaId));

			// Clear pending reminders so the fresh SLA starts clean.
			await tx
				.delete(ideaEvents)
				.where(and(eq(ideaEvents.ideaId, data.ideaId), eq(ideaEvents.eventType, "reminder_sent")));

			// Log the reopen as a status change (submitter-/watcher-facing).
			await tx.insert(ideaEvents).values({
				ideaId: data.ideaId,
				eventType: "status_changed",
				actorId: context.user.id,
				oldValue: idea.status,
				newValue: "new",
				note: "Reopened",
			});
			if (target) {
				await tx.insert(ideaEvents).values({
					ideaId: data.ideaId,
					eventType: "reassigned",
					actorId: context.user.id,
					oldValue: idea.category.name,
					newValue: target.name,
					note: "Reopened into a different category",
				});
			}
		});

		// Fire-and-forget: tell the submitter their idea is being looked at again.
		sendIdeaReopenedEmail({
			submitterEmail: idea.submitter.email,
			submitterFirstName: firstName(idea.submitter.displayName),
			submissionId: idea.submissionId,
			ideaTitle: idea.title,
		});

		// Fire-and-forget: notify Watchers of the reopen (status-facing) — the
		// roster of the category the idea now lives in, if it moved.
		notifyIdeaWatchers({
			ideaId: data.ideaId,
			submissionId: idea.submissionId,
			ideaTitle: idea.title,
			categoryId: target ? target.id : idea.categoryId,
			eventType: "status_changed",
			actorId: context.user.id,
			submitterId: idea.submitterId,
			update: { kind: "status", statusLabel: "Reopened" },
		});

		// If recategorized, notify the new accountable Owner.
		if (target) {
			const newOwner = await db.query.users.findFirst({
				where: eq(users.id, target.ownerId),
				columns: { displayName: true, email: true },
			});
			if (newOwner) {
				sendIdeaReassignedEmail({
					ownerEmail: newOwner.email,
					ownerFirstName: firstName(newOwner.displayName),
					submissionId: idea.submissionId,
					ideaTitle: idea.title,
					categoryName: target.name,
					submitterName: idea.submitter.displayName,
					reassignedByName: context.user.displayName,
					reasonLabel: null,
					note: "Reopened and moved into your category.",
				});
			}
		}

		trackEvent("IdeaReopened", {
			ideaId: data.ideaId,
			submissionId: idea.submissionId,
			fromStatus: idea.status,
		});
		audit({
			actorId: context.user.id,
			action: "idea.reopened",
			resourceType: "idea",
			resourceId: idea.submissionId,
			details: { from: idea.status, recategorizedTo: target?.name ?? null },
		});

		return { success: true };
	});

// ── Needs Triage (reviewer escape hatch) ──────────────────────────────────

const TRIAGE_CATEGORY_NAME = "Needs Triage";

/**
 * Move an idea to the admin-owned **Needs Triage** category when the active
 * reviewer can't place it (Pri 7). Like a Change Category, it clears the
 * assignment and resets the SLA; it then notifies ThoughtBox admins to
 * recategorize. Available to the active reviewer (owner/admin or the assigned
 * Contributor) — the one stuck on the idea.
 */
export const requestTriage = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ ideaId: z.string(), note: z.string().trim().max(500).optional() }))
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
				assignedReviewerId: true,
			},
			with: {
				category: { columns: { name: true, ownerId: true } },
				submitter: { columns: { displayName: true, department: true } },
			},
		});
		if (!idea) throw new Error("Idea not found");

		// The active reviewer (assigned actor) is the one who can be stuck on it.
		const caps = await loadIdeaCapabilities(context.user, {
			id: idea.id,
			status: idea.status,
			submitterId: idea.submitterId,
			assignedReviewerId: idea.assignedReviewerId,
			categoryId: idea.categoryId,
			categoryOwnerId: idea.category.ownerId,
		});
		if (!caps.canEditOwnerNotes) {
			throw new Error("Only the idea's reviewer can send it to triage.");
		}

		const triage = await db.query.categories.findFirst({
			where: and(eq(categories.name, TRIAGE_CATEGORY_NAME), eq(categories.active, true)),
			columns: { id: true, name: true },
		});
		if (!triage) {
			throw new Error("No 'Needs Triage' category is configured. Ask an admin to add one.");
		}
		if (triage.id === idea.categoryId) {
			throw new Error("This idea is already in triage.");
		}

		const now = new Date();
		const statusResets = idea.status !== "new";
		// Atomic: move to triage + clear reminders + log the event(s) together.
		await db.transaction(async (tx) => {
			await tx
				.update(ideas)
				.set({
					categoryId: triage.id,
					assignedReviewerId: null,
					slaDueDate: calculateSlaDueDate(now, 15),
					closureSlaDueDate: calculateSlaDueDate(now, 30),
					slaStartedAt: now,
					updatedAt: now,
					...(statusResets ? { status: "new" as const } : {}),
				})
				.where(eq(ideas.id, data.ideaId));

			await tx
				.delete(ideaEvents)
				.where(and(eq(ideaEvents.ideaId, data.ideaId), eq(ideaEvents.eventType, "reminder_sent")));

			await tx.insert(ideaEvents).values({
				ideaId: data.ideaId,
				eventType: "reassigned",
				actorId: context.user.id,
				oldValue: idea.category.name,
				newValue: triage.name,
				note: data.note?.trim() || "Sent to triage — needs admin assistance.",
			});
			if (statusResets) {
				await tx.insert(ideaEvents).values({
					ideaId: data.ideaId,
					eventType: "status_changed",
					actorId: context.user.id,
					oldValue: idea.status,
					newValue: "new",
				});
			}
		});

		// Fire-and-forget: alert every active admin to recategorize it.
		const admins = await db.query.users.findMany({
			where: (u, { eq: e, and: a }) => a(e(u.role, "admin"), e(u.active, true)),
			columns: { email: true, displayName: true },
		});
		for (const adm of admins) {
			sendIdeaAssignedEmail({
				ownerEmail: adm.email,
				ownerFirstName: firstName(adm.displayName),
				submissionId: idea.submissionId,
				ideaTitle: idea.title,
				categoryName: triage.name,
				submitterName: idea.submitter.displayName,
				submitterDepartment: idea.submitter.department,
			});
		}

		trackEvent("IdeaTriaged", { ideaId: data.ideaId, submissionId: idea.submissionId });
		audit({
			actorId: context.user.id,
			action: "idea.triage_requested",
			resourceType: "idea",
			resourceId: idea.submissionId,
			details: { from: idea.category.name, note: data.note?.trim() || null },
		});

		return { success: true };
	});

// ── Reassignable category targets (for the Change Category picker) ─────────

/**
 * The Categories an idea can be moved into: active, ThoughtBox-routing, and
 * owned (so the move never leaves the idea unaccountable). Owner/admin-accessible
 * — the picker behind the Change Category dialog. Mirrors loadValidCategoryTarget's
 * "live destination" rule.
 */
export const getReassignableCategories = createServerFn()
	.middleware([ownerMiddleware])
	.handler(async () => {
		const rows = await db.query.categories.findMany({
			where: (c, { and: a, eq: e, isNull: n }) =>
				a(e(c.active, true), e(c.routingType, "thoughtbox"), n(c.deletedAt)),
			columns: { id: true, name: true, ownerId: true },
			orderBy: (c, { asc }) => [asc(c.sortOrder)],
		});
		return rows.filter((c) => !!c.ownerId).map((c) => ({ id: c.id, name: c.name }));
	});
