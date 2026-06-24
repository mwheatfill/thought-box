import { anthropic } from "@ai-sdk/anthropic";
import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { categories, ideas } from "#/server/db/schema";
import { loadIdeaCapabilities } from "#/server/lib/idea-authz";
import { authMiddleware } from "#/server/middleware/auth";

/**
 * Suggest the best-fit Category for an existing idea, reusing the embedded
 * classifier (CONTEXT: AI category suggest). Offered to the active reviewer when
 * they're unsure where an idea belongs — before the Needs Triage escape hatch.
 * Advisory only: it returns a recommendation, it does not move the idea.
 *
 * Degrades gracefully — if the AI provider is unavailable or returns something
 * unusable, it returns `{ suggestion: null }` so the UI can fall back to triage.
 */
export const suggestCategoryForIdea = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ ideaId: z.string() }))
	.handler(async ({ context, data }) => {
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, data.ideaId),
			columns: {
				id: true,
				title: true,
				description: true,
				status: true,
				categoryId: true,
				submitterId: true,
				assignedReviewerId: true,
			},
			with: { category: { columns: { ownerId: true } } },
		});
		if (!idea) throw new Error("Idea not found");

		// Same gate as triage: the active reviewer working the idea.
		const caps = await loadIdeaCapabilities(context.user, {
			id: idea.id,
			status: idea.status,
			submitterId: idea.submitterId,
			assignedReviewerId: idea.assignedReviewerId,
			categoryId: idea.categoryId,
			categoryOwnerId: idea.category.ownerId,
		});
		if (!caps.canEditOwnerNotes) {
			throw new Error("Forbidden");
		}

		// Candidate destinations: active, ThoughtBox-routing, owned, not the current one.
		const candidates = await db.query.categories.findMany({
			where: and(
				eq(categories.active, true),
				eq(categories.routingType, "thoughtbox"),
				ne(categories.id, idea.categoryId),
			),
			columns: { id: true, name: true, description: true, ownerId: true },
		});
		const placeable = candidates.filter((c) => !!c.ownerId);
		if (placeable.length === 0) {
			return { suggestion: null as null | { categoryId: string; name: string; reasoning: string } };
		}

		const taxonomy = placeable.map((c) => `- ${c.name} (ID: ${c.id}): ${c.description}`).join("\n");

		try {
			const { object } = await generateObject({
				model: anthropic("claude-haiku-4-5-20251001"),
				schema: z.object({
					categoryId: z.string().describe("The ID of the single best-fit category."),
					reasoning: z.string().describe("One concise sentence explaining the fit."),
				}),
				prompt: `You are classifying an employee suggestion into the best-fit category for a credit union's idea program.

Idea title: ${idea.title}
Idea description: ${idea.description}

Choose the single best category by ID from this list:
${taxonomy}

Respond with the category ID exactly as given and a one-sentence reason.`,
			});

			const picked = placeable.find((c) => c.id === object.categoryId);
			if (!picked) {
				return {
					suggestion: null as null | { categoryId: string; name: string; reasoning: string },
				};
			}
			return {
				suggestion: { categoryId: picked.id, name: picked.name, reasoning: object.reasoning },
			};
		} catch {
			// Provider down / parse failure → no suggestion; the UI falls back to triage.
			return { suggestion: null as null | { categoryId: string; name: string; reasoning: string } };
		}
	});
