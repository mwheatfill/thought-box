import { createMiddleware } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "#/server/db";
import { users } from "#/server/db/schema";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuthUser {
	id: string;
	entraId: string;
	email: string;
	displayName: string;
	department: string | null;
	jobTitle: string | null;
	officeLocation: string | null;
	role: "submitter" | "leader" | "admin";
	active: boolean;
}

// ── Header parsing ─────────────────────────────────────────────────────────

/**
 * Extract the Entra ID (object ID) from Easy Auth headers.
 *
 * Azure App Service Easy Auth sets these headers on every authenticated request:
 * - `x-ms-client-principal-id`: The user's Entra ID object ID
 * - `x-ms-client-principal-name`: The user's email/UPN
 *
 * In development, we fall back to the DEV_USER_ENTRA_ID env var.
 */
function getEntraIdFromHeaders(request: Request): string | null {
	// Production: read from Easy Auth headers
	const entraId = request.headers.get("x-ms-client-principal-id");
	if (entraId) return entraId;

	// Development: use mock user
	if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
		return process.env.DEV_USER_ENTRA_ID ?? null;
	}

	return null;
}

/**
 * Extract display name and email from Easy Auth headers.
 * Used when creating a new user record on first login.
 */
function getUserInfoFromHeaders(request: Request) {
	return {
		email: request.headers.get("x-ms-client-principal-name") ?? "unknown@localhost",
		displayName: request.headers.get("x-ms-client-principal-name")?.split("@")[0] ?? "Unknown",
	};
}

// ── Middleware ──────────────────────────────────────────────────────────────

/**
 * Auth middleware: reads Easy Auth headers (or dev mock), looks up the user
 * in the database, and attaches it to context.
 *
 * If the user doesn't exist yet, creates a new record with the submitter role.
 */
export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
	const entraId = getEntraIdFromHeaders(request);
	if (!entraId) {
		throw new Error("Unauthorized");
	}

	let user = await db.query.users.findFirst({
		where: eq(users.entraId, entraId),
	});

	// Auto-create user on first login
	if (!user) {
		const { email, displayName } = getUserInfoFromHeaders(request);
		const [created] = await db
			.insert(users)
			.values({
				entraId,
				email,
				displayName,
				role: "submitter",
				source: "login",
				firstSeen: new Date(),
			})
			.returning();
		user = created;
	}

	if (!user.active) {
		throw new Error("Account deactivated");
	}

	const authUser: AuthUser = {
		id: user.id,
		entraId: user.entraId,
		email: user.email,
		displayName: user.displayName,
		department: user.department,
		jobTitle: user.jobTitle,
		officeLocation: user.officeLocation,
		role: user.role,
		active: user.active,
	};

	return next({ context: { user: authUser } });
});

/**
 * Leader middleware: chains on auth, ensures user is a leader or admin.
 */
export const leaderMiddleware = createMiddleware()
	.middleware([authMiddleware])
	.server(async ({ next, context }) => {
		if (context.user.role !== "leader" && context.user.role !== "admin") {
			throw new Error("Forbidden: leader access required");
		}
		return next({ context });
	});

/**
 * Admin middleware: chains on auth, ensures user is an admin.
 */
export const adminMiddleware = createMiddleware()
	.middleware([authMiddleware])
	.server(async ({ next, context }) => {
		if (context.user.role !== "admin") {
			throw new Error("Forbidden: admin access required");
		}
		return next({ context });
	});
