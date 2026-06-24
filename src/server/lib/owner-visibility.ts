export type IdeaViewerRole = "admin" | "owner" | "submitter";

export interface IdeaAccess {
	/** Whether the user may view the idea at all. */
	canView: boolean;
	/**
	 * The viewer's effective perspective on THIS idea — what drives owner
	 * anonymity, internal-note/attachment visibility, and edit permission.
	 *
	 * Derived from the relationship to the idea, NOT the user's global role: a
	 * user with the global "owner" role who submitted an idea assigned to someone
	 * else views it as its submitter (no internal notes, owner anonymized, no
	 * edit). Only meaningful when `canView` is true.
	 */
	viewerRole: IdeaViewerRole;
	/** Whether the viewer may edit the idea (status, notes, reassignment). */
	canEdit: boolean;
}

/**
 * Resolve a user's access to and perspective on a specific idea from their
 * relationship to it rather than their global role alone. This is the single
 * source of truth for "can this user open this idea, and as whom?" — used by
 * getIdeaDetail and the attachment handlers.
 *
 * Under the category-centric model (ADR-0001) an idea's accountable Owner is
 * derived from its Category (`categoryOwnerId`), and an optional assigned
 * reviewer (`assignedReviewerId`) may be delegated the work. Either of those
 * people gets the owner/reviewer perspective on the idea; both ids are passed so
 * neither has to be flattened to a single stored field.
 *
 * Owners submit ideas too, so an owner-role user can legitimately be the
 * submitter of an idea whose Category someone else owns; they must still be able
 * to view and respond to it as its submitter.
 */
export function resolveIdeaAccess(params: {
	userId: string;
	userRole: string;
	submitterId: string;
	categoryOwnerId: string | null;
	assignedReviewerId: string | null;
	/**
	 * Whether the viewer is on the idea's Category Contributor roster. A roster
	 * Contributor may view (and watch) the Category's ideas even when unassigned
	 * (ADR-0002), but does not edit unless they are the assigned reviewer.
	 */
	isCategoryContributor?: boolean;
	/**
	 * Whether the viewer holds a per-idea Watcher subscription. A looped-in
	 * stakeholder sees the idea from the submitter side (public content only —
	 * no internal notes), never as a reviewer.
	 */
	isWatcher?: boolean;
}): IdeaAccess {
	const isAdmin = params.userRole === "admin";
	// Owner-like = the Category Owner (accountable) OR the assigned reviewer
	// (delegated the work); both view/edit the idea as an owner-perspective.
	const isOwnerLike =
		params.categoryOwnerId === params.userId || params.assignedReviewerId === params.userId;
	const isSubmitter = params.submitterId === params.userId;
	const isContributor = params.isCategoryContributor ?? false;
	const isWatcher = params.isWatcher ?? false;

	return {
		canView: isAdmin || isOwnerLike || isContributor || isSubmitter || isWatcher,
		// A roster Contributor views from the reviewer side (sees the real owner,
		// is internal staff); a pure Watcher views from the submitter side.
		viewerRole: isAdmin ? "admin" : isOwnerLike || isContributor ? "owner" : "submitter",
		canEdit: isAdmin || isOwnerLike,
	};
}

/**
 * Owner anonymity: submitters should not see which owner is assigned until
 * the idea has entered active review. This prevents direct outreach during
 * early triage (New) and quick declines (New → Declined).
 *
 * Once an idea moves to Under Review or Accepted, the owner's identity is
 * revealed and stays visible even if the idea is later declined.
 */
export function shouldShowOwner(role: string, hasBeenReviewed: boolean): boolean {
	if (role !== "submitter") return true;
	return hasBeenReviewed;
}

/**
 * Replace an actor's name in events/timeline when the actor is the idea's owner
 * or assigned reviewer. Under ADR-0001 the accountable owner is the Category
 * Owner; the work may be delegated to an assigned reviewer. Either identity is
 * anonymized from a submitter's view before the idea has been reviewed; other
 * actors (e.g. the submitter themselves) are never anonymized.
 */
export function anonymizeActorName(
	actorName: string,
	actorId: string,
	categoryOwnerId: string | null,
	assignedReviewerId: string | null,
	role: string,
	hasBeenReviewed: boolean,
): string {
	if (shouldShowOwner(role, hasBeenReviewed)) return actorName;
	if (actorId === categoryOwnerId || actorId === assignedReviewerId) return "A reviewer";
	return actorName;
}
