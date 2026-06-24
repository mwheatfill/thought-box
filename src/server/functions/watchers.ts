import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { ideaWatchers, ideas } from "#/server/db/schema";
import { audit } from "#/server/lib/audit";
import { loadIdeaCapabilities } from "#/server/lib/idea-authz";
import { upsertDirectoryUser } from "#/server/lib/user-upsert";
import { authMiddleware } from "#/server/middleware/auth";

/** Load an idea's authz shape (id columns + Category Owner) or throw. */
async function loadIdeaForWatch(ideaId: string) {
	const idea = await db.query.ideas.findFirst({
		where: eq(ideas.id, ideaId),
		columns: {
			id: true,
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
 * The Watcher panel for an idea. Anyone who can view the idea sees whether
 * they're watching; only owner/admin (who can manage) get the full roster of
 * Watchers — so the list never leaks a reviewer's identity to a submitter.
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

		const isSubmitter = idea.submitterId === context.user.id;
		const canManage = canManageWatchers(context.user, idea);

		const rows = await db.query.ideaWatchers.findMany({
			where: eq(ideaWatchers.ideaId, data.ideaId),
			with: {
				user: { columns: { id: true, displayName: true, email: true, photoUrl: true } },
			},
		});

		// The submitter is implicitly watching even though they hold no row.
		const isWatching = isSubmitter || rows.some((r) => r.userId === context.user.id);

		return {
			isWatching,
			// The submitter is implicitly watching their own idea and can't toggle it.
			canWatch: !isSubmitter,
			canManage,
			watchers: canManage
				? rows.flatMap((r) =>
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
					)
				: [],
		};
	});

/** Self opt-in: watch an idea you can already see. The submitter is always watching implicitly. */
export const watchIdea = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ ideaId: z.string() }))
	.handler(async ({ context, data }) => {
		const idea = await loadIdeaForWatch(data.ideaId);

		// Self-watch requires existing view access (relationship-based). A looped-in
		// stakeholder without prior access is added by an owner/admin instead.
		if (idea.submitterId === context.user.id) {
			return { success: true, isWatching: true }; // implicit; no row needed
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
	.inputValidator(
		z.object({
			ideaId: z.string(),
			entraId: z.string(),
			displayName: z.string(),
			email: z.string(),
			jobTitle: z.string().nullable().optional(),
			department: z.string().nullable().optional(),
			officeLocation: z.string().nullable().optional(),
		}),
	)
	.handler(async ({ context, data }) => {
		const idea = await loadIdeaForWatch(data.ideaId);
		const canManage = canManageWatchers(context.user, idea);
		if (!canManage) throw new Error("Forbidden");

		const { id: userId } = await upsertDirectoryUser(
			{
				entraId: data.entraId,
				displayName: data.displayName,
				email: data.email,
				jobTitle: data.jobTitle,
				department: data.department,
				officeLocation: data.officeLocation,
			},
			context.user.id,
		);

		// The submitter is already implicitly watching — no row needed.
		if (userId === idea.submitterId) {
			return { success: true, userId, displayName: data.displayName };
		}

		await db
			.insert(ideaWatchers)
			.values({ ideaId: data.ideaId, userId, source: "owner_added", addedById: context.user.id })
			.onConflictDoNothing();

		audit({
			actorId: context.user.id,
			action: "idea.watcher_added",
			resourceType: "idea",
			resourceId: data.ideaId,
			details: { watcher: data.displayName },
		});

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

		await db
			.delete(ideaWatchers)
			.where(and(eq(ideaWatchers.ideaId, data.ideaId), eq(ideaWatchers.userId, data.userId)));

		audit({
			actorId: context.user.id,
			action: "idea.watcher_removed",
			resourceType: "idea",
			resourceId: data.ideaId,
			details: { userId: data.userId },
		});

		return { success: true };
	});
