import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "#/server/db";
import { categories, settings } from "#/server/db/schema";

/**
 * Load the AI system prompt from settings, injecting the category taxonomy.
 */
export const getSystemPrompt = createServerFn().handler(async () => {
	const [promptSetting, allCategories] = await Promise.all([
		db.query.settings.findFirst({ where: eq(settings.key, "system_prompt") }),
		db.query.categories.findMany({
			where: eq(categories.active, true),
			orderBy: (c, { asc }) => [asc(c.sortOrder)],
		}),
	]);

	const basePrompt = promptSetting?.value ?? "You are a helpful assistant.";

	const categoryTaxonomy = allCategories
		.map((c) => {
			if (c.routingType === "redirect") {
				return `- ${c.name} [REDIRECT]: ${c.description}\n  → Redirect URL: ${c.redirectUrl}\n  → Link label: ${c.redirectLabel}`;
			}
			return `- ${c.name} (ID: ${c.id}): ${c.description}`;
		})
		.join("\n");

	return `${basePrompt}

## Available Categories

The following categories are available. Use the category ID when calling submit_idea. Categories marked [REDIRECT] should use redirect_to_form instead.

${categoryTaxonomy}`;
});

/**
 * Load suggested prompt pills from settings.
 */
export const getSuggestedPrompts = createServerFn().handler(async () => {
	const setting = await db.query.settings.findFirst({
		where: eq(settings.key, "suggested_prompts"),
	});
	if (!setting) return [];
	try {
		return JSON.parse(setting.value) as string[];
	} catch {
		return [];
	}
});

/**
 * Get yearly submission count for the social proof hero.
 */
export const getYearlySubmissionCount = createServerFn().handler(async () => {
	const year = new Date().getFullYear();
	const startOfYear = new Date(year, 0, 1);

	const result = await db.query.ideas.findMany({
		where: (ideas, { gte }) => gte(ideas.submittedAt, startOfYear),
		columns: { id: true },
	});

	return result.length;
});

/**
 * Get the user's personal submission count for the current year.
 */
export const getUserSubmissionCount = createServerFn()
	.inputValidator((data: unknown) => data as string)
	.handler(async ({ data: userId }) => {
		const year = new Date().getFullYear();
		const startOfYear = new Date(year, 0, 1);

		const result = await db.query.ideas.findMany({
			where: (ideas, { and, eq, gte }) =>
				and(eq(ideas.submitterId, userId), gte(ideas.submittedAt, startOfYear)),
			columns: { id: true },
		});

		return result.length;
	});

/**
 * Get monthly activity summary for the social proof strip.
 */
export const getRecentActivitySummary = createServerFn().handler(async () => {
	const now = new Date();
	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

	const monthIdeas = await db.query.ideas.findMany({
		where: (ideas, { gte }) => gte(ideas.submittedAt, startOfMonth),
		columns: { id: true },
	});

	return { monthCount: monthIdeas.length };
});
