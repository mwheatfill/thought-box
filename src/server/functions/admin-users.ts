import { createServerFn } from "@tanstack/react-start";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { users } from "#/server/db/schema";
import { sendUserInviteEmail } from "#/server/functions/email";
import { audit } from "#/server/lib/audit";
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

		const target = await db.query.users.findFirst({
			where: eq(users.id, data.userId),
			columns: { role: true, displayName: true },
		});
		await db
			.update(users)
			.set({ role: data.role, updatedAt: new Date() })
			.where(eq(users.id, data.userId));

		audit({
			actorId: context.user.id,
			action: "user.role_changed",
			resourceType: "user",
			resourceId: data.userId,
			details: { name: target?.displayName, from: target?.role, to: data.role },
		});

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

		const target = await db.query.users.findFirst({
			where: eq(users.id, data.userId),
			columns: { displayName: true },
		});
		await db
			.update(users)
			.set({ active: data.active, updatedAt: new Date() })
			.where(eq(users.id, data.userId));

		audit({
			actorId: context.user.id,
			action: data.active ? "user.activated" : "user.deactivated",
			resourceType: "user",
			resourceId: data.userId,
			details: { name: target?.displayName },
		});

		return { success: true };
	});

/** Send (or resend) an invite email to an existing user. */
export const sendInvite = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(z.object({ userId: z.string() }))
	.handler(async ({ data, context }) => {
		const user = await db.query.users.findFirst({
			where: eq(users.id, data.userId),
			columns: { email: true, displayName: true, role: true },
		});
		if (!user) throw new Error("User not found");
		if (user.role !== "leader" && user.role !== "admin") {
			throw new Error("Invites are only for leaders and admins");
		}

		await sendUserInviteEmail({
			recipientEmail: user.email,
			recipientFirstName: user.displayName.split(" ")[0],
			role: user.role,
			invitedByName: context.user.displayName,
		});

		return { success: true, sentTo: user.email };
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

			enrichUserProfile(existing.id).catch(() => {});

			audit({
				actorId: context.user.id,
				action: "user.updated",
				resourceType: "user",
				resourceId: existing.id,
				details: { name: data.displayName, role: data.role },
			});

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

		enrichUserProfile(created.id).catch(() => {});

		audit({
			actorId: context.user.id,
			action: "user.added",
			resourceType: "user",
			resourceId: created.id,
			details: { name: data.displayName, email: data.email, role: data.role ?? "submitter" },
		});

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
