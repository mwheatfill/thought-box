import { createServerFn } from "@tanstack/react-start";
import { eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { attachments, categories } from "#/server/db/schema";
import { audit } from "#/server/lib/audit";
import { adminMiddleware } from "#/server/middleware/auth";

export const getRecycleBin = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const [deletedCategories, deletedAttachments] = await Promise.all([
			db.query.categories.findMany({
				where: isNotNull(categories.deletedAt),
				orderBy: (c, { desc }) => [desc(c.deletedAt)],
			}),
			db.query.attachments.findMany({
				where: isNotNull(attachments.deletedAt),
				orderBy: (a, { desc }) => [desc(a.deletedAt)],
				with: {
					uploadedBy: { columns: { displayName: true } },
				},
			}),
		]);

		// Resolve who deleted each item
		const deleterIds = [
			...deletedCategories.map((c) => c.deletedById),
			...deletedAttachments.map((a) => a.deletedById),
		].filter(Boolean) as string[];

		const deleters =
			deleterIds.length > 0
				? await db.query.users.findMany({ columns: { id: true, displayName: true } })
				: [];
		const deleterMap = new Map(deleters.map((u) => [u.id, u.displayName]));

		const items = [
			...deletedCategories.map((c) => ({
				id: c.id,
				type: "category" as const,
				name: c.name,
				details: c.description,
				deletedAt: c.deletedAt?.toISOString() ?? "",
				deletedBy: c.deletedById ? (deleterMap.get(c.deletedById) ?? "Unknown") : "Unknown",
			})),
			...deletedAttachments.map((a) => ({
				id: a.id,
				type: "attachment" as const,
				name: a.filename,
				details: `${(a.sizeBytes / 1024).toFixed(0)} KB · ${a.contentType}`,
				deletedAt: a.deletedAt?.toISOString() ?? "",
				deletedBy: a.deletedById ? (deleterMap.get(a.deletedById) ?? "Unknown") : "Unknown",
			})),
		].sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

		return items;
	});

export const restoreItem = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(z.object({ id: z.string(), type: z.enum(["category", "attachment"]) }))
	.handler(async ({ data, context }) => {
		if (data.type === "category") {
			await db
				.update(categories)
				.set({ deletedAt: null, deletedById: null, active: true, updatedAt: new Date() })
				.where(eq(categories.id, data.id));
		} else {
			await db
				.update(attachments)
				.set({ deletedAt: null, deletedById: null })
				.where(eq(attachments.id, data.id));
		}

		audit({
			actorId: context.user.id,
			action: `${data.type}.restored`,
			resourceType: data.type,
			resourceId: data.id,
		});

		return { success: true };
	});
