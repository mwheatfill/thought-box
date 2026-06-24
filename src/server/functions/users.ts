import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { categories, categoryContributors, ideas, users } from "#/server/db/schema";
import { getUserPresence } from "#/server/lib/graph";
import { deriveUserRole } from "#/server/lib/roles";
import { authMiddleware } from "#/server/middleware/auth";

/**
 * Get the currently authenticated user.
 * Used by the root layout to determine role-based navigation.
 */
export const getCurrentUser = createServerFn()
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		return context.user;
	});

/**
 * Get user profile + idea stats for the popover card.
 */
export const getUserCard = createServerFn()
	.middleware([authMiddleware])
	.inputValidator(z.object({ userId: z.string() }))
	.handler(async ({ data }) => {
		const [user, userIdeas, owned, roster] = await Promise.all([
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
		});

		// Fire-and-forget presence — don't block on it failing
		const presence = await getUserPresence(user.entraId).catch(() => null);

		return { ...user, role, presence, stats: { totalIdeas, accepted, open } };
	});
