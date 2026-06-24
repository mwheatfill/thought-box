export interface IdeaOwnership {
	/**
	 * The accountable Owner for the idea, derived from its Category (ADR-0001).
	 * Never stored on the idea. Null when the Category is unowned (its Owner left
	 * the org and an admin has not yet reassigned it).
	 */
	accountableOwnerId: string | null;
	/**
	 * Who is actively working the idea: the explicitly assigned reviewer when one
	 * is set, otherwise the Category Owner. Null only when the idea has no
	 * assigned reviewer and its Category is unowned.
	 */
	activeReviewerId: string | null;
}

/**
 * Resolve an idea's ownership under the category-centric model (ADR-0001).
 *
 * The accountable Owner is always the Category's Owner — derived at read time,
 * never snapshotted onto the idea, so the two can never drift. The active
 * reviewer is whoever the Owner has delegated the idea to (the assigned
 * reviewer), falling back to the Owner when there is no assignment.
 *
 * Both inputs are plain ids so this stays a pure function, independent of the
 * Drizzle schema and trivially testable.
 */
export function resolveIdeaOwnership(params: {
	categoryOwnerId: string | null;
	assignedReviewerId: string | null;
}): IdeaOwnership {
	return {
		accountableOwnerId: params.categoryOwnerId,
		activeReviewerId: params.assignedReviewerId ?? params.categoryOwnerId,
	};
}
