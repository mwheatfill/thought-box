export type EffectiveRole = "submitter" | "contributor" | "owner" | "admin";

/**
 * Derive a user's effective role from their relationships rather than a stored
 * field (ADR-0003).
 *
 * `admin` is the only explicitly-granted role. Owning at least one Category OR
 * holding at least one assigned idea makes someone an Owner (the client model:
 * whoever a ticket is assigned to owns it — assignment is the promotion,
 * 2026-09-01 prod incident); sitting on at least one Watcher roster makes them
 * a Contributor; everyone else is a Submitter. Because the role is computed
 * from relationships, it can never drift from reality — losing your last
 * Category or ticket drops you back to whatever your remaining relationships
 * say.
 *
 * The hierarchy is a strict precedence: admin > owner > contributor > submitter.
 */
export function deriveUserRole(params: {
	isAdmin: boolean;
	ownedCategoryCount: number;
	rosterMembershipCount: number;
	assignedIdeaCount: number;
}): EffectiveRole {
	if (params.isAdmin) return "admin";
	if (params.ownedCategoryCount > 0 || params.assignedIdeaCount > 0) return "owner";
	if (params.rosterMembershipCount > 0) return "contributor";
	return "submitter";
}
