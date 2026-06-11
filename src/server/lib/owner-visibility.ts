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
 * relationship to it (admin / assigned owner / submitter) rather than their
 * global role alone. This is the single source of truth for "can this user open
 * this idea, and as whom?" — used by getIdeaDetail and the attachment handlers.
 *
 * Owners submit ideas too, so an owner-role user can legitimately be the
 * submitter of an idea assigned to a different owner; they must still be able to
 * view and respond to it as its submitter.
 */
export function resolveIdeaAccess(params: {
	userId: string;
	userRole: string;
	submitterId: string;
	assignedOwnerId: string | null;
}): IdeaAccess {
	const isAdmin = params.userRole === "admin";
	const isAssignedOwner = params.assignedOwnerId === params.userId;
	const isSubmitter = params.submitterId === params.userId;

	return {
		canView: isAdmin || isAssignedOwner || isSubmitter,
		viewerRole: isAdmin ? "admin" : isAssignedOwner ? "owner" : "submitter",
		canEdit: isAdmin || isAssignedOwner,
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

/** Replace actor name in events/timeline when the actor is the assigned owner */
export function anonymizeActorName(
	actorName: string,
	actorId: string,
	assignedOwnerId: string | null,
	role: string,
	hasBeenReviewed: boolean,
): string {
	if (shouldShowOwner(role, hasBeenReviewed)) return actorName;
	// Only anonymize the assigned owner, not other actors (e.g., the submitter themselves)
	if (actorId === assignedOwnerId) return "A reviewer";
	return actorName;
}
