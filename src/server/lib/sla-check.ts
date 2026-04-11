import { and, eq, lte } from "drizzle-orm";
import { db } from "#/server/db";
import { ideaEvents, ideas, settings } from "#/server/db/schema";
import { sendSlaReminderEmail } from "#/server/functions/email";

const STATUS_LABELS: Record<string, string> = {
	new: "New",
	under_review: "Under Review",
};

/**
 * Check all open ideas against SLA reminder thresholds and send emails.
 * Idempotent — checks idea_events for existing reminder_sent at each threshold.
 *
 * Default thresholds:
 * - Status "new": remind at 5 days and 14 days after submission
 * - Status "under_review": remind at 30 days after submission
 *
 * Thresholds are configurable via admin settings.
 */
export async function checkSlaReminders(): Promise<{ sent: number; checked: number }> {
	// Load configurable thresholds from settings
	const [newFirst, newSecond, reviewDays] = await Promise.all([
		db.query.settings.findFirst({ where: eq(settings.key, "sla_new_first_reminder_days") }),
		db.query.settings.findFirst({ where: eq(settings.key, "sla_new_second_reminder_days") }),
		db.query.settings.findFirst({ where: eq(settings.key, "sla_review_reminder_days") }),
	]);

	const NEW_FIRST = Number(newFirst?.value ?? 5);
	const NEW_SECOND = Number(newSecond?.value ?? 14);
	const REVIEW_DAYS = Number(reviewDays?.value ?? 30);

	const now = new Date();
	let sent = 0;

	// Find ideas in "new" status submitted >= NEW_FIRST days ago
	const newIdeas = await db.query.ideas.findMany({
		where: and(
			eq(ideas.status, "new"),
			lte(ideas.submittedAt, new Date(now.getTime() - NEW_FIRST * 86400000)),
		),
		with: {
			submitter: { columns: { displayName: true } },
			assignedLeader: { columns: { id: true, email: true, displayName: true } },
			category: { columns: { name: true } },
		},
	});

	// Find ideas in "under_review" status submitted >= REVIEW_DAYS days ago
	const reviewIdeas = await db.query.ideas.findMany({
		where: and(
			eq(ideas.status, "under_review"),
			lte(ideas.submittedAt, new Date(now.getTime() - REVIEW_DAYS * 86400000)),
		),
		with: {
			submitter: { columns: { displayName: true } },
			assignedLeader: { columns: { id: true, email: true, displayName: true } },
			category: { columns: { name: true } },
		},
	});

	const allIdeas = [
		...newIdeas.map((idea) => ({
			idea,
			thresholds: [NEW_FIRST, NEW_SECOND] as number[],
			statusLabel: "New",
		})),
		...reviewIdeas.map((idea) => ({
			idea,
			thresholds: [REVIEW_DAYS] as number[],
			statusLabel: "Under Review",
		})),
	];

	const checked = allIdeas.length;

	for (const { idea, thresholds, statusLabel } of allIdeas) {
		if (!idea.assignedLeader) continue;

		const daysSince = Math.floor((now.getTime() - new Date(idea.submittedAt).getTime()) / 86400000);

		// Check each threshold for this idea
		for (const threshold of thresholds) {
			if (daysSince < threshold) continue;

			// Check if we already sent a reminder for this threshold
			const existing = await db.query.ideaEvents.findFirst({
				where: and(
					eq(ideaEvents.ideaId, idea.id),
					eq(ideaEvents.eventType, "reminder_sent"),
					eq(ideaEvents.newValue, String(threshold)),
				),
			});

			if (existing) continue;

			// Send the reminder
			await sendSlaReminderEmail({
				leaderEmail: idea.assignedLeader.email,
				leaderFirstName: idea.assignedLeader.displayName.split(" ")[0],
				submissionId: idea.submissionId,
				ideaTitle: idea.title,
				submitterName: idea.submitter.displayName,
				categoryName: idea.category.name,
				currentStatus: statusLabel,
				daysSinceSubmission: daysSince,
			});

			// Log the reminder event (threshold stored in newValue for dedup)
			await db.insert(ideaEvents).values({
				ideaId: idea.id,
				eventType: "reminder_sent",
				actorId: idea.assignedLeader.id,
				newValue: String(threshold),
				note: `SLA reminder sent at ${threshold}-day threshold`,
			});

			sent++;
		}
	}

	console.log(`[sla-check] Checked ${checked} ideas, sent ${sent} reminders`);
	return { sent, checked };
}
