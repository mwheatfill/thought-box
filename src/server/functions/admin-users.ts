import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { users } from "#/server/db/schema";
import { adminMiddleware } from "#/server/middleware/auth";

export const getUsers = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const result = await db.query.users.findMany({
			orderBy: (u, { asc }) => [asc(u.displayName)],
			columns: {
				id: true,
				displayName: true,
				email: true,
				department: true,
				jobTitle: true,
				role: true,
				active: true,
				firstSeen: true,
				createdAt: true,
			},
		});
		return result.map((u) => ({
			...u,
			firstSeen: u.firstSeen?.toISOString() ?? null,
			createdAt: u.createdAt.toISOString(),
		}));
	});

export const updateUserRole = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(z.object({ userId: z.string(), role: z.enum(["submitter", "leader", "admin"]) }))
	.handler(async ({ data }) => {
		await db
			.update(users)
			.set({ role: data.role, updatedAt: new Date() })
			.where(eq(users.id, data.userId));
		return { success: true };
	});

export const toggleUserActive = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(z.object({ userId: z.string(), active: z.boolean() }))
	.handler(async ({ data }) => {
		await db
			.update(users)
			.set({ active: data.active, updatedAt: new Date() })
			.where(eq(users.id, data.userId));
		return { success: true };
	});
