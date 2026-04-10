import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "#/server/db";
import { settings } from "#/server/db/schema";
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
	.handler(async ({ data }) => {
		await db
			.insert(settings)
			.values({ key: data.key, value: data.value, updatedAt: new Date() })
			.onConflictDoUpdate({
				target: settings.key,
				set: { value: data.value, updatedAt: new Date() },
			});
		return { success: true };
	});
