import { createServerFn } from "@tanstack/react-start";
import { desc } from "drizzle-orm";
import { db } from "#/server/db";
import { auditLog } from "#/server/db/schema";
import { adminMiddleware } from "#/server/middleware/auth";

export const getAuditLog = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const entries = await db.query.auditLog.findMany({
			orderBy: [desc(auditLog.createdAt)],
			limit: 500,
		});

		// Resolve actor names
		const actorIds = [...new Set(entries.map((e) => e.actorId).filter(Boolean))] as string[];
		const actors =
			actorIds.length > 0
				? await db.query.users.findMany({
						columns: { id: true, displayName: true },
					})
				: [];
		const actorMap = new Map(actors.map((a) => [a.id, a.displayName]));

		return entries.map((e) => ({
			id: e.id,
			actorName: e.actorId ? (actorMap.get(e.actorId) ?? "Unknown") : "System",
			action: e.action,
			resourceType: e.resourceType,
			resourceId: e.resourceId,
			details: e.details as Record<string, unknown> | null,
			createdAt: e.createdAt.toISOString(),
		}));
	});
