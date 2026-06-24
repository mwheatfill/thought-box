/**
 * The Assignment lever (ADR-0002): setting an Idea's single Active reviewer.
 *
 * Two pure rules live here so the server function stays a thin orchestrator:
 *
 * 1. **Scoping** — a candidate may only be assigned if they are scoped to the
 *    Idea's Category: its Owner, a Contributor on its roster, or an Admin (who
 *    can act anywhere). This keeps the picker from offering unrelated people and
 *    stops a direct API call from assigning one.
 * 2. **Normalisation + consequences** — assigning to the Category Owner is the
 *    same as having no assignment (the Active reviewer already derives to the
 *    Owner, ADR-0001), so it collapses to "clear". Only a *distinct* reviewer is
 *    stored, auto-watched, and emailed.
 */

/** Whether a candidate is scoped to a Category and therefore assignable to its Ideas. */
export function isScopedToCategory(rel: {
	isAdmin: boolean;
	isCategoryOwner: boolean;
	isCategoryContributor: boolean;
}): boolean {
	return rel.isAdmin || rel.isCategoryOwner || rel.isCategoryContributor;
}

export interface AssignmentDecision {
	/**
	 * What to persist in `ideas.assignedReviewerId`. Null reverts the Active
	 * reviewer to the derived Category Owner (an explicit unassign, or assigning
	 * the Idea back to the Owner).
	 */
	assignedReviewerId: string | null;
	/** Auto-subscribe the assignee as a Watcher (`source: 'assignment'`) — only a distinct, real reviewer. */
	addsWatcher: boolean;
	/** Send the "assigned to you" email — only a distinct, real reviewer. */
	notifiesAssignee: boolean;
}

/**
 * Plan the consequences of an Assignment. Assumes the candidate has already been
 * validated as scoped to the Category (see {@link isScopedToCategory}); this
 * encodes only what follows from a valid choice. Assignment never touches the
 * SLA (that distinction is the whole point of splitting it from Change Category).
 */
export function planAssignment(params: {
	reviewerId: string | null;
	categoryOwnerId: string | null;
}): AssignmentDecision {
	// Assigning to the Owner (or to nobody) reverts to the derived Owner — there
	// is no separate reviewer row, watcher, or email in that case.
	const distinct =
		params.reviewerId !== null && params.reviewerId !== params.categoryOwnerId
			? params.reviewerId
			: null;
	return {
		assignedReviewerId: distinct,
		addsWatcher: distinct !== null,
		notifiesAssignee: distinct !== null,
	};
}
