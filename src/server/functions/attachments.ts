import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { attachments, ideaEvents } from "#/server/db/schema";
import { authMiddleware } from "#/server/middleware/auth";

export const getIdeaAttachments = createServerFn()
	.middleware([authMiddleware])
	.inputValidator(z.object({ ideaId: z.string() }))
	.handler(async ({ context, data }) => {
		const result = await db.query.attachments.findMany({
			where: and(eq(attachments.ideaId, data.ideaId), isNull(attachments.deletedAt)),
			orderBy: (a, { desc }) => [desc(a.createdAt)],
			with: {
				uploadedBy: { columns: { displayName: true } },
			},
		});

		// An attachment is "internal" if EITHER (a) its parent event is an
		// internal_note, OR (b) the row's is_internal flag was set at upload
		// time (direct Attachments-tab uploads marked private by an owner).
		// Both feed the same UI badge + the same submitter filter.
		const messageIds = result.map((a) => a.messageId).filter((id): id is string => !!id);
		const internalEventIds =
			messageIds.length > 0
				? new Set(
						(
							await db.query.ideaEvents.findMany({
								where: and(
									inArray(ideaEvents.id, messageIds),
									eq(ideaEvents.eventType, "internal_note"),
								),
								columns: { id: true },
							})
						).map((e) => e.id),
					)
				: new Set<string>();

		const enriched = result.map((a) => ({
			row: a,
			isInternal: a.isInternal || !!(a.messageId && internalEventIds.has(a.messageId)),
		}));

		const visible =
			context.user.role === "submitter" ? enriched.filter((e) => !e.isInternal) : enriched;

		return visible.map((e) => ({
			id: e.row.id,
			filename: e.row.filename,
			contentType: e.row.contentType,
			sizeBytes: e.row.sizeBytes,
			uploadedById: e.row.uploadedById,
			uploadedBy: e.row.uploadedBy.displayName,
			createdAt: e.row.createdAt.toISOString(),
			isInternal: e.isInternal,
		}));
	});

const UpdateVisibilityInput = z.object({
	attachmentId: z.string(),
	isInternal: z.boolean(),
});

/**
 * Flip an attachment's visibility (Public ↔ Private). Permission: the
 * uploader can change their own files; admins can change any file.
 */
export const updateAttachmentVisibility = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(UpdateVisibilityInput)
	.handler(async ({ context, data }) => {
		const attachment = await db.query.attachments.findFirst({
			where: and(eq(attachments.id, data.attachmentId), isNull(attachments.deletedAt)),
			columns: { id: true, uploadedById: true, messageId: true },
		});
		if (!attachment) throw new Error("Not found");

		const canEdit = context.user.role === "admin" || attachment.uploadedById === context.user.id;
		if (!canEdit) throw new Error("Forbidden");

		// Thread-bound attachments derive visibility from their parent event;
		// flipping is_internal would desync the badge from the parent. Block
		// the flip in that case — the user can delete + re-upload if they
		// really need a different visibility.
		if (attachment.messageId) {
			throw new Error("Visibility of thread attachments follows the parent message or note.");
		}

		await db
			.update(attachments)
			.set({ isInternal: data.isInternal })
			.where(eq(attachments.id, data.attachmentId));

		return { success: true };
	});
