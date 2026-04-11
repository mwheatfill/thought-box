import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { attachments, ideaEvents, ideas, users } from "#/server/db/schema";
import { sendNewMessageEmail } from "#/server/functions/email";
import { authMiddleware } from "#/server/middleware/auth";

/**
 * Add a message to an idea's activity thread.
 * Both submitters (own ideas) and leaders/admins (assigned ideas) can post.
 */
export const addMessage = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ ideaId: z.string(), content: z.string().min(1) }))
	.handler(async ({ context, data }) => {
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, data.ideaId),
			columns: {
				id: true,
				submissionId: true,
				title: true,
				submitterId: true,
				assignedLeaderId: true,
			},
		});

		if (!idea) throw new Error("Idea not found");

		// Access check
		const isSubmitter = idea.submitterId === context.user.id;
		const isAssigned = idea.assignedLeaderId === context.user.id;
		const isAdmin = context.user.role === "admin";

		if (!isSubmitter && !isAssigned && !isAdmin) {
			throw new Error("Forbidden");
		}

		const [event] = await db
			.insert(ideaEvents)
			.values({
				ideaId: data.ideaId,
				eventType: "message",
				actorId: context.user.id,
				note: data.content,
			})
			.returning({ id: ideaEvents.id });

		// Fire-and-forget: notify the other party
		const isFromLeader = !isSubmitter;
		const recipientId = isFromLeader ? idea.submitterId : idea.assignedLeaderId;
		if (recipientId) {
			const recipient = await db.query.users.findFirst({
				where: eq(users.id, recipientId),
				columns: { email: true, displayName: true },
			});
			if (recipient) {
				sendNewMessageEmail({
					recipientEmail: recipient.email,
					recipientFirstName: recipient.displayName.split(" ")[0],
					senderName: context.user.displayName,
					submissionId: idea.submissionId,
					ideaTitle: idea.title,
					messagePreview:
						data.content.length > 200 ? `${data.content.slice(0, 200)}...` : data.content,
					isFromLeader,
				});
			}
		}

		return { success: true, messageId: event.id };
	});

/**
 * Get messages for an idea's comment thread.
 */
export const getIdeaMessages = createServerFn()
	.middleware([authMiddleware])
	.inputValidator(z.object({ ideaId: z.string() }))
	.handler(async ({ context, data }) => {
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, data.ideaId),
			columns: { id: true, submitterId: true, assignedLeaderId: true },
		});

		if (!idea) throw new Error("Idea not found");

		// Access check
		const isSubmitter = idea.submitterId === context.user.id;
		const isAssigned = idea.assignedLeaderId === context.user.id;
		const isAdmin = context.user.role === "admin";

		if (!isSubmitter && !isAssigned && !isAdmin) {
			throw new Error("Forbidden");
		}

		const messages = await db.query.ideaEvents.findMany({
			where: and(eq(ideaEvents.ideaId, data.ideaId), eq(ideaEvents.eventType, "message")),
			orderBy: (e, { asc }) => [asc(e.createdAt)],
			with: {
				actor: { columns: { id: true, displayName: true } },
			},
		});

		// Load attachments for all messages in one query
		const messageIds = messages.map((m) => m.id);
		const messageAttachments =
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

		// Group by messageId
		const attachmentsByMessage = new Map<string, typeof messageAttachments>();
		for (const att of messageAttachments) {
			if (!att.messageId) continue;
			const existing = attachmentsByMessage.get(att.messageId) ?? [];
			existing.push(att);
			attachmentsByMessage.set(att.messageId, existing);
		}

		return messages.map((m) => ({
			id: m.id,
			actorId: m.actor.id,
			actorName: m.actor.displayName,
			content: m.note,
			createdAt: m.createdAt.toISOString(),
			attachments: (attachmentsByMessage.get(m.id) ?? []).map((a) => ({
				id: a.id,
				filename: a.filename,
				contentType: a.contentType,
				sizeBytes: a.sizeBytes,
			})),
		}));
	});
