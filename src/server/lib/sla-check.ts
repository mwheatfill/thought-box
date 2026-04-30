import { and, eq, inArray } from "drizzle-orm";
import { db } from "#/server/db";
import { ideaEvents, ideas, settings } from "#/server/db/schema";
import { sendSlaReminderEmail } from "#/server/functions/email";
import { businessDaysBetween } from "#/server/lib/sla";

/**
 * Check open ideas against SLA reminder thresholds and send emails.
 * Idempotent — checks idea_events for existing reminder_sent at each threshold.
 *
 * All thresholds are measured in **business days** (skipping weekends), counted
 * from `slaStartedAt` (which resets to `now` on reassignment, so the new leader
 * gets a fresh cycle).
 *
 * Default thresholds:
 * - Status "new": remind at 5 and 14 business days
 * - Status "under_review": remind at 30 business days
 *
 * Thresholds are configurable via admin settings.
 */
export async function checkSlaReminders(): Promise<{ sent: number; checked: number }> {
	const [newFirst, newSecond, reviewDays] = await Promise.all([
		db.query.settings.findFirst({ where: eq(settings.key, "sla_new_first_reminder_days") }),
		db.query.settings.findFirst({ where: eq(settings.key, "sla_new_second_reminder_days") }),
		db.query.settings.findFirst({ where: eq(settings.key, "sla_review_reminder_days") }),
	]);

	const NEW_FIRST = Number(newFirst?.value ?? 5);
	const NEW_SECOND = Number(newSecond?.value ?? 14);
	const REVIEW_DAYS = Number(reviewDays?.value ?? 30);

	const now = new Date();

	// Fetch all open ideas in either status. SQL can't compute business days, so
	// we filter in JS. The active set (status in new/under_review) is small.
	const openIdeas = await db.query.ideas.findMany({
		where: inArray(ideas.status, ["new", "under_review"]),
		with: {
			submitter: { columns: { displayName: true } },
			assignedLeader: { columns: { id: true, email: true, displayName: true } },
			category: { columns: { name: true } },
		},
	});

	let sent = 0;

	for (const idea of openIdeas) {
		if (!idea.assignedLeader) continue;

		const referenceDate = idea.slaStartedAt ?? idea.submittedAt;
		const businessDaysSince = businessDaysBetween(new Date(referenceDate), now);

		const thresholds =
			idea.status === "new" ? ([NEW_FIRST, NEW_SECOND] as const) : ([REVIEW_DAYS] as const);
		const statusLabel = idea.status === "new" ? "New" : "Under Review";

		for (const threshold of thresholds) {
			if (businessDaysSince < threshold) continue;

			const existing = await db.query.ideaEvents.findFirst({
				where: and(
					eq(ideaEvents.ideaId, idea.id),
					eq(ideaEvents.eventType, "reminder_sent"),
					eq(ideaEvents.newValue, String(threshold)),
				),
			});

			if (existing) continue;

			await sendSlaReminderEmail({
				leaderEmail: idea.assignedLeader.email,
				leaderFirstName: idea.assignedLeader.displayName.split(" ")[0],
				submissionId: idea.submissionId,
				ideaTitle: idea.title,
				submitterName: idea.submitter.displayName,
				categoryName: idea.category.name,
				currentStatus: statusLabel,
				businessDaysSinceStart: businessDaysSince,
			});

			// `newValue` stores the threshold (in business days) for dedup.
			await db.insert(ideaEvents).values({
				ideaId: idea.id,
				eventType: "reminder_sent",
				actorId: idea.assignedLeader.id,
				newValue: String(threshold),
				note: `SLA reminder sent at ${threshold}-business-day threshold`,
			});

			sent++;
		}
	}

	console.log(`[sla-check] Checked ${openIdeas.length} open ideas, sent ${sent} reminders`);
	return { sent, checked: openIdeas.length };
}
