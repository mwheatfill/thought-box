import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { firstName } from "#/lib/utils";
import { db } from "#/server/db";
import { ideaWatchers, ideas, users } from "#/server/db/schema";
import { sendWatcherUpdateEmail } from "#/server/functions/email";
import { audit } from "#/server/lib/audit";
import { loadIdeaCapabilities } from "#/server/lib/idea-authz";
import { DirectoryUserSchema, upsertActiveDirectoryUser } from "#/server/lib/user-upsert";
import { authMiddleware } from "#/server/middleware/auth";

/** Load an idea's authz shape (id columns + Category Owner) or throw. */
async function loadIdeaForWatch(ideaId: string) {
	const idea = await db.query.ideas.findFirst({
		where: eq(ideas.id, ideaId),
		columns: {
			id: true,
			submissionId: true,
			title: true,
			status: true,
			categoryId: true,
			submitterId: true,
			assignedReviewerId: true,
		},
		with: { category: { columns: { ownerId: true } } },
	});
	if (!idea) throw new Error("Idea not found");
	return idea;
}

/** Whether the user may manage an idea's Watcher list — owner/admin (CONTEXT). */
function canManageWatchers(
	user: { id: string; role: string },
	idea: { category: { ownerId: string | null } },
): boolean {
	return user.role === "admin" || idea.category.ownerId === user.id;
}

/**
 * The Watcher panel for an idea, distinguishing **implicit following** (the
 * submitter and the active reviewer — automatic, no toggle) from **explicit
 * watching** (self opt-in + owner-added stakeholders — the only toggle-able
 * subscriptions). Owner/admin (who can manage) also get the lists.
 */
export const getIdeaWatchers = createServerFn()
	.middleware([authMiddleware])
	.inputValidator(z.object({ ideaId: z.string() }))
	.handler(async ({ context, data }) => {
		const idea = await loadIdeaForWatch(data.ideaId);
		const caps = await loadIdeaCapabilities(context.user, {
			id: idea.id,
			status: idea.status,
			submitterId: idea.submitterId,
			assignedReviewerId: idea.assignedReviewerId,
			categoryId: idea.categoryId,
			categoryOwnerId: idea.category.ownerId,
		});
		if (!caps.canView) throw new Error("Forbidden");

		const me = context.user.id;
		// The active reviewer is the assigned reviewer, else the Category Owner.
		const activeReviewerId = idea.assignedReviewerId ?? idea.category.ownerId;
		const isSubmitter = idea.submitterId === me;
		const isActiveReviewer = activeReviewerId === me;
		const canManage = canManageWatchers(context.user, idea);

		// Explicit subscriptions only (legacy `assignment` rows are ignored).
		const rows = await db.query.ideaWatchers.findMany({
			where: and(
				eq(ideaWatchers.ideaId, data.ideaId),
				inArray(ideaWatchers.source, ["self", "owner_added"]),
			),
			with: {
				user: { columns: { id: true, displayName: true, email: true, photoUrl: true } },
			},
		});
		const hasExplicitRow = rows.some((r) => r.userId === me);

		// The viewer's own relationship — drives whether the card shows a passive
		// "following" note or an actual Watch/Unwatch toggle.
		const myFollow: "submitter" | "reviewer" | "watching" | "none" = isSubmitter
			? "submitter"
			: isActiveReviewer
				? "reviewer"
				: hasExplicitRow
					? "watching"
					: "none";

		let watchers: {
			id: string;
			displayName: string;
			email: string;
			photoUrl: string | null;
			source: string;
		}[] = [];
		const autoFollowers: {
			id: string;
			displayName: string;
			photoUrl: string | null;
			kind: "reviewer" | "submitter";
		}[] = [];

		if (canManage) {
			watchers = rows.flatMap((r) =>
				r.user
					? [
							{
								id: r.user.id,
								displayName: r.user.displayName,
								email: r.user.email,
								photoUrl: r.user.photoUrl,
								source: r.source,
							},
						]
					: [],
			);

			// The implicit followers (active reviewer + submitter), read-only.
			const autoIds = [activeReviewerId, idea.submitterId].filter(
				(id): id is string => id !== null,
			);
			const autoUsers = await db.query.users.findMany({
				where: inArray(users.id, autoIds),
				columns: { id: true, displayName: true, photoUrl: true },
			});
			const byId = new Map(autoUsers.map((u) => [u.id, u]));
			const seen = new Set<string>();
			for (const [id, kind] of [
				[activeReviewerId, "reviewer"] as const,
				[idea.submitterId, "submitter"] as const,
			]) {
				const u = id ? byId.get(id) : undefined;
				if (u && !seen.has(u.id)) {
					seen.add(u.id);
					autoFollowers.push({ id: u.id, displayName: u.displayName, photoUrl: u.photoUrl, kind });
				}
			}
		}

		return {
			myFollow,
			// Only a non-implicit follower can toggle an explicit watch.
			canWatch: myFollow === "none" || myFollow === "watching",
			canManage,
			watchers,
			autoFollowers,
		};
	});

