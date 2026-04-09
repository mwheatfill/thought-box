import { createServerFn } from "@tanstack/react-start";
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
