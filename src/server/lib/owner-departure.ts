export interface DeactivationDecision {
	/** Whether the user may be demoted/deactivated through the app right now. */
	canDeactivate: boolean;
	/** Human-readable reason when blocked, for surfacing in the admin UI. */
	reason?: string;
}

/**
 * Guard the in-app demotion/deactivation of a user (Pri 13). Because ownership
 * is derived from the Category (ADR-0001), removing a user who still owns
 * Categories would instantly leave every Idea in them without an accountable
 * Owner. So the app blocks it until those Categories are transferred — the
 * admin reassigns each Category's Owner, which moves all its Ideas at once.
 *
 * This only covers departures initiated through our UI. A user deactivated
 * out-of-band in Entra can still leave a Category unowned; that case is detected
 * and surfaced to admins separately, not prevented here.
 */
export function resolveDeactivation(params: {
	ownedCategoryCount: number;
	/** Open ideas assigned to the user — they'd be left with an inactive active owner. */
	openAssignedIdeaCount?: number;
}): DeactivationDecision {
	if (params.ownedCategoryCount > 0) {
		const plural = params.ownedCategoryCount === 1 ? "Category" : "Categories";
		return {
			canDeactivate: false,
			reason: `Still owns ${params.ownedCategoryCount} ${plural}. Transfer ownership before deactivating.`,
		};
	}
	const open = params.openAssignedIdeaCount ?? 0;
	if (open > 0) {
		const plural = open === 1 ? "idea" : "ideas";
		return {
			canDeactivate: false,
			reason: `Still assigned ${open} open ${plural}. Reassign them before deactivating.`,
		};
	}
	return { canDeactivate: true };
}
