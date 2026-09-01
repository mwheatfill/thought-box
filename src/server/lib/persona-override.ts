import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "#/server/db";
import { categories, categoryContributors, ideas, users } from "#/server/db/schema";
import { personasEnabled } from "#/server/lib/app-env";
import { DEV_PERSONAS, ensureDevPersonas } from "#/server/lib/dev-personas";
import { type EffectiveRole, deriveUserRole } from "#/server/lib/roles";
import type { AuthUser } from "#/server/middleware/auth";

/**
 * Compute a user's effective role (ADR-0003). `admin` short-circuits — no need
 * to touch the join tables. Everyone else is owner/contributor/submitter by
 * their live Category ownership and roster memberships. Shared by the auth
 * middleware and the raw-request API auth path.
 */
export async function resolveEffectiveRole(
	userId: string,
	storedRole: string,
): Promise<EffectiveRole> {
	if (storedRole === "admin") return "admin";
	const [owned, roster, assigned] = await Promise.all([
		db
			.select({ n: count() })
			.from(categories)
			.where(
				and(
					eq(categories.ownerId, userId),
					eq(categories.active, true),
					isNull(categories.deletedAt),
				),
			),
		db
			.select({ n: count() })
			.from(categoryContributors)
			.where(eq(categoryContributors.userId, userId)),
		// Holding assigned ideas makes someone an Owner too (client model).
		db
			.select({ n: count() })
			.from(ideas)
			.where(eq(ideas.assignedReviewerId, userId)),
	]);
	return deriveUserRole({
		isAdmin: false,
		isStoredOwner: storedRole === "owner",
		ownedCategoryCount: Number(owned[0]?.n ?? 0),
		rosterMembershipCount: Number(roster[0]?.n ?? 0),
		assignedIdeaCount: Number(assigned[0]?.n ?? 0),
	});
}

function readDevPersonaCookie(request: Request): string | undefined {
	const cookie = request.headers.get("cookie") ?? "";
	const match = cookie.match(/(?:^|;\s*)dev_persona=([^;]+)/);
	return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Admin-gated persona impersonation for the DEPLOYED dev environment. Returns the
 * acting persona's AuthUser, or `null` to fall back to the real user.
 *
 * The override is honored only when ALL hold (defense-in-depth — a forged cookie
 * from a non-admin is a silent no-op, never an error):
 *  1. `personasEnabled` (APP_ENV=dev AND non-prod mailbox).
 *  2. The REAL authenticated user is an admin. The real identity is anchored to
 *     the unforgeable `x-ms-client-principal-id` Easy Auth header; effective
 *     `"admin"` ⟺ stored `users.role === "admin"` by construction (deriveUserRole
 *     only returns admin for a stored admin), so checking `realUser.role` is safe.
 *  3. A `dev_persona` cookie naming a known persona.
 *
 * (Local development uses the simpler header-bypass path in `parseEasyAuthHeaders`
 * and never reaches here, since `personasEnabled` is false without APP_ENV=dev.)
 */
export async function resolvePersonaOverride(
	request: Request,
	realUser: AuthUser,
): Promise<AuthUser | null> {
	if (!personasEnabled) return null;
	if (realUser.role !== "admin") return null;

	const entraId = readDevPersonaCookie(request);
	if (!entraId || entraId === realUser.entraId) return null;
	if (!DEV_PERSONAS.some((p) => p.entraId === entraId)) return null;

	// Idempotently materialize the personas + their relationships, then load the target.
	await ensureDevPersonas();
	const persona = await db.query.users.findFirst({ where: eq(users.entraId, entraId) });
	if (!persona || !persona.active) return null;

	const role = await resolveEffectiveRole(persona.id, persona.role);
	return {
		id: persona.id,
		entraId: persona.entraId,
		email: persona.email,
		displayName: persona.displayName,
		department: persona.department,
		jobTitle: persona.jobTitle,
		officeLocation: persona.officeLocation,
		photoUrl: persona.photoUrl,
		managerDisplayName: persona.managerDisplayName,
		role,
		active: persona.active,
	};
}
