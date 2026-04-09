import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, tool } from "ai";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { z } from "zod";
import { db } from "#/server/db";
import { categories, conversations, ideaEvents, ideas, settings, users } from "#/server/db/schema";
import type { ConversationMessage } from "#/server/db/schema";
import { sendIdeaAssignedEmail, sendIdeaSubmittedEmail } from "#/server/functions/email";
import { calculateSlaDueDate } from "#/server/lib/sla";
import { nextSubmissionId } from "#/server/lib/submission-id";

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
				execute: async ({ title, description, categoryId, expectedBenefit, impactArea }) => {
					if (!userId) return { error: "User not authenticated" };

					const category = await db.query.categories.findFirst({
						where: eq(categories.id, categoryId),
					});
					if (!category) return { error: "Category not found" };

					// Generate submission ID from PostgreSQL sequence
					const connectionString = process.env.DATABASE_URL;
					if (!connectionString) return { error: "Database not configured" };
					const sql = postgres(connectionString, { max: 1 });

					let submissionId: string;
					try {
						submissionId = await nextSubmissionId(sql);
					} finally {
						await sql.end();
					}

					const now = new Date();
					const slaDueDate = calculateSlaDueDate(now);

					// Create the idea
					const [idea] = await db
						.insert(ideas)
						.values({
							submissionId,
							title,
							description,
							expectedBenefit: expectedBenefit ?? null,
							categoryId,
							impactArea: impactArea ?? null,
							status: "new",
							submitterId: userId,
							assignedLeaderId: category.defaultLeaderId,
							slaDueDate,
							submittedAt: now,
						})
						.returning();

					// Log the created event
					await db.insert(ideaEvents).values({
						ideaId: idea.id,
						eventType: "created",
						actorId: userId,
						newValue: "new",
					});

					// Save the conversation
					const conversationMessages: ConversationMessage[] = body.messages
						?.filter(
							(m: { role: string; content: unknown }) =>
								(m.role === "user" || m.role === "assistant") && typeof m.content === "string",
						)
						.map((m: { role: string; content: string }) => ({
							role: m.role as "user" | "assistant",
							content: m.content,
							timestamp: now.toISOString(),
						}));

					if (conversationMessages?.length > 0) {
						await db.insert(conversations).values({
							ideaId: idea.id,
							userId,
							messages: conversationMessages,
							classification: category.name,
							routingOutcome: "submitted",
						});
					}

					// Look up submitter and assigned leader for emails
					const submitter = await db.query.users.findFirst({
						where: eq(users.id, userId),
						columns: { email: true, displayName: true, department: true },
					});

					let assignedLeaderName: string | null = null;
					if (category.defaultLeaderId) {
						const leader = await db.query.users.findFirst({
							where: eq(users.id, category.defaultLeaderId),
							columns: { displayName: true, email: true },
						});
						assignedLeaderName = leader?.displayName ?? null;

						// Fire-and-forget: notify the leader
						if (leader) {
							sendIdeaAssignedEmail({
								leaderEmail: leader.email,
								leaderFirstName: leader.displayName.split(" ")[0],
								submissionId: idea.submissionId,
								ideaTitle: idea.title,
								categoryName: category.name,
								submitterName: submitter?.displayName ?? "An employee",
								submitterDepartment: submitter?.department ?? null,
							});
						}
					}

					// Fire-and-forget: confirm to submitter
					if (submitter) {
						const year = new Date().getFullYear();
						const startOfYear = new Date(year, 0, 1);
						const countResult = await db.query.ideas.findMany({
							where: (i, { and, eq: e, gte }) =>
								and(e(i.submitterId, userId), gte(i.submittedAt, startOfYear)),
							columns: { id: true },
						});

						sendIdeaSubmittedEmail({
							submitterEmail: submitter.email,
							submitterFirstName: submitter.displayName.split(" ")[0],
							submissionId: idea.submissionId,
							ideaTitle: idea.title,
							categoryName: category.name,
							ideaCount: countResult.length,
						});
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
				},
			}),
			redirect_to_form: tool({
				description:
					"Show the employee a link to an external intake form when their idea belongs to a redirect category. Use this for categories marked [REDIRECT].",
				inputSchema: z.object({
					categoryName: z.string().describe("The category name for context"),
					redirectUrl: z.string().describe("URL of the external intake form"),
					redirectLabel: z.string().describe("Display text for the link button"),
				}),
				execute: async ({ categoryName, redirectUrl, redirectLabel }) => {
					// Save the redirected conversation
					if (userId) {
						const conversationMessages: ConversationMessage[] = body.messages
							?.filter(
								(m: { role: string; content: unknown }) =>
									(m.role === "user" || m.role === "assistant") && typeof m.content === "string",
							)
							.map((m: { role: string; content: string }) => ({
								role: m.role as "user" | "assistant",
								content: m.content,
								timestamp: new Date().toISOString(),
							}));

						if (conversationMessages?.length > 0) {
							await db.insert(conversations).values({
								userId,
								messages: conversationMessages,
								classification: categoryName,
								routingOutcome: "redirected",
							});
						}
					}

					return { categoryName, redirectUrl, redirectLabel };
				},
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
