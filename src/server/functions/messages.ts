import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { isClosedStatus } from "#/lib/constants";
import { firstName } from "#/lib/utils";
import { db } from "#/server/db";
import { ideaEvents, ideas, users } from "#/server/db/schema";
import { sendNewMessageEmail } from "#/server/functions/email";
import { loadAttachmentsByEvent } from "#/server/lib/attachments-by-event";
import { loadIdeaCapabilities } from "#/server/lib/idea-authz";
import { resolveIdeaOwnership } from "#/server/lib/ownership";
import { notifyIdeaWatchers } from "#/server/lib/watcher-notify";
import { authMiddleware } from "#/server/middleware/auth";

/**
 * Add a message to an idea's activity thread.
 * Both submitters (own ideas) and owners/admins (assigned ideas) can post.
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
				status: true,
				categoryId: true,
				submitterId: true,
				assignedReviewerId: true,
			},
			with: { category: { columns: { ownerId: true } } },
		});

		if (!idea) throw new Error("Idea not found");

		// The active reviewer is the assigned reviewer, else the Category Owner
		// (ADR-0001) — the "owner side" of the submitter↔owner thread.
		const { activeReviewerId } = resolveIdeaOwnership({
			categoryOwnerId: idea.category.ownerId,
			assignedReviewerId: idea.assignedReviewerId,
		});

		// Closed ideas are locked for everyone — Reopen is the only path back.
		if (isClosedStatus(idea.status)) {
			throw new Error("This idea is closed and locked. Reopen it to continue the conversation.");
		}

		// Access check: the submitter, or anyone on the review side — owner/admin,
		// the assigned reviewer, or a category Watcher (R14).
		const isSubmitter = idea.submitterId === context.user.id;
		if (!isSubmitter) {
			const caps = await loadIdeaCapabilities(context.user, {
				id: idea.id,
				status: idea.status,
				submitterId: idea.submitterId,
				assignedReviewerId: idea.assignedReviewerId,
				categoryId: idea.categoryId,
				categoryOwnerId: idea.category.ownerId,
			});
			if (!caps.canMessageSubmitter) throw new Error("Forbidden");
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

		const preview = data.content.length > 200 ? `${data.content.slice(0, 200)}...` : data.content;

		// Fire-and-forget: notify Watchers of the new public message (submitter-facing).
		notifyIdeaWatchers({
			ideaId: data.ideaId,
			submissionId: idea.submissionId,
			ideaTitle: idea.title,
			categoryId: idea.categoryId,
			eventType: "message",
			actorId: context.user.id,
			submitterId: idea.submitterId,
			update: { kind: "message", messagePreview: preview },
		});

		// Fire-and-forget: notify the other party. From the owner side, the
		// submitter; from the submitter, the idea's active reviewer.
		const isFromOwner = !isSubmitter;
		const recipientId = isFromOwner ? idea.submitterId : activeReviewerId;
		if (recipientId) {
			const recipient = await db.query.users.findFirst({
				where: eq(users.id, recipientId),
				columns: { email: true, displayName: true },
			});
			if (recipient) {
				sendNewMessageEmail({
					recipientEmail: recipient.email,
					recipientFirstName: firstName(recipient.displayName),
					senderName: context.user.displayName,
					submissionId: idea.submissionId,
					ideaTitle: idea.title,
					messagePreview: preview,
					isFromOwner,
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
			columns: {
				id: true,
				status: true,
				categoryId: true,
				submitterId: true,
				assignedReviewerId: true,
			},
			with: { category: { columns: { ownerId: true } } },
		});

		if (!idea) throw new Error("Idea not found");

		// Anyone who can view the idea can read its submitter↔reviewer thread: the
		// submitter, owner/admin, the assigned reviewer, or a roster Contributor on
		// the Category (ADR-0002 view-and-watch).
		const caps = await loadIdeaCapabilities(context.user, {
			id: idea.id,
			status: idea.status,
			submitterId: idea.submitterId,
			assignedReviewerId: idea.assignedReviewerId,
			categoryId: idea.categoryId,
			categoryOwnerId: idea.category.ownerId,
		});
		if (!caps.canView) {
			throw new Error("Forbidden");
		}

		const messages = await db.query.ideaEvents.findMany({
			where: and(eq(ideaEvents.ideaId, data.ideaId), eq(ideaEvents.eventType, "message")),
			orderBy: (e, { asc }) => [asc(e.createdAt)],
			with: {
				actor: { columns: { id: true, displayName: true, photoUrl: true } },
			},
		});

		const attachmentsByMessage = await loadAttachmentsByEvent(
			data.ideaId,
			messages.map((m) => m.id),
		);

		return messages.map((m) => ({
			id: m.id,
			actorId: m.actor.id,
			actorName: m.actor.displayName,
			actorPhotoUrl: m.actor.photoUrl,
			content: m.note,
			createdAt: m.createdAt.toISOString(),
			attachments: attachmentsByMessage.get(m.id) ?? [],
		}));
	});
