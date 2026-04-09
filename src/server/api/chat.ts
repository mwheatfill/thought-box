import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, tool } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { categories, settings, users } from "#/server/db/schema";

export async function handleChatRequest(request: Request): Promise<Response> {
	const body = await request.json();
	const userId = body.userId;

	// Convert UI messages to model messages for streamText
	const messages = await convertToModelMessages(body.messages);

	// Load system prompt and category taxonomy
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

	// Load user info for personalized greeting context
	let userContext = "";
	if (userId) {
		const user = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { displayName: true, department: true, jobTitle: true },
		});
		if (user) {
			const firstName = user.displayName.split(" ")[0];
			userContext = `\n\nThe current employee is ${firstName}. Their full name is ${user.displayName}.`;
			if (user.department) userContext += ` They work in ${user.department}.`;
			if (user.jobTitle) userContext += ` Their title is ${user.jobTitle}.`;
		}
	}

	const systemPrompt = `${basePrompt}

## Available Categories

The following categories are available. Use the category ID when calling submit_idea. Categories marked [REDIRECT] should use redirect_to_form instead.

${categoryTaxonomy}${userContext}`;

	const result = streamText({
		model: anthropic("claude-haiku-4-5-20251001"),
		system: systemPrompt,
		messages,
		tools: {
			submit_idea: tool({
				description:
					"Submit the employee's idea to ThoughtBox after they confirm the summary. Call this only after presenting a summary and getting the employee's confirmation.",
				inputSchema: z.object({
					title: z.string().describe("Concise summary of the idea (1 sentence)"),
					description: z.string().describe("Full idea description from the conversation"),
					categoryId: z.string().describe("ID of the classified category"),
					expectedBenefit: z
						.string()
						.optional()
						.describe("What problem it solves or what improvement it brings"),
					impactArea: z
						.enum(["cost", "time", "safety", "customer", "culture"])
						.optional()
						.describe("Primary impact area if obvious from the conversation"),
				}),
			}),
			redirect_to_form: tool({
				description:
					"Show the employee a link to an external intake form when their idea belongs to a redirect category. Use this for categories marked [REDIRECT].",
				inputSchema: z.object({
					categoryName: z.string().describe("The category name for context"),
					redirectUrl: z.string().describe("URL of the external intake form"),
					redirectLabel: z.string().describe("Display text for the link button"),
				}),
			}),
			get_category_details: tool({
				description:
					"Look up details about a specific category to help classify an idea. Use this if you need more context about what belongs in a category.",
				inputSchema: z.object({
					categoryName: z.string().describe("The name of the category to look up"),
				}),
				execute: async ({ categoryName }) => {
					const category = await db.query.categories.findFirst({
						where: eq(categories.name, categoryName),
					});
					if (!category) return { error: "Category not found" };
					return {
						id: category.id,
						name: category.name,
						description: category.description,
						routingType: category.routingType,
						redirectUrl: category.redirectUrl,
						redirectLabel: category.redirectLabel,
					};
				},
			}),
		},
	});

	return result.toUIMessageStreamResponse();
}