/** Self opt-in: watch an idea you can already see. The submitter is always watching implicitly. */
export const watchIdea = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ ideaId: z.string() }))
	.handler(async ({ context, data }) => {
		const idea = await loadIdeaForWatch(data.ideaId);

		// The submitter and the active reviewer already follow implicitly — no row,
		// nothing to toggle.
		const activeReviewerId = idea.assignedReviewerId ?? idea.category.ownerId;
		if (idea.submitterId === context.user.id || activeReviewerId === context.user.id) {
			return { success: true, isWatching: true };
		}
		const caps = await loadIdeaCapabilities(context.user, {
			id: idea.id,
			status: idea.status,
			submitterId: idea.submitterId,
			assignedReviewerId: idea.assignedReviewerId,
			categoryId: idea.categoryId,
			categoryOwnerId: idea.category.ownerId,
		});
		if (!caps.canView) throw new Error("Forbidden");

		await db
			.insert(ideaWatchers)
			.values({ ideaId: data.ideaId, userId: context.user.id, source: "self" })
			.onConflictDoNothing();

		return { success: true, isWatching: true };
	});

/** Drop your own Watcher subscription. */
export const unwatchIdea = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ ideaId: z.string() }))
	.handler(async ({ context, data }) => {
		await db
			.delete(ideaWatchers)
			.where(and(eq(ideaWatchers.ideaId, data.ideaId), eq(ideaWatchers.userId, context.user.id)));
		return { success: true, isWatching: false };
	});

/**
 * Owner/Admin loops a stakeholder in as a Watcher — inline-creating them from the
 * directory if needed. Being a Watcher grants view access to this one idea.
 */
export const addWatcher = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(DirectoryUserSchema.extend({ ideaId: z.string() }))
	.handler(async ({ context, data }) => {
		const idea = await loadIdeaForWatch(data.ideaId);
		const canManage = canManageWatchers(context.user, idea);
		if (!canManage) throw new Error("Forbidden");

		const { id: userId } = await upsertActiveDirectoryUser(data, context.user.id);

		// The submitter is already implicitly watching — no row needed.
		if (userId === idea.submitterId) {
			return { success: true, userId, displayName: data.displayName };
		}

		const inserted = await db
			.insert(ideaWatchers)
			.values({ ideaId: data.ideaId, userId, source: "owner_added", addedById: context.user.id })
			.onConflictDoNothing()
			.returning({ ideaId: ideaWatchers.ideaId });

		// Conflict = already watching: nothing changed, so no audit entry or email.
		if (inserted.length > 0) {
			audit({
				actorId: context.user.id,
				action: "idea.watcher_added",
				resourceType: "idea",
				resourceId: idea.submissionId,
				details: { ideaId: data.ideaId, watcher: data.displayName },
			});

			// Fire-and-forget: tell the new Watcher they've been looped in.
			sendWatcherUpdateEmail({
				watcherEmail: data.email,
				watcherFirstName: firstName(data.displayName),
				submissionId: idea.submissionId,
				ideaTitle: idea.title,
				updateKind: "added",
				addedByName: context.user.displayName,
			}).catch(() => {});
		}

		return { success: true, userId, displayName: data.displayName };
	});

/** Owner/Admin removes a Watcher. */
export const removeWatcher = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ ideaId: z.string(), userId: z.string() }))
	.handler(async ({ context, data }) => {
		const idea = await loadIdeaForWatch(data.ideaId);
		const canManage = canManageWatchers(context.user, idea);
		if (!canManage) throw new Error("Forbidden");

		const removedUser = await db.query.users.findFirst({
			where: eq(users.id, data.userId),
			columns: { displayName: true },
		});

		await db
			.delete(ideaWatchers)
			.where(and(eq(ideaWatchers.ideaId, data.ideaId), eq(ideaWatchers.userId, data.userId)));

		audit({
			actorId: context.user.id,
			action: "idea.watcher_removed",
			resourceType: "idea",
			resourceId: idea.submissionId,
			details: { ideaId: data.ideaId, watcher: removedUser?.displayName ?? data.userId },
		});

		return { success: true };
	});
