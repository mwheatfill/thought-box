import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { attachments } from "#/server/db/schema";
import { authMiddleware } from "#/server/middleware/auth";

export const getIdeaAttachments = createServerFn()
	.middleware([authMiddleware])
	.inputValidator(z.object({ ideaId: z.string() }))
	.handler(async ({ data }) => {
		const result = await db.query.attachments.findMany({
			where: and(eq(attachments.ideaId, data.ideaId), isNull(attachments.deletedAt)),
			orderBy: (a, { desc }) => [desc(a.createdAt)],
			with: {
				uploadedBy: { columns: { displayName: true } },
			},
		});

		return result.map((a) => ({
			id: a.id,
			filename: a.filename,
			contentType: a.contentType,
			sizeBytes: a.sizeBytes,
			uploadedBy: a.uploadedBy.displayName,
			createdAt: a.createdAt.toISOString(),
		}));
	});
