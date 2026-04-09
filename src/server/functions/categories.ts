import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { categories } from "#/server/db/schema";
import { adminMiddleware } from "#/server/middleware/auth";

export const getCategories = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const result = await db.query.categories.findMany({
			orderBy: (c, { asc }) => [asc(c.sortOrder)],
			with: {
				defaultLeader: { columns: { id: true, displayName: true } },
			},
		});

		return result.map((c) => ({
			id: c.id,
			name: c.name,
			description: c.description,
			routingType: c.routingType,
			redirectUrl: c.redirectUrl,
			redirectLabel: c.redirectLabel,
			defaultLeaderId: c.defaultLeaderId,
			defaultLeaderName: c.defaultLeader?.displayName ?? null,
			keystoneFields: c.keystoneFields,
			sortOrder: c.sortOrder,
			active: c.active,
		}));
	});

const CategorySchema = z.object({
	name: z.string().min(1),
	description: z.string().min(1),
	routingType: z.enum(["thoughtbox", "redirect"]),
	redirectUrl: z.string().nullable().optional(),
	redirectLabel: z.string().nullable().optional(),
	defaultLeaderId: z.string().nullable().optional(),
	keystoneFields: z.boolean().optional(),
	sortOrder: z.number().optional(),
});

export const createCategory = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(CategorySchema)
	.handler(async ({ data }) => {
		const [category] = await db
			.insert(categories)
			.values({
				name: data.name,
				description: data.description,
				routingType: data.routingType,
				redirectUrl: data.redirectUrl ?? null,
				redirectLabel: data.redirectLabel ?? null,
				defaultLeaderId: data.defaultLeaderId ?? null,
				keystoneFields: data.keystoneFields ?? false,
				sortOrder: data.sortOrder ?? 0,
			})
			.returning();
		return category;
	});

const UpdateCategorySchema = z.object({
	id: z.string(),
	name: z.string().min(1).optional(),
	description: z.string().min(1).optional(),
	routingType: z.enum(["thoughtbox", "redirect"]).optional(),
	redirectUrl: z.string().nullable().optional(),
	redirectLabel: z.string().nullable().optional(),
	defaultLeaderId: z.string().nullable().optional(),
	keystoneFields: z.boolean().optional(),
	sortOrder: z.number().optional(),
	active: z.boolean().optional(),
});

export const updateCategory = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(UpdateCategorySchema)
	.handler(async ({ data }) => {
		const { id, ...updates } = data;
		await db
			.update(categories)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(categories.id, id));
		return { success: true };
	});

/** Get leaders for the default leader dropdown */
export const getLeaders = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const result = await db.query.users.findMany({
			where: (u, { or, eq }) => or(eq(u.role, "leader"), eq(u.role, "admin")),
			columns: { id: true, displayName: true, role: true },
			orderBy: (u, { asc }) => [asc(u.displayName)],
		});
		return result;
	});
