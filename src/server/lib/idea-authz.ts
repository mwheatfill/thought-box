import { and, eq } from "drizzle-orm";
import { db } from "#/server/db";
import { categoryContributors } from "#/server/db/schema";
import { type IdeaCapabilities, resolveIdeaCapabilities } from "#/server/lib/idea-permissions";

/** The minimal idea shape the authz check needs — id columns plus its Category's Owner. */
export interface IdeaAuthzInput {
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

	// Only the roster lookup needs a query, and only when it could change the
	// answer — an admin or the Category Owner is already maximally privileged.
	let isCategoryContributor = false;
	if (!isAdmin && !isCategoryOwner && !isAssignedReviewer) {
		const onRoster = await db.query.categoryContributors.findFirst({
			where: and(
				eq(categoryContributors.categoryId, idea.categoryId),
				eq(categoryContributors.userId, user.id),
			),
			columns: { id: true },
		});
		isCategoryContributor = !!onRoster;
	}

	return resolveIdeaCapabilities({
		isAdmin,
		isCategoryOwner,
		isAssignedReviewer,
		isCategoryContributor,
		isSubmitter: idea.submitterId === user.id,
		status: idea.status,
	});
}
