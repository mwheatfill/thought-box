import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { ideas, users } from "#/server/db/schema";
import { getUserPresence } from "#/server/lib/graph";
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
		const [user, userIdeas] = await Promise.all([
			db.query.users.findFirst({
				where: eq(users.id, data.userId),
				columns: {
					id: true,
					entraId: true,
					displayName: true,
					email: true,
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
		]);

		if (!user) return null;

		const totalIdeas = userIdeas.length;
		const implemented = userIdeas.filter((i) => i.status === "implemented").length;
		const open = userIdeas.filter((i) =>
			["new", "under_review", "in_progress"].includes(i.status),
		).length;

		// Fire-and-forget presence — don't block on it failing
		const presence = await getUserPresence(user.entraId).catch(() => null);

		return { ...user, presence, stats: { totalIdeas, implemented, open } };
	});
