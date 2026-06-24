import { and, eq } from "drizzle-orm";
import { db } from "#/server/db";
import { categoryContributors, ideaWatchers } from "#/server/db/schema";
import { type IdeaCapabilities, resolveIdeaCapabilities } from "#/server/lib/idea-permissions";

/** The minimal idea shape the authz check needs — id columns plus its Category's Owner. */
export interface IdeaAuthzInput {
	/** The idea's own id — needed to resolve a per-idea Watcher subscription. */
	id: string;
	status: string;
	submitterId: string;
	assignedReviewerId: string | null;
	categoryId: string;
	categoryOwnerId: string | null;
}

/**
 * Resolve a user's capabilities on a specific idea by deriving their actual
 * relationship to it — Category Owner, assigned reviewer, roster Contributor, or
 * submitter — and feeding it to the pure permissions module (ADR-0002). This is
 * the single server-side entry point for "what may this user do on this idea?",
 * replacing the ad-hoc `ownerMiddleware` + manual `ownerId` checks that pre-date
 * the Contributor model.
 *
 * Crucially it gates on relationships, not the stored `users.role`: a Contributor
 * carries the `submitter` role, and a Category Owner may carry any role until the
 * admin Users page derives it (Phase 8). Only `admin` is read from the role —
 * the one explicitly-granted role (ADR-0003).
 */
export async function loadIdeaCapabilities(
	user: { id: string; role: string },
	idea: IdeaAuthzInput,
): Promise<IdeaCapabilities> {
	const isAdmin = user.role === "admin";
	const isCategoryOwner = idea.categoryOwnerId === user.id;
	const isAssignedReviewer = idea.assignedReviewerId === user.id;

	const isSubmitter = idea.submitterId === user.id;

	// The roster/watcher lookups only matter when nothing else has already granted
	// access — an admin, the Category Owner, the assigned reviewer, or the
	// submitter is resolved without touching the join tables.
	let isCategoryContributor = false;
	let isWatcher = false;
	if (!isAdmin && !isCategoryOwner && !isAssignedReviewer && !isSubmitter) {
		const [onRoster, watching] = await Promise.all([
			db.query.categoryContributors.findFirst({
				where: and(
					eq(categoryContributors.categoryId, idea.categoryId),
					eq(categoryContributors.userId, user.id),
				),
				columns: { id: true },
			}),
			db.query.ideaWatchers.findFirst({
				where: and(eq(ideaWatchers.ideaId, idea.id), eq(ideaWatchers.userId, user.id)),
				columns: { id: true },
			}),
		]);
		isCategoryContributor = !!onRoster;
		isWatcher = !!watching;
	}

	return resolveIdeaCapabilities({
		isAdmin,
		isCategoryOwner,
		isAssignedReviewer,
		isCategoryContributor,
		isSubmitter,
		isWatcher,
		status: idea.status,
	});
}
