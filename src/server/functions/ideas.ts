import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { z } from "zod";
import { db } from "#/server/db";
import { categories, conversations, ideaEvents, ideas, users } from "#/server/db/schema";
import type { ConversationMessage } from "#/server/db/schema";
import { calculateSlaDueDate } from "#/server/lib/sla";
import { nextSubmissionId } from "#/server/lib/submission-id";
import { authMiddleware } from "#/server/middleware/auth";

const CreateIdeaSchema = z.object({
	title: z.string().min(1),
	description: z.string().min(1),
	categoryId: z.string().min(1),
	expectedBenefit: z.string().optional(),
	impactArea: z.enum(["cost", "time", "safety", "customer", "culture"]).optional(),
	conversationMessages: z
		.array(
			z.object({
				role: z.enum(["user", "assistant", "system"]),
				content: z.string(),
				timestamp: z.string(),
			}),
		)
		.optional(),
});

/**
 * Create a new idea from the AI chat intake.
 * Generates submission ID, calculates SLA, assigns leader, logs event, saves conversation.
 */
export const createIdea = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(CreateIdeaSchema)
	.handler(async ({ context, data }) => {
		const now = new Date();

		// Look up the category to get the default leader
		const category = await db.query.categories.findFirst({
			where: eq(categories.id, data.categoryId),
		});

		if (!category) {
			return { error: "Category not found" };
		}

		// Generate submission ID from PostgreSQL sequence
		const connectionString = process.env.DATABASE_URL;
		if (!connectionString) throw new Error("DATABASE_URL is required");
		const sql = postgres(connectionString, { max: 1 });

		let submissionId: string;
		try {
			submissionId = await nextSubmissionId(sql);
		} finally {
			await sql.end();
		}

		const slaDueDate = calculateSlaDueDate(now);

		// Create the idea
		const [idea] = await db
			.insert(ideas)
			.values({
				submissionId,
				title: data.title,
				description: data.description,
				expectedBenefit: data.expectedBenefit ?? null,
				categoryId: data.categoryId,
				impactArea: data.impactArea ?? null,
				status: "new",
				submitterId: context.user.id,
				assignedLeaderId: category.defaultLeaderId,
				slaDueDate,
				submittedAt: now,
			})
			.returning();

		// Log the created event
		await db.insert(ideaEvents).values({
			ideaId: idea.id,
			eventType: "created",
			actorId: context.user.id,
			newValue: "new",
		});

		// Save the conversation
		if (data.conversationMessages && data.conversationMessages.length > 0) {
			await db.insert(conversations).values({
				ideaId: idea.id,
				userId: context.user.id,
				messages: data.conversationMessages as ConversationMessage[],
				classification: category.name,
				routingOutcome: "submitted",
			});
		}

		// Look up the assigned leader's name for the confirmation message
		let assignedLeaderName: string | null = null;
		if (category.defaultLeaderId) {
			const leader = await db.query.users.findFirst({
				where: eq(users.id, category.defaultLeaderId),
				columns: { displayName: true },
			});
			assignedLeaderName = leader?.displayName ?? null;
		}

		return {
			data: {
				id: idea.id,
				submissionId: idea.submissionId,
				title: idea.title,
				categoryName: category.name,
				assignedLeaderName,
			},
		};
	});
