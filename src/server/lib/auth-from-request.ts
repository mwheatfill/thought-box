import { eq } from "drizzle-orm";
import { db } from "#/server/db";
import { users } from "#/server/db/schema";
import type { AuthUser } from "#/server/middleware/auth";

function parseEntraId(request: Request): string | null {
	const fromHeader = request.headers.get("x-ms-client-principal-id");
	if (fromHeader) return fromHeader;
	if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
		return process.env.DEV_USER_ENTRA_ID ?? null;
	}
	return null;
}

/**
 * Resolve the authenticated user for raw API handlers (the `/api/*` custom
 * routes that don't go through TanStack's middleware chain). Returns null
 * for unauthenticated or deactivated users — callers respond with 401.
 */
export async function resolveAuthUser(request: Request): Promise<AuthUser | null> {
	const entraId = parseEntraId(request);
	if (!entraId) return null;
	const user = await db.query.users.findFirst({ where: eq(users.entraId, entraId) });
	if (!user || !user.active) return null;
	return {
		id: user.id,
		entraId: user.entraId,
		email: user.email,
		displayName: user.displayName,
		department: user.department,
		jobTitle: user.jobTitle,
		officeLocation: user.officeLocation,
		photoUrl: user.photoUrl,
		managerDisplayName: user.managerDisplayName,
		role: user.role,
		active: user.active,
	};
}
