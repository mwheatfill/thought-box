import { createMiddleware } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "#/server/db";
import { users } from "#/server/db/schema";
import { enrichUserProfile } from "#/server/lib/enrichment";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuthUser {
	id: string;
	entraId: string;
	email: string;
	displayName: string;
	department: string | null;
	jobTitle: string | null;
	officeLocation: string | null;
	photoUrl: string | null;
	managerDisplayName: string | null;
	role: "submitter" | "leader" | "admin";
	active: boolean;
}

// ── Header parsing ─────────────────────────────────────────────────────────

interface EasyAuthClaims {
	entraId: string;
	email: string;
	displayName: string;
}

/**
 * Parse Easy Auth headers into identity claims.
 *
 * Azure App Service Easy Auth sets these headers on every authenticated request:
 * - `x-ms-client-principal-id`: The user's Entra ID object ID
 * - `x-ms-client-principal-name`: The user's email/UPN
 * - `x-ms-client-principal`: Base64-encoded JSON with token claims (includes `name`)
 *
 * In development, falls back to DEV_USER_ENTRA_ID env var.
 */
function parseEasyAuthHeaders(request: Request): EasyAuthClaims | null {
	const entraId = request.headers.get("x-ms-client-principal-id");

	if (entraId) {
		const email = request.headers.get("x-ms-client-principal-name") ?? "unknown@localhost";
		let displayName = email.split("@")[0] ?? "Unknown";

		// Parse x-ms-client-principal for the `name` claim (display name from the ID token)
		const principalHeader = request.headers.get("x-ms-client-principal");
		if (principalHeader) {
			try {
				const decoded = JSON.parse(atob(principalHeader));
				const nameClaim = decoded.claims?.find(
					(c: { typ: string; val: string }) =>
						c.typ === "name" ||
						c.typ === "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
				);
				if (nameClaim?.val) {
					displayName = nameClaim.val;
				}
			} catch {
				// Fall through to email-derived displayName
			}
		}

		return { entraId, email, displayName };
	}

	// Development: use mock user
	if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
		const devEntraId = process.env.DEV_USER_ENTRA_ID;
		if (devEntraId) return { entraId: devEntraId, email: "dev@localhost", displayName: "Dev User" };
	}

	return null;
}

// ── Middleware ──────────────────────────────────────────────────────────────

/**
 * Auth middleware: reads Easy Auth headers (or dev mock), looks up the user
 * in the database, and attaches it to context.
 *
 * If the user doesn't exist yet, creates a new record with the submitter role.
 */
export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
	const claims = parseEasyAuthHeaders(request);
	if (!claims) {
		throw new Error("Unauthorized");
	}

	let user = await db.query.users.findFirst({
		where: eq(users.entraId, claims.entraId),
	});

	if (!user) {
		// First login — create user record
		const [created] = await db
			.insert(users)
			.values({
				entraId: claims.entraId,
				email: claims.email,
				displayName: claims.displayName,
				role: "submitter",
				source: "login",
				firstSeen: new Date(),
			})
			.returning();
		user = created;
	} else {
		// Existing user — refresh identity fields from claims if changed,
		// and set firstSeen for admin-provisioned users on their first login
		const updates: Record<string, unknown> = {};
		if (user.displayName !== claims.displayName) updates.displayName = claims.displayName;
		if (user.email !== claims.email) updates.email = claims.email;
		if (!user.firstSeen) updates.firstSeen = new Date();

		if (Object.keys(updates).length > 0) {
			updates.updatedAt = new Date();
			await db.update(users).set(updates).where(eq(users.id, user.id));
			Object.assign(user, updates);
		}
	}

	if (!user.active) {
		throw new Error("Account deactivated");
	}

	// Fire-and-forget Graph API enrichment (respects 24hr TTL internally)
	enrichUserProfile(user.id).catch((err) =>
		console.error("[enrichment] Failed for user", user.id, err),
	);

	const authUser: AuthUser = {
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
