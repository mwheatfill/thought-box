import type { ReassignmentReason } from "#/lib/constants";

export interface CategoryChangePlan {
	/** The Idea's new Category. */
	newCategoryId: string;
	/**
	 * Change Category always clears the assigned reviewer — the previous reviewer
	 * is not scoped to the new Category, so the Active reviewer falls back to the
	 * new Category's derived Owner.
	 */
	clearsAssignment: boolean;
	/** Change Category always resets the SLA (the work is re-scoped to a new team). */
	resetsSla: boolean;
	/** Reason recorded on the reassignment event (Pri 5/6 reporting). */
	reason: ReassignmentReason;
	/**
	 * The new accountable Owner to notify, derived from the new Category. Null
	 * when the target Category is unowned (callers should filter the picker to
	 * owned Categories; this surfaces the case rather than hiding it).
	 */
	notifyOwnerId: string | null;
}

/**
 * Encode the side effects of moving an Idea to a different Category, so the
 * invariants (always clears assignment, always resets the SLA, always records a
 * reason, notifies the new Owner) live in one tested place rather than being
 * re-derived inside the server function.
 */
export function planCategoryChange(params: {
	newCategoryId: string;
	newCategoryOwnerId: string | null;
	reason: ReassignmentReason;
}): CategoryChangePlan {
	return {
		newCategoryId: params.newCategoryId,
		clearsAssignment: true,
		resetsSla: true,
		reason: params.reason,
		notifyOwnerId: params.newCategoryOwnerId,
	};
}
