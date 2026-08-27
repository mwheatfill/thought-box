import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { OPEN_STATUSES } from "#/lib/constants";
import { firstName } from "#/lib/utils";
import { db } from "#/server/db";
import { categories, ideas, users } from "#/server/db/schema";
import { sendCategoryRoleGrantedEmail } from "#/server/functions/email";
import { audit } from "#/server/lib/audit";
import { DirectoryUserSchema, upsertDirectoryUser } from "#/server/lib/user-upsert";
import { adminMiddleware } from "#/server/middleware/auth";

export const getCategories = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const result = await db.query.categories.findMany({
			where: isNull(categories.deletedAt),
			orderBy: (c, { asc }) => [asc(c.sortOrder)],
			with: {
				owner: { columns: { id: true, displayName: true } },
			},
		});

		return result.map((c) => ({
			id: c.id,
			name: c.name,
			description: c.description,
			routingType: c.routingType,
			redirectUrl: c.redirectUrl,
			redirectLabel: c.redirectLabel,
			defaultOwnerId: c.ownerId,
			defaultOwnerName: c.owner?.displayName ?? null,
			keystoneFields: c.keystoneFields,
			sortOrder: c.sortOrder,
			active: c.active,
		}));
	});

export const getDeletedCategories = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const result = await db.query.categories.findMany({
			where: isNotNull(categories.deletedAt),
			orderBy: (c, { desc }) => [desc(c.deletedAt)],
		});

		return result.map((c) => ({
			id: c.id,
			name: c.name,
			description: c.description,
			deletedAt: c.deletedAt?.toISOString() ?? null,
		}));
	});

const CategorySchema = z.object({
	name: z.string().min(1),
	description: z.string().min(1),
	routingType: z.enum(["thoughtbox", "redirect"]),
	redirectUrl: z.string().nullable().optional(),
	redirectLabel: z.string().nullable().optional(),
	defaultOwnerId: z.string().nullable().optional(),
	keystoneFields: z.boolean().optional(),
	sortOrder: z.number().optional(),
});

export const createCategory = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(CategorySchema)
	.handler(async ({ data, context }) => {
		const [category] = await db
			.insert(categories)
			.values({
				name: data.name,
				description: data.description,
				routingType: data.routingType,
				redirectUrl: data.redirectUrl ?? null,
				redirectLabel: data.redirectLabel ?? null,
				ownerId: data.defaultOwnerId ?? null,
				keystoneFields: data.keystoneFields ?? false,
				sortOrder: data.sortOrder ?? 0,
			})
			.returning();

		audit({
			actorId: context.user.id,
			action: "category.created",
			resourceType: "category",
			resourceId: category.id,
			details: { name: data.name },
		});

		return category;
	});

const UpdateCategorySchema = z.object({
	id: z.string(),
	name: z.string().min(1).optional(),
	description: z.string().min(1).optional(),
	routingType: z.enum(["thoughtbox", "redirect"]).optional(),
	redirectUrl: z.string().nullable().optional(),
	redirectLabel: z.string().nullable().optional(),
	defaultOwnerId: z.string().nullable().optional(),
	keystoneFields: z.boolean().optional(),
	sortOrder: z.number().optional(),
	active: z.boolean().optional(),
});

