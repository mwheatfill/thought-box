import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { ideaEvents, ideas } from "#/server/db/schema";
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

		await db.insert(ideaEvents).values({
			ideaId: data.ideaId,
			eventType: "message",
			actorId: context.user.id,
			note: data.content,
		});

		return { success: true };
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

		return messages.map((m) => ({
			id: m.id,
			actorId: m.actor.id,
			actorName: m.actor.displayName,
			content: m.note,
			createdAt: m.createdAt.toISOString(),
		}));
	});
