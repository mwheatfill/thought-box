import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { ideaEvents, ideas, users } from "#/server/db/schema";
import { sendMentionAlertEmail } from "#/server/functions/email";
import { loadAttachmentsByEvent } from "#/server/lib/attachments-by-event";
import { ownerMiddleware } from "#/server/middleware/auth";

/**
 * Add an internal note to an idea. Owners/admins only — submitters never
 * see this thread, and the server enforces that with ownerMiddleware.
 * Mentions are stored as a parallel user-ID array so notification emails
 * don't have to re-parse the note text.
 */
export const addInternalNote = createServerFn({ method: "POST" })
	.middleware([ownerMiddleware])
	.inputValidator(
		z.object({
			ideaId: z.string(),
			content: z.string().min(1),
			mentions: z
				.array(z.string())
				.optional()
				.transform((arr) => (arr && arr.length > 0 ? Array.from(new Set(arr)) : null)),
		}),
	)
	.handler(async ({ context, data }) => {
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, data.ideaId),
			columns: {
				id: true,
				submissionId: true,
				title: true,
				assignedOwnerId: true,
			},
		});

		if (!idea) throw new Error("Idea not found");

		if (context.user.role === "owner" && idea.assignedOwnerId !== context.user.id) {
			throw new Error("Forbidden");
		}

		const [event] = await db
			.insert(ideaEvents)
			.values({
				ideaId: data.ideaId,
				eventType: "internal_note",
				actorId: context.user.id,
				note: data.content,
				mentions: data.mentions,
			})
			.returning({ id: ideaEvents.id });

		// Fire-and-forget: notify each mentioned user. Skip self-mentions and
		// filter to owner/admin (submitters can't read internal notes anyway).
		if (data.mentions && data.mentions.length > 0) {
			const recipients = await db.query.users.findMany({
				where: and(
					inArray(users.id, data.mentions),
					inArray(users.role, ["owner", "admin"]),
					ne(users.id, context.user.id),
				),
				columns: { email: true, displayName: true },
			});

			const preview = data.content.length > 200 ? `${data.content.slice(0, 200)}...` : data.content;

			for (const recipient of recipients) {
				sendMentionAlertEmail({
					recipientEmail: recipient.email,
					recipientFirstName: recipient.displayName.split(" ")[0],
					mentionerName: context.user.displayName,
					submissionId: idea.submissionId,
					ideaTitle: idea.title,
					notePreview: preview,
				});
			}
		}

		return { success: true, messageId: event.id };
	});

export const getIdeaInternalNotes = createServerFn()
	.middleware([ownerMiddleware])
	.inputValidator(z.object({ ideaId: z.string() }))
	.handler(async ({ context, data }) => {
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, data.ideaId),
			columns: { id: true, assignedOwnerId: true },
		});

		if (!idea) throw new Error("Idea not found");
		if (context.user.role === "owner" && idea.assignedOwnerId !== context.user.id) {
			throw new Error("Forbidden");
		}

		const events = await db.query.ideaEvents.findMany({
			where: and(eq(ideaEvents.ideaId, data.ideaId), eq(ideaEvents.eventType, "internal_note")),
			orderBy: (e, { asc }) => [asc(e.createdAt)],
			with: {
				actor: { columns: { id: true, displayName: true } },
			},
		});

		const attachmentsByEvent = await loadAttachmentsByEvent(
			data.ideaId,
			events.map((e) => e.id),
		);

		return events.map((e) => ({
			id: e.id,
			actorId: e.actor.id,
			actorName: e.actor.displayName,
			content: e.note,
			mentions: e.mentions ?? [],
			createdAt: e.createdAt.toISOString(),
			attachments: attachmentsByEvent.get(e.id) ?? [],
		}));
	});
