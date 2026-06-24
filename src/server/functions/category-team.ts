import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { OPEN_STATUSES } from "#/lib/constants";
import { db } from "#/server/db";
import { categories, categoryContributors, ideas, users } from "#/server/db/schema";
import { sendCategoryRoleGrantedEmail } from "#/server/functions/email";
import { audit } from "#/server/lib/audit";
import { searchDirectory as searchDirectoryApi } from "#/server/lib/graph";
import { upsertDirectoryUser } from "#/server/lib/user-upsert";
import { authMiddleware, ownerMiddleware } from "#/server/middleware/auth";

/**
 * Load a Category and assert the current user may manage its team — the
 * Category's Owner (relationship, not stored role) or an Admin. The shared gate
 * behind every My Category mutation.
 */
async function loadManageableCategory(
	categoryId: string,
	user: { id: string; role: string },
): Promise<{ id: string; name: string; ownerId: string | null }> {
	const category = await db.query.categories.findFirst({
		where: eq(categories.id, categoryId),
		columns: { id: true, name: true, ownerId: true },
	});
	if (!category) throw new Error("Category not found");
	if (user.role !== "admin" && category.ownerId !== user.id) {
		throw new Error("Forbidden");
	}
	return category;
}

// ── My Category: owner's self-serve view ──────────────────────────────────

/** Categories the current user owns, with live open-idea and roster counts. */
export const getMyCategories = createServerFn()
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const owned = await db.query.categories.findMany({
			where: and(eq(categories.ownerId, context.user.id), isNull(categories.deletedAt)),
			orderBy: (c, { asc }) => [asc(c.sortOrder)],
			columns: {
				id: true,
				name: true,
				description: true,
				routingType: true,
				active: true,
			},
		});
		if (owned.length === 0) return [];

		const ids = owned.map((c) => c.id);
		const [openCounts, rosterCounts] = await Promise.all([
			db
				.select({ categoryId: ideas.categoryId, n: count() })
				.from(ideas)
				.where(and(inArray(ideas.categoryId, ids), inArray(ideas.status, [...OPEN_STATUSES])))
				.groupBy(ideas.categoryId),
			db
				.select({ categoryId: categoryContributors.categoryId, n: count() })
				.from(categoryContributors)
				.where(inArray(categoryContributors.categoryId, ids))
				.groupBy(categoryContributors.categoryId),
		]);
		const openByCat = new Map(openCounts.map((r) => [r.categoryId, Number(r.n)]));
		const rosterByCat = new Map(rosterCounts.map((r) => [r.categoryId, Number(r.n)]));

		return owned.map((c) => ({
			...c,
			openIdeaCount: openByCat.get(c.id) ?? 0,
			contributorCount: rosterByCat.get(c.id) ?? 0,
		}));
	});

/** The Category definition (read-only here) plus its Owner and Contributor roster. */
export const getCategoryTeam = createServerFn()
	.middleware([authMiddleware])
	.inputValidator(z.object({ categoryId: z.string() }))
	.handler(async ({ context, data }) => {
		// Single read: load the Category with its team, then assert manage rights
		// inline (the Owner relationship or Admin) rather than re-querying.
		const category = await db.query.categories.findFirst({
			where: eq(categories.id, data.categoryId),
			columns: {
				id: true,
				name: true,
				description: true,
				routingType: true,
				redirectUrl: true,
				active: true,
				ownerId: true,
			},
			with: {
				owner: { columns: { id: true, displayName: true, email: true, photoUrl: true } },
				contributors: {
					with: {
						user: {
							columns: {
								id: true,
								displayName: true,
								email: true,
								jobTitle: true,
								department: true,
								photoUrl: true,
								active: true,
							},
						},
					},
				},
			},
		});
		if (!category) throw new Error("Category not found");
		if (context.user.role !== "admin" && category.ownerId !== context.user.id) {
			throw new Error("Forbidden");
		}

		return {
			id: category.id,
			name: category.name,
			description: category.description,
			routingType: category.routingType,
			redirectUrl: category.redirectUrl,
			active: category.active,
			owner: category.owner,
			contributors: category.contributors
				.map((c) => c.user)
				.filter((u): u is NonNullable<typeof u> => !!u)
				.sort((a, b) => a.displayName.localeCompare(b.displayName)),
		};
	});

// ── Roster mutations ──────────────────────────────────────────────────────

/** Inline-create a User from the Entra directory, then add them to the roster. */
export const addRosterContributorFromDirectory = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			categoryId: z.string(),
			entraId: z.string(),
			displayName: z.string(),
			email: z.string(),
			jobTitle: z.string().nullable().optional(),
			department: z.string().nullable().optional(),
			officeLocation: z.string().nullable().optional(),
		}),
	)
	.handler(async ({ context, data }) => {
		const category = await loadManageableCategory(data.categoryId, context.user);

		const { id: userId } = await upsertDirectoryUser(
			{
				entraId: data.entraId,
				displayName: data.displayName,
				email: data.email,
				jobTitle: data.jobTitle,
				department: data.department,
				officeLocation: data.officeLocation,
			},
			context.user.id,
		);

		if (category.ownerId === userId) {
			throw new Error("The Category Owner is already on the team.");
		}

		await db
			.insert(categoryContributors)
			.values({ categoryId: data.categoryId, userId, addedById: context.user.id })
			.onConflictDoNothing();

		// Fire-and-forget: tell them they can now be assigned this category's ideas.
		sendCategoryRoleGrantedEmail({
			recipientEmail: data.email,
			recipientFirstName: data.displayName.split(" ")[0],
			categoryName: category.name,
			kind: "contributor",
			grantedByName: context.user.displayName,
		}).catch(() => {});

		audit({
			actorId: context.user.id,
			action: "category.contributor_added",
			resourceType: "category",
			resourceId: data.categoryId,
			details: { category: category.name, contributor: data.displayName },
		});

		return { success: true, userId, displayName: data.displayName };
	});

