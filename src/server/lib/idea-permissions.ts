import { isClosedStatus } from "#/lib/constants";

export interface IdeaCapabilities {
	/** May open the idea at all (owner, any assigned/roster reviewer, or submitter). */
	canView: boolean;
	/**
	 * May read the internal (Owner) notes thread — owner/admin, the assigned
	 * reviewer, or a category Watcher, on an idea of any status (history stays
	 * readable after close). The submitter never sees it.
	 */
	canReadInternalNotes: boolean;
	/** May edit Owner Notes — owner/admin, the assigned reviewer, or a category Watcher. */
	canEditOwnerNotes: boolean;
	/** May message the submitter — owner/admin, the assigned reviewer, or a category Watcher. */
	canMessageSubmitter: boolean;
	/** May move New → Under Review — owner/admin, or the assigned reviewer. */
	canAdvanceToUnderReview: boolean;
	/** May Accept/Decline — the verdict, reserved to owner/admin (ADR-0002). */
	canDecide: boolean;
	/** May move the idea to a different Category — owner/admin only. */
	canChangeCategory: boolean;
	/** May set the assigned reviewer — owner/admin only. */
	canAssignReviewer: boolean;
	/** May Reopen a closed idea — owner/admin only. */
	canReopen: boolean;
}

/**
 * Resolve what a user may do on a specific idea, from their relationship to it
 * and the idea's status. Encodes the category-Watcher model (client-confirmed
 * R14, superseding ADR-0002's assignment gate):
 *
 * - View is the widest gate: owner, any assigned reviewer, any category
 *   Watcher (roster), per-idea watchers, and the submitter.
 * - Owner Notes and messaging the submitter are **category-scoped**: an
 *   owner/admin, the assigned reviewer, or anyone on the category's Watcher
 *   roster.
 * - Status changes stay reserved: Under Review for the assigned actor, the
 *   verdict (Accept/Decline), Change Category, Assignment, and Reopen for
 *   owner/admin. A Watcher contributes notes and messages, not decisions.
 * - Closed ideas are locked except for Reopen.
 *
 * Inputs are plain relationship booleans so this stays pure and exhaustively
 * testable, independent of how the relationships are looked up.
 */
export function resolveIdeaCapabilities(params: {
	isAdmin: boolean;
	isCategoryOwner: boolean;
	isAssignedReviewer: boolean;
	isCategoryContributor: boolean;
	isSubmitter: boolean;
	/** Whether the user has a per-idea Watcher subscription — grants view only. */
	isWatcher?: boolean;
	status: string;
}): IdeaCapabilities {
	const closed = isClosedStatus(params.status);
	const ownerLike = params.isAdmin || params.isCategoryOwner;
	// Assignment-gated status actions: owner/admin always, else the assigned reviewer.
	const assignedActor = ownerLike || params.isAssignedReviewer;
	// Notes + messaging extend to the whole category Watcher roster (R14).
	const reviewSide = assignedActor || params.isCategoryContributor;

	return {
		canView:
			ownerLike ||
			params.isAssignedReviewer ||
			params.isCategoryContributor ||
			params.isSubmitter ||
			(params.isWatcher ?? false),
		// Reading internal notes is closed-independent (the thread stays readable
		// for history) but never extends to the submitter.
		canReadInternalNotes: reviewSide,
		canEditOwnerNotes: reviewSide && !closed,
		canMessageSubmitter: reviewSide && !closed,
		canAdvanceToUnderReview: assignedActor && params.status === "new",
		canDecide: ownerLike && !closed,
		canChangeCategory: ownerLike && !closed,
		canAssignReviewer: ownerLike && !closed,
		canReopen: ownerLike && closed,
	};
}
