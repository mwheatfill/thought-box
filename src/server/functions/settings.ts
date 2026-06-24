import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { settings } from "#/server/db/schema";
import { audit } from "#/server/lib/audit";
import { adminMiddleware } from "#/server/middleware/auth";

export const getSettings = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const result = await db.query.settings.findMany();
		return Object.fromEntries(result.map((s) => [s.key, s.value]));
	});

export const updateSetting = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(z.object({ key: z.string(), value: z.string() }))
	.handler(async ({ data, context }) => {
		const before = await db.query.settings.findFirst({
			where: eq(settings.key, data.key),
			columns: { value: true },
		});

		await db
			.insert(settings)
			.values({ key: data.key, value: data.value, updatedAt: new Date() })
			.onConflictDoUpdate({
				target: settings.key,
				set: { value: data.value, updatedAt: new Date() },
			});

		const preview = (v: string | undefined | null) =>
			v == null ? null : v.length > 100 ? `${v.slice(0, 100)}...` : v;
		audit({
			actorId: context.user.id,
			action: "settings.updated",
			resourceType: "setting",
			resourceId: data.key,
			details: { from: preview(before?.value), to: preview(data.value) },
		});

		return { success: true };
	});
