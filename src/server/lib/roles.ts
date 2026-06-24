export type EffectiveRole = "submitter" | "contributor" | "owner" | "admin";

/**
 * Derive a user's effective role from their relationships rather than a stored
 * field (ADR-0003).
 *
 * `admin` is the only explicitly-granted role. Owning at least one Category
 * makes someone an Owner; sitting on at least one Contributor roster makes them
 * a Contributor; everyone else is a Submitter. Because the role is computed
 * from relationships, it can never drift from reality — losing your last
 * Category drops you back to whatever your remaining relationships say.
 *
 * The hierarchy is a strict precedence: admin > owner > contributor > submitter.
 */
export function deriveUserRole(params: {
	isAdmin: boolean;
	ownedCategoryCount: number;
	rosterMembershipCount: number;
}): EffectiveRole {
	if (params.isAdmin) return "admin";
	if (params.ownedCategoryCount > 0) return "owner";
	if (params.rosterMembershipCount > 0) return "contributor";
	return "submitter";
}