export const updateCategory = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(UpdateCategorySchema)
	.handler(async ({ data, context }) => {
		// The UI still speaks `defaultOwnerId`; map it onto the live `ownerId`
		// column (ADR-0001 renamed `categories.defaultOwnerId` → `ownerId`).
		const { id, defaultOwnerId, ...rest } = data;

		// Snapshot the prior state so the change can be audited (and a genuine
		// ownership change can welcome the new Owner).
		const before = await db.query.categories.findFirst({
			where: eq(categories.id, id),
			columns: {
				name: true,
				description: true,
				routingType: true,
				redirectUrl: true,
				redirectLabel: true,
				keystoneFields: true,
				sortOrder: true,
				active: true,
				ownerId: true,
			},
		});

		const updates: Record<string, unknown> = { ...rest, updatedAt: new Date() };
		if (defaultOwnerId !== undefined) updates.ownerId = defaultOwnerId;
		await db.update(categories).set(updates).where(eq(categories.id, id));

		// Audit the edit with before/after for each field that actually changed.
		const ownerChanged = defaultOwnerId !== undefined && before?.ownerId !== defaultOwnerId;
		const changed: Record<string, { from: unknown; to: unknown }> = {};
		if (before) {
			for (const [k, to] of Object.entries(rest)) {
				const from = (before as Record<string, unknown>)[k];
				if (to !== undefined && from !== to) changed[k] = { from, to };
			}
			if (ownerChanged) changed.ownerId = { from: before.ownerId, to: defaultOwnerId };
		}
		// Skip a no-op save (form re-submitted with nothing changed).
		if (Object.keys(changed).length > 0) {
			audit({
				actorId: context.user.id,
				action: ownerChanged ? "category.owner_changed" : "category.updated",
				resourceType: "category",
				resourceId: id,
				details: { name: before?.name, changed },
			});
		}

		// Fire-and-forget: notify a newly-assigned Owner (admin path, story 32).
		if (defaultOwnerId && before && before.ownerId !== defaultOwnerId) {
			const [newOwner, openCount] = await Promise.all([
				db.query.users.findFirst({
					where: eq(users.id, defaultOwnerId),
					columns: { email: true, displayName: true },
				}),
				db
					.select({ n: count() })
					.from(ideas)
					.where(and(eq(ideas.categoryId, id), inArray(ideas.status, [...OPEN_STATUSES]))),
			]);
			if (newOwner) {
				sendCategoryRoleGrantedEmail({
					recipientEmail: newOwner.email,
					recipientFirstName: firstName(newOwner.displayName),
					categoryName: before.name,
					kind: "owner",
					openIdeaCount: Number(openCount[0]?.n ?? 0),
					grantedByName: context.user.displayName,
				}).catch(() => {});
			}
		}

		return { success: true };
	});

export const deleteCategory = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data, context }) => {
		const cat = await db.query.categories.findFirst({
			where: eq(categories.id, data.id),
			columns: { name: true },
		});

		await db
			.update(categories)
			.set({
				deletedAt: new Date(),
				deletedById: context.user.id,
				active: false,
			})
			.where(eq(categories.id, data.id));

		audit({
			actorId: context.user.id,
			action: "category.deleted",
			resourceType: "category",
			resourceId: data.id,
			details: { name: cat?.name },
		});

		return { success: true };
	});

export const restoreCategory = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(z.object({ id: z.string() }))
	.handler(async ({ data, context }) => {
		const cat = await db.query.categories.findFirst({
			where: eq(categories.id, data.id),
			columns: { name: true },
		});

		await db
			.update(categories)
			.set({
				deletedAt: null,
				deletedById: null,
				active: true,
				updatedAt: new Date(),
			})
			.where(eq(categories.id, data.id));

		audit({
			actorId: context.user.id,
			action: "category.restored",
			resourceType: "category",
			resourceId: data.id,
			details: { name: cat?.name },
		});

		return { success: true };
	});

/**
 * Categories that need an Owner (Pri 13): active, idea-holding (ThoughtBox)
 * Categories whose Owner is unset or has been deactivated out-of-band in Entra —
 * which leaves every idea in them unaccountable. Surfaced to admins so they can
 * reassign promptly.
 */
export const getUnownedCategories = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const rows = await db.query.categories.findMany({
			where: and(
				eq(categories.active, true),
				isNull(categories.deletedAt),
				eq(categories.routingType, "thoughtbox"),
			),
			columns: { id: true, name: true, ownerId: true },
			with: { owner: { columns: { displayName: true, active: true } } },
		});

		return rows
			.filter((c) => !c.ownerId || !c.owner || !c.owner.active)
			.map((c) => ({
				id: c.id,
				name: c.name,
				// Departed = had an Owner who is now deactivated (vs never assigned).
				formerOwnerName: c.owner && !c.owner.active ? c.owner.displayName : null,
			}));
	});

/**
 * Resolve a Default Owner pick to a User id, inline-creating the User from the
 * Entra directory if they're not in the system yet. The owner picker searches
 * the directory (existing Users + Entra employees), but the category form
 * persists a User id, so the pick must be materialized before save. Owner is a
 * derived role (ADR-0003) — the upserted User stays `submitter`; owning this
 * Category is what makes them an Owner.
 */
export const ensureUserFromDirectory = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(DirectoryUserSchema)
	.handler(async ({ context, data }) => {
		const { id, active } = await upsertDirectoryUser(data, context.user.id);
		if (!active) {
			throw new Error(
				`${data.displayName}'s account is deactivated — reactivate them on the Users page first.`,
			);
		}
		return { id, displayName: data.displayName };
	});
