import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { categories, categoryContributors, ideas, users } from "#/server/db/schema";
import { personasEnabled } from "#/server/lib/app-env";
import { isDevEnv } from "#/server/lib/dev-personas";
import { getUserPresence } from "#/server/lib/graph";
import { deriveUserRole } from "#/server/lib/roles";
import { authMiddleware } from "#/server/middleware/auth";

/**
 * Get the currently authenticated user, plus persona-switching metadata for the
 * dev switcher: `canSwitchPersona` (local dev, or a deployed dev env where the
 * REAL user is an admin) and `actingAs` (set when an admin is impersonating a
 * persona — the true identity, for the "acting as" banner).
 */
export const getCurrentUser = createServerFn()
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const real = context.realUser;
		const canSwitchPersona = isDevEnv() || (personasEnabled && real.role === "admin");
		const actingAs =
			real.id !== context.user.id
				? { realDisplayName: real.displayName, realEmail: real.email }
				: null;
		return { ...context.user, canSwitchPersona, actingAs };
	});

/**
 * Get user profile + idea stats for the popover card.
 */
export const getUserCard = createServerFn()
	.middleware([authMiddleware])
	.inputValidator(z.object({ userId: z.string() }))
	.handler(async ({ data }) => {
		const [user, userIdeas, owned, roster, assigned] = await Promise.all([
			db.query.users.findFirst({
				where: eq(users.id, data.userId),
				columns: {
					id: true,
					entraId: true,
					displayName: true,
					role: true,
					department: true,
					jobTitle: true,
					officeLocation: true,
					managerDisplayName: true,
					photoUrl: true,
				},
			}),
			db.query.ideas.findMany({
				where: eq(ideas.submitterId, data.userId),
				columns: { status: true },
			}),
			db
				.select({ n: count() })
				.from(categories)
				.where(
					and(
						eq(categories.ownerId, data.userId),
						eq(categories.active, true),
						isNull(categories.deletedAt),
					),
				),
			db
				.select({ n: count() })
				.from(categoryContributors)
				.where(eq(categoryContributors.userId, data.userId)),
			db.select({ n: count() }).from(ideas).where(eq(ideas.assignedReviewerId, data.userId)),
		]);

		if (!user) return null;

		const totalIdeas = userIdeas.length;
		const accepted = userIdeas.filter((i) => i.status === "accepted").length;
		const open = userIdeas.filter((i) => ["new", "under_review"].includes(i.status)).length;

		// Show the effective (derived) role so the card agrees with the Users table.
		const role = deriveUserRole({
			isAdmin: user.role === "admin",
			ownedCategoryCount: Number(owned[0]?.n ?? 0),
			rosterMembershipCount: Number(roster[0]?.n ?? 0),
			assignedIdeaCount: Number(assigned[0]?.n ?? 0),
		});

		// Fire-and-forget presence — don't block on it failing
		const presence = await getUserPresence(user.entraId).catch(() => null);

		return { ...user, role, presence, stats: { totalIdeas, accepted, open } };
	});
