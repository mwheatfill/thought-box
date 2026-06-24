import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { ideaEvents, ideas, users } from "#/server/db/schema";
import { sendMentionAlertEmail } from "#/server/functions/email";
import { loadAttachmentsByEvent } from "#/server/lib/attachments-by-event";
import { loadIdeaCapabilities } from "#/server/lib/idea-authz";
import { authMiddleware } from "#/server/middleware/auth";

/**
 * Add an internal note to an idea. Owners/admins only — submitters never
 * see this thread, and the server enforces that with ownerMiddleware.
 * Mentions are stored as a parallel user-ID array so notification emails
 * don't have to re-parse the note text.
 */
export const addInternalNote = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
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
				status: true,
				categoryId: true,
				submitterId: true,
				assignedReviewerId: true,
			},
			with: { category: { columns: { ownerId: true } } },
		});

		if (!idea) throw new Error("Idea not found");

		// Editing Owner Notes is assignment-gated (ADR-0002): owner/admin always, a
		// Contributor only on ideas assigned to them. Gated on the relationship.
		const caps = await loadIdeaCapabilities(context.user, {
			status: idea.status,
			submitterId: idea.submitterId,
			assignedReviewerId: idea.assignedReviewerId,
			categoryId: idea.categoryId,
			categoryOwnerId: idea.category.ownerId,
		});
		if (!caps.canEditOwnerNotes) {
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

		// Fire-and-forget: notify each mentioned user. Skip self-mentions and only
		// notify those who can actually read internal notes — owner/admin, or this
		// idea's assigned reviewer (who may be a Contributor with the submitter role).
		if (data.mentions && data.mentions.length > 0) {
			const canReadNotes = idea.assignedReviewerId
				? or(inArray(users.role, ["owner", "admin"]), eq(users.id, idea.assignedReviewerId))
				: inArray(users.role, ["owner", "admin"]);
			const recipients = await db.query.users.findMany({
				where: and(inArray(users.id, data.mentions), ne(users.id, context.user.id), canReadNotes),
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
		// Internal notes are owner/admin + assigned-reviewer only (ADR-0002): never
		// the submitter, never an unassigned Contributor.
		const caps = await loadIdeaCapabilities(context.user, {
			status: idea.status,
			submitterId: idea.submitterId,
			assignedReviewerId: idea.assignedReviewerId,
			categoryId: idea.categoryId,
			categoryOwnerId: idea.category.ownerId,
		});
		if (!caps.canReadInternalNotes) {
			throw new Error("Forbidden");
		}

		const events = await db.query.ideaEvents.findMany({
			where: and(eq(ideaEvents.ideaId, data.ideaId), eq(ideaEvents.eventType, "internal_note")),
			orderBy: (e, { asc }) => [asc(e.createdAt)],
			with: {
				actor: { columns: { id: true, displayName: true, photoUrl: true } },
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
			actorPhotoUrl: e.actor.photoUrl,
			content: e.note,
			mentions: e.mentions ?? [],
			createdAt: e.createdAt.toISOString(),
			attachments: attachmentsByEvent.get(e.id) ?? [],
		}));
	});
