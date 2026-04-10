import { createServerFn } from "@tanstack/react-start";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { users } from "#/server/db/schema";
import { sendUserInviteEmail } from "#/server/functions/email";
import { enrichUserProfile } from "#/server/lib/enrichment";
import { searchDirectory as searchDirectoryApi } from "#/server/lib/graph";
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
				officeLocation: true,
				photoUrl: true,
				managerDisplayName: true,
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

async function ensureNotLastAdmin(userId: string, action: string) {
	const target = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { role: true },
	});
	if (target?.role !== "admin") return;

	const otherAdmin = await db.query.users.findFirst({
		where: and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, userId)),
		columns: { id: true },
	});
	if (!otherAdmin) {
		throw new Error(`Cannot ${action} the last active admin.`);
	}
}

export const updateUserRole = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(z.object({ userId: z.string(), role: z.enum(["submitter", "leader", "admin"]) }))
	.handler(async ({ data, context }) => {
		if (data.userId === context.user.id && data.role !== "admin") {
			throw new Error("You cannot change your own role.");
		}
		if (data.role !== "admin") {
			await ensureNotLastAdmin(data.userId, "demote");
		}

		await db
			.update(users)
			.set({ role: data.role, updatedAt: new Date() })
			.where(eq(users.id, data.userId));
		return { success: true };
	});

export const toggleUserActive = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(z.object({ userId: z.string(), active: z.boolean() }))
	.handler(async ({ data, context }) => {
		if (data.userId === context.user.id && !data.active) {
			throw new Error("You cannot deactivate your own account.");
		}
		if (!data.active) {
			await ensureNotLastAdmin(data.userId, "deactivate");
		}

		await db
			.update(users)
			.set({ active: data.active, updatedAt: new Date() })
			.where(eq(users.id, data.userId));
		return { success: true };
	});

/** Search the Entra ID directory for users to add. */
export const searchDirectory = createServerFn()
	.middleware([adminMiddleware])
	.inputValidator(z.object({ query: z.string() }))
	.handler(async ({ data }) => {
		return searchDirectoryApi(data.query);
	});

/** Add a user from the directory (or update if they already exist). */
export const upsertUser = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(
		z.object({
			entraId: z.string(),
			displayName: z.string(),
			email: z.string(),
			jobTitle: z.string().nullable().optional(),
			department: z.string().nullable().optional(),
			officeLocation: z.string().nullable().optional(),
			role: z.enum(["submitter", "leader", "admin"]).optional(),
			sendInvite: z.boolean().optional(),
		}),
	)
	.handler(async ({ data, context }) => {
		// Check if user already exists
		const existing = await db.query.users.findFirst({
			where: eq(users.entraId, data.entraId),
			columns: { id: true },
		});

		if (existing) {
			await db
				.update(users)
				.set({
					role: data.role ?? "submitter",
					active: true,
					displayName: data.displayName,
					email: data.email,
					jobTitle: data.jobTitle ?? null,
					department: data.department ?? null,
					officeLocation: data.officeLocation ?? null,
					updatedAt: new Date(),
				})
				.where(eq(users.id, existing.id));

			// Fire-and-forget: enrich profile + photo from Graph
			enrichUserProfile(existing.id).catch(() => {});

			return { id: existing.id, created: false };
		}

		const [created] = await db
			.insert(users)
			.values({
				entraId: data.entraId,
				displayName: data.displayName,
				email: data.email,
				jobTitle: data.jobTitle ?? null,
				department: data.department ?? null,
				officeLocation: data.officeLocation ?? null,
				role: data.role ?? "submitter",
				source: "graph",
			})
			.returning({ id: users.id });

		// Fire-and-forget: enrich profile + photo from Graph
		enrichUserProfile(created.id).catch(() => {});

		// Fire-and-forget: send invite email for leaders/admins
		const role = data.role ?? "submitter";
		if (data.sendInvite && (role === "leader" || role === "admin")) {
			sendUserInviteEmail({
				recipientEmail: data.email,
				recipientFirstName: data.displayName.split(" ")[0],
				role,
				invitedByName: context.user.displayName,
			}).catch(() => {});
		}

		return { id: created.id, created: true };
	});
