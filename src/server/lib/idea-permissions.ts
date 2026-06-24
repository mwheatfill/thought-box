import { CLOSED_STATUSES } from "#/lib/constants";

export interface IdeaCapabilities {
	/** May open the idea at all (owner, any assigned/roster reviewer, or submitter). */
	canView: boolean;
	/** May edit Owner Notes — owner/admin, or a Contributor assigned to this idea. */
	canEditOwnerNotes: boolean;
	/** May message the submitter — owner/admin, or a Contributor assigned to this idea. */
	canMessageSubmitter: boolean;
	/** May move New → Under Review — owner/admin, or an assigned Contributor (legwork). */
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
 * and the idea's status. Encodes the Contributor model (ADR-0002):
 *
 * - View is the widest gate: owner, any assigned reviewer, any roster
 *   Contributor (even unassigned, so they can watch), and the submitter.
 * - Acting (notes / messages / advancing to Under Review) is **assignment-
 *   gated**: an owner/admin always, a Contributor only on ideas assigned to
 *   them. An unassigned roster Contributor gets view-and-watch only.
 * - The verdict (Accept/Decline), Change Category, Assignment, and Reopen are
 *   reserved to owner/admin — a Contributor does the legwork, not the decision.
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
	status: string;
}): IdeaCapabilities {
	const closed = (CLOSED_STATUSES as readonly string[]).includes(params.status);
	const ownerLike = params.isAdmin || params.isCategoryOwner;
	// Assignment-gated reviewer actions: owner/admin always, Contributor only when assigned.
	const assignedActor = ownerLike || params.isAssignedReviewer;

	return {
		canView:
			ownerLike || params.isAssignedReviewer || params.isCategoryContributor || params.isSubmitter,
		canEditOwnerNotes: assignedActor && !closed,
		canMessageSubmitter: assignedActor && !closed,
		canAdvanceToUnderReview: assignedActor && params.status === "new",
		canDecide: ownerLike && !closed,
		canChangeCategory: ownerLike && !closed,
		canAssignReviewer: ownerLike && !closed,
		canReopen: ownerLike && closed,
	};
}
