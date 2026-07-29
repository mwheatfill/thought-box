import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import SystemAlert from "#/emails/SystemAlert";
import { db } from "#/server/db";
import { settings } from "#/server/db/schema";
import { createAiHealthMonitor } from "#/server/lib/ai-health";
import { sendEmail } from "#/server/lib/email";
import { trackEvent } from "#/server/lib/telemetry";

async function alertRecipient(): Promise<string | null> {
	const setting = await db.query.settings.findFirst({
		where: eq(settings.key, "intake_notification_email"),
	});
	return setting?.value?.trim() || null;
}

/**
 * Synthetic AI provider health check. Runs from the in-process timer in
 * server-adapter.js — deliberately separate from /health so Azure's health
 * check never recycles the app over an AI provider outage.
 */
export const runAiHealthCheck = createAiHealthMonitor({
	ping: async () => {
		await generateText({
			model: anthropic("claude-haiku-4-5-20251001"),
			prompt: "Reply with OK.",
			maxOutputTokens: 8,
			maxRetries: 1,
		});
	},

	notifyDown: async (details, consecutiveFailures) => {
		trackEvent("AiHealthAlert", { details });
		const to = await alertRecipient();
		if (!to) {
			console.warn(
				"[ai-health] Down alert not emailed — no System Notifications address configured",
			);
			return;
		}
		await sendEmail({
			to,
			subject: "ThoughtBox alert: AI assistant is failing",
			templateName: "SystemAlert",
			template: createElement(SystemAlert, {
				variant: "alert",
				title: "AI assistant is failing",
				message: `The ThoughtBox AI chat has failed ${consecutiveFailures} health checks in a row. Employees who try the chat will be offered the fallback form. Check the Anthropic console (Plans & Billing) and status.anthropic.com.`,
				details,
			}),
		});
	},

	notifyRecovered: async () => {
		trackEvent("AiHealthRecovered");
		const to = await alertRecipient();
		if (!to) return;
		await sendEmail({
			to,
			subject: "ThoughtBox: AI assistant recovered",
			templateName: "SystemAlert",
			template: createElement(SystemAlert, {
				variant: "recovered",
				title: "AI assistant recovered",
				message: "The ThoughtBox AI chat is responding normally again.",
				details: null,
			}),
		});
	},
});
