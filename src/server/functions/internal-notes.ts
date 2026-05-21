import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { attachments, ideaEvents, ideas, users } from "#/server/db/schema";
import { sendMentionAlertEmail } from "#/server/functions/email";
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
			mentions: z.array(z.string()).optional(),
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

		// Owners can only post on their assigned ideas; admins can post on any.
		if (context.user.role === "owner" && idea.assignedOwnerId !== context.user.id) {
			throw new Error("Forbidden");
		}

		const mentions = data.mentions?.length ? Array.from(new Set(data.mentions)) : null;

		const [event] = await db
			.insert(ideaEvents)
			.values({
				ideaId: data.ideaId,
				eventType: "internal_note",
				actorId: context.user.id,
				note: data.content,
				mentions,
			})
			.returning({ id: ideaEvents.id });

		// Fire-and-forget: notify each mentioned user. Limited to owner/admin
		// role so we don't email submitters who can't see the note anyway.
		if (mentions && mentions.length > 0) {
			const mentioned = await db.query.users.findMany({
				where: and(inArray(users.id, mentions), inArray(users.role, ["owner", "admin"])),
				columns: { id: true, email: true, displayName: true },
			});

			const preview = data.content.length > 200 ? `${data.content.slice(0, 200)}...` : data.content;

			for (const recipient of mentioned) {
				if (recipient.id === context.user.id) continue; // skip self-mention
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

/**
 * Load internal notes for an idea. Owner/admin only.
 */
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

		// Reuse the attachments-on-message join — internal notes use the same
		// messageId field on attachments since both are idea_events.
		const messageIds = events.map((e) => e.id);
		const noteAttachments =
			messageIds.length > 0
				? await db.query.attachments.findMany({
						where: and(eq(attachments.ideaId, data.ideaId), isNull(attachments.deletedAt)),
						columns: {
							id: true,
							messageId: true,
							filename: true,
							contentType: true,
							sizeBytes: true,
						},
					})
				: [];

		const attachmentsByMessage = new Map<string, typeof noteAttachments>();
		for (const att of noteAttachments) {
			if (!att.messageId) continue;
			const existing = attachmentsByMessage.get(att.messageId) ?? [];
			existing.push(att);
			attachmentsByMessage.set(att.messageId, existing);
		}

		return events.map((e) => ({
			id: e.id,
			actorId: e.actor.id,
			actorName: e.actor.displayName,
			content: e.note,
			mentions: e.mentions ?? [],
			createdAt: e.createdAt.toISOString(),
			attachments: (attachmentsByMessage.get(e.id) ?? []).map((a) => ({
				id: a.id,
				filename: a.filename,
				contentType: a.contentType,
				sizeBytes: a.sizeBytes,
			})),
		}));
	});

/**
 * Load owner + admin directory for the @mention picker. Returns active
 * users only, sorted by display name.
 */
export const getMentionableUsers = createServerFn()
	.middleware([ownerMiddleware])
	.handler(async () => {
		const rows = await db.query.users.findMany({
			where: and(inArray(users.role, ["owner", "admin"]), eq(users.active, true)),
			columns: {
				id: true,
				displayName: true,
				email: true,
				jobTitle: true,
				photoUrl: true,
			},
			orderBy: (u, { asc }) => [asc(u.displayName)],
		});
		return rows;
	});