/** Remove a User from a Category's Contributor roster. */
export const removeRosterContributor = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ categoryId: z.string(), userId: z.string() }))
	.handler(async ({ context, data }) => {
		const category = await loadManageableCategory(data.categoryId, context.user);

		const removed = await db.query.users.findFirst({
			where: eq(users.id, data.userId),
			columns: { displayName: true },
		});

		await db
			.delete(categoryContributors)
			.where(
				and(
					eq(categoryContributors.categoryId, data.categoryId),
					eq(categoryContributors.userId, data.userId),
				),
			);

		audit({
			actorId: context.user.id,
			action: "category.contributor_removed",
			resourceType: "category",
			resourceId: data.categoryId,
			details: { category: category.name, contributor: removed?.displayName },
		});

		return { success: true };
	});

// ── Transfer ownership ────────────────────────────────────────────────────

/**
 * Transfer a Category to a new Owner. Because ownership is derived (ADR-0001),
 * changing `ownerId` moves every idea in the Category to the new Owner at once —
 * a single "mass reassignment" with no per-idea writes. The new Owner is taken
 * from the directory and inline-created if they're new (CONTEXT: transfer to
 * anyone), guaranteeing a valid, active User so the Category never goes unowned.
 */
export const transferCategoryOwnership = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			categoryId: z.string(),
			entraId: z.string(),
			displayName: z.string(),
			email: z.string(),
			jobTitle: z.string().nullable().optional(),
			department: z.string().nullable().optional(),
			officeLocation: z.string().nullable().optional(),
		}),
	)
	.handler(async ({ context, data }) => {
		const category = await loadManageableCategory(data.categoryId, context.user);

		const { id: newOwnerId } = await upsertDirectoryUser(
			{
				entraId: data.entraId,
				displayName: data.displayName,
				email: data.email,
				jobTitle: data.jobTitle,
				department: data.department,
				officeLocation: data.officeLocation,
			},
			context.user.id,
		);
		if (category.ownerId === newOwnerId) {
			throw new Error("That person already owns this category.");
		}

		const newOwner = await db.query.users.findFirst({
			where: eq(users.id, newOwnerId),
			columns: { id: true, displayName: true, active: true },
		});
		if (!newOwner || !newOwner.active) {
			throw new Error("Pick an active user to take ownership.");
		}

		const priorOwner = category.ownerId
			? await db.query.users.findFirst({
					where: eq(users.id, category.ownerId),
					columns: { displayName: true },
				})
			: null;

		// Atomic: flip ownership and drop the new Owner's now-redundant roster row
		// together, so a partial failure can't leave them owning *and* on the roster.
		await db.transaction(async (tx) => {
			await tx
				.update(categories)
				.set({ ownerId: newOwner.id, updatedAt: new Date() })
				.where(eq(categories.id, data.categoryId));
			await tx
				.delete(categoryContributors)
				.where(
					and(
						eq(categoryContributors.categoryId, data.categoryId),
						eq(categoryContributors.userId, newOwner.id),
					),
				);
		});

		// Fire-and-forget: welcome the new Owner with their open-idea count.
		const [openCount] = await db
			.select({ n: count() })
			.from(ideas)
			.where(and(eq(ideas.categoryId, data.categoryId), inArray(ideas.status, [...OPEN_STATUSES])));
		sendCategoryRoleGrantedEmail({
			recipientEmail: data.email,
			recipientFirstName: data.displayName.split(" ")[0],
			categoryName: category.name,
			kind: "owner",
			openIdeaCount: Number(openCount?.n ?? 0),
			grantedByName: context.user.displayName,
		}).catch(() => {});

		audit({
			actorId: context.user.id,
			action: "category.ownership_transferred",
			resourceType: "category",
			resourceId: data.categoryId,
			details: {
				category: category.name,
				from: priorOwner?.displayName ?? null,
				to: newOwner.displayName,
			},
		});

		return { success: true, newOwnerName: newOwner.displayName };
	});

// ── People search for the roster/transfer pickers (owner-accessible) ──────

/**
 * Search for people to add as Contributors / new Owners. Defaults to existing
 * ThoughtBox Users and extends to an Entra directory search (CONTEXT) — so
 * someone already in the system surfaces immediately, while a colleague who has
 * never used ThoughtBox can still be pulled in (and inline-created on select).
 * Gated to owners/admins — the deliberately-widened add-people gate.
 */
export const searchRosterDirectory = createServerFn()
	.middleware([ownerMiddleware])
	.inputValidator(z.object({ query: z.string() }))
	.handler(async ({ data }) => {
		const query = data.query.trim();
		if (query.length < 2) return [];

		const [dbUsers, dirResults] = await Promise.all([
			db.query.users.findMany({
				where: (u, { and: a, or, ilike, eq: e }) =>
					a(
						e(u.active, true),
						or(ilike(u.displayName, `%${query}%`), ilike(u.email, `%${query}%`)),
					),
				columns: {
					entraId: true,
					displayName: true,
					email: true,
					jobTitle: true,
					department: true,
					officeLocation: true,
				},
				orderBy: (u, { asc }) => [asc(u.displayName)],
				limit: 10,
			}),
			// The directory may be unavailable in dev (mock) or on a Graph hiccup —
			// don't let it sink the existing-user results.
			searchDirectoryApi(query).catch(() => []),
		]);

		// Existing Users first; then directory people not already in the system.
		const seen = new Set(dbUsers.map((u) => u.entraId));
		return [...dbUsers, ...dirResults.filter((d) => !seen.has(d.entraId))];
	});
