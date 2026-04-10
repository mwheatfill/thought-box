import { createServerFn } from "@tanstack/react-start";
import { eq, gte } from "drizzle-orm";
import { db } from "#/server/db";
import { categories, ideas, settings } from "#/server/db/schema";

/**
 * Load all data needed for the landing page in a single server function.
 */
export const getLandingData = createServerFn().handler(async () => {
	const now = new Date();
	const year = now.getFullYear();
	const startOfYear = new Date(year, 0, 1);
	const startOfMonth = new Date(year, now.getMonth(), 1);

	const [yearlyIdeas, monthlyIdeas, promptsSetting, thresholdSetting, activeCategories] =
		await Promise.all([
			db.query.ideas.findMany({
				where: gte(ideas.submittedAt, startOfYear),
				columns: { id: true },
			}),
			db.query.ideas.findMany({
				where: gte(ideas.submittedAt, startOfMonth),
				columns: { id: true },
			}),
			db.query.settings.findFirst({
				where: eq(settings.key, "suggested_prompts"),
			}),
			db.query.settings.findFirst({
				where: eq(settings.key, "social_proof_min_threshold"),
			}),
			db.query.categories.findMany({
				where: eq(categories.active, true),
				orderBy: (c, { asc }) => [asc(c.sortOrder)],
				columns: { id: true, name: true, routingType: true },
			}),
		]);

	let suggestedPrompts: string[] = [];
	try {
		suggestedPrompts = promptsSetting ? JSON.parse(promptsSetting.value) : [];
	} catch {
		suggestedPrompts = [];
	}

	const threshold = thresholdSetting ? Number.parseInt(thresholdSetting.value, 10) : 5;

	return {
		yearlyCount: yearlyIdeas.length,
		monthlyCount: monthlyIdeas.length,
		suggestedPrompts,
		showSocialProof: monthlyIdeas.length >= threshold,
		categories: activeCategories.filter((c) => c.routingType === "thoughtbox"),
	};
});
