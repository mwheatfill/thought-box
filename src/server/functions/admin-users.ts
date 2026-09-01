import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { OPEN_STATUSES } from "#/lib/constants";
import { firstName } from "#/lib/utils";
import { db } from "#/server/db";
import { categories, categoryContributors, ideas, users } from "#/server/db/schema";
import { sendUserInviteEmail } from "#/server/functions/email";
import { audit } from "#/server/lib/audit";
import { enrichUserProfile } from "#/server/lib/enrichment";
import { searchDirectory as searchDirectoryApi } from "#/server/lib/graph";
import { resolveDeactivation } from "#/server/lib/owner-departure";
import { deriveUserRole } from "#/server/lib/roles";
import { trackEvent } from "#/server/lib/telemetry";
import { adminMiddleware } from "#/server/middleware/auth";

export const getUsers = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		// Roles are derived from relationships (ADR-0003): the stored column only
		// tells us who is an explicit admin. Owner/Contributor come from live
		// Category ownership and roster membership, counted once and joined in.
		const [result, ownedCounts, rosterCounts, assignedCounts] = await Promise.all([
			db.query.users.findMany({
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
			}),
			db
				.select({ ownerId: categories.ownerId, n: count() })
				.from(categories)
				.where(and(eq(categories.active, true), isNull(categories.deletedAt)))
				.groupBy(categories.ownerId),
			db
				.select({ userId: categoryContributors.userId, n: count() })
				.from(categoryContributors)
				.groupBy(categoryContributors.userId),
			db
				.select({ userId: ideas.assignedReviewerId, n: count() })
				.from(ideas)
				.groupBy(ideas.assignedReviewerId),
		]);

		const ownedByUser = new Map(
			ownedCounts.filter((r) => r.ownerId).map((r) => [r.ownerId as string, Number(r.n)]),
		);
		const rosterByUser = new Map(rosterCounts.map((r) => [r.userId, Number(r.n)]));
		const assignedByUser = new Map(
			assignedCounts.filter((r) => r.userId).map((r) => [r.userId as string, Number(r.n)]),
		);

		return result.map((u) => ({
			...u,
			// Effective role for display; `storedRole` exposes the explicit-admin bit.
			storedRole: u.role,
			role: deriveUserRole({
				isAdmin: u.role === "admin",
				ownedCategoryCount: ownedByUser.get(u.id) ?? 0,
				rosterMembershipCount: rosterByUser.get(u.id) ?? 0,
				assignedIdeaCount: assignedByUser.get(u.id) ?? 0,
			}),
			firstSeen: u.firstSeen?.toISOString() ?? null,
			createdAt: u.createdAt.toISOString(),
		}));
	});

/**
 * Block demoting/deactivating a user who still owns Categories (Pri 13): under
 * the derived model removing them would orphan every idea in those Categories.
 * The admin must transfer ownership first. Counts only live (active, non-deleted)
 * Categories.
 */
async function ensureNoOwnedCategories(userId: string) {
	const [[{ n }], [{ n: openAssigned }]] = await Promise.all([
		db
			.select({ n: count() })
			.from(categories)
			.where(
				and(
					eq(categories.ownerId, userId),
					eq(categories.active, true),
					isNull(categories.deletedAt),
				),
			),
		// Assignment confers ownership too — open ideas can't be left with an
		// inactive active owner.
		db
			.select({ n: count() })
			.from(ideas)
			.where(and(eq(ideas.assignedReviewerId, userId), inArray(ideas.status, [...OPEN_STATUSES]))),
	]);
	const decision = resolveDeactivation({
		ownedCategoryCount: Number(n),
		openAssignedIdeaCount: Number(openAssigned),
	});
	if (!decision.canDeactivate) {
		throw new Error(decision.reason ?? "Transfer category ownership first.");
	}
}

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
	.inputValidator(z.object({ userId: z.string(), role: z.enum(["submitter", "owner", "admin"]) }))
	.handler(async ({ data, context }) => {
		if (data.userId === context.user.id && data.role !== "admin") {
			throw new Error("You cannot change your own role.");
		}
		if (data.role !== "admin") {
			await ensureNotLastAdmin(data.userId, "demote");
		}
		// Demoting to submitter strips the owner standing — block while they still
		// own Categories (transfer first) so no ideas are orphaned.
		if (data.role === "submitter") {
			await ensureNoOwnedCategories(data.userId);
		}

		const target = await db.query.users.findFirst({
			where: eq(users.id, data.userId),
			columns: { role: true, displayName: true, email: true },
		});
		await db
			.update(users)
			.set({ role: data.role, updatedAt: new Date() })
			.where(eq(users.id, data.userId));

		// Fire-and-forget: granting admin auto-notifies them (replaces the old manual
		// invite). Owner/Contributor grants are emailed by the category/roster flows.
		if (data.role === "admin" && target && target.role !== "admin") {
			sendUserInviteEmail({
				recipientEmail: target.email,
				recipientFirstName: firstName(target.displayName),
				role: "admin",
				invitedByName: context.user.displayName,
			}).catch(() => {});
		}

		trackEvent("UserRoleChanged", {
			userId: data.userId,
			oldRole: target?.role ?? "unknown",
			newRole: data.role,
		});

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
			await ensureNoOwnedCategories(data.userId);
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
			role: z.enum(["submitter", "owner", "admin"]).optional(),
		}),
	)
	.handler(async ({ data, context }) => {
		// Check if user already exists
		const existing = await db.query.users.findFirst({
			where: eq(users.entraId, data.entraId),
			columns: { id: true, role: true },
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

			// Fire-and-forget: notify them if this grant newly makes them an admin.
			if (data.role === "admin" && existing.role !== "admin") {
				sendUserInviteEmail({
					recipientEmail: data.email,
					recipientFirstName: firstName(data.displayName),
					role: "admin",
					invitedByName: context.user.displayName,
				}).catch(() => {});
			}

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

		trackEvent("UserAdded", {
			userId: created.id,
			role: data.role ?? "submitter",
		});

		audit({
			actorId: context.user.id,
			action: "user.added",
			resourceType: "user",
			resourceId: created.id,
			details: { name: data.displayName, email: data.email, role: data.role ?? "submitter" },
		});

		// Fire-and-forget: granting admin auto-notifies them. (Owner/Contributor
		// access is granted by assigning a category / roster seat, which emails
		// them through those flows — not here.)
		if ((data.role ?? "submitter") === "admin") {
			sendUserInviteEmail({
				recipientEmail: data.email,
				recipientFirstName: firstName(data.displayName),
				role: "admin",
				invitedByName: context.user.displayName,
			}).catch(() => {});
		}

		return { id: created.id, created: true };
	});
