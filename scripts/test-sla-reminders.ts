/**
 * Manually exercise the SLA reminder cron against prod.
 *
 * Workflow:
 *   1. Snapshot original state for the test ideas (printed; restored on cleanup).
 *   2. Age each cohort: set slaStartedAt + status appropriately.
 *   3. Clear any existing reminder_sent events for these ideas.
 *   4. Run checkSlaReminders().
 *   5. Print idea_events + email_log rows that resulted.
 *   6. Wait for user confirmation, then restore original state (or skip with KEEP=1).
 *
 * Required env: DATABASE_URL, AZURE_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * THOUGHTBOX_SHARED_MAILBOX. Real emails will send.
 */

import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, sql } from "#/server/db";
import { emailLog, ideaEvents, ideas } from "#/server/db/schema";
import { initEmailLog } from "#/server/lib/email-log";
import { checkSlaReminders } from "#/server/lib/sla-check";

const FOURTEEN_DAY = ["TB-0010", "TB-0019"];
const THIRTY_DAY = ["TB-0006", "TB-0007", "TB-0030", "TB-0038"];
const ALL = [...FOURTEEN_DAY, ...THIRTY_DAY];

/** Returns a date N business days before `from` (skipping weekends). */
function businessDaysAgo(n: number, from = new Date()): Date {
	const d = new Date(from);
	let removed = 0;
	while (removed < n) {
		d.setDate(d.getDate() - 1);
		const dow = d.getDay();
		if (dow !== 0 && dow !== 6) removed++;
	}
	return d;
}

async function main() {
	console.log("=".repeat(70));
	console.log("SLA reminder verification — prod");
	console.log("=".repeat(70));

	// 1. Snapshot
	const snapshot = await db.query.ideas.findMany({
		where: inArray(ideas.submissionId, ALL),
		columns: {
			id: true,
			submissionId: true,
			status: true,
			submittedAt: true,
			slaStartedAt: true,
			slaDueDate: true,
		},
	});

	console.log("\n[1] Snapshot of original state:");
	console.table(
		snapshot.map((i) => ({
			submissionId: i.submissionId,
			status: i.status,
			slaStartedAt: i.slaStartedAt?.toISOString(),
			slaDueDate: i.slaDueDate?.toISOString(),
		})),
	);

	const idsBySubmission = new Map(snapshot.map((i) => [i.submissionId, i.id]));
	const fourteenIds = FOURTEEN_DAY.map((s) => idsBySubmission.get(s)).filter(Boolean) as string[];
	const thirtyIds = THIRTY_DAY.map((s) => idsBySubmission.get(s)).filter(Boolean) as string[];

	if (fourteenIds.length !== FOURTEEN_DAY.length || thirtyIds.length !== THIRTY_DAY.length) {
		console.error("Some test submission IDs not found in DB — aborting.");
		console.error("Expected:", ALL);
		console.error(
			"Found:",
			snapshot.map((i) => i.submissionId),
		);
		process.exit(1);
	}

	// 2. Age + clear prior reminder_sent
	const now = new Date();
	const fourteenAgo = businessDaysAgo(14, new Date(now.getTime() - 60_000)); // +1min buffer
	const thirtyAgo = businessDaysAgo(30, new Date(now.getTime() - 60_000));

	console.log("\n[2] Aging test ideas (business-day math)...");
	console.log(`  14-day cohort → slaStartedAt = ${fourteenAgo.toISOString()} (status=new)`);
	console.log(`  30-day cohort → slaStartedAt = ${thirtyAgo.toISOString()} (status=under_review)`);

	await db
		.update(ideas)
		.set({ slaStartedAt: fourteenAgo, status: "new" })
		.where(inArray(ideas.id, fourteenIds));

	await db
		.update(ideas)
		.set({ slaStartedAt: thirtyAgo, status: "under_review" })
		.where(inArray(ideas.id, thirtyIds));

	const cleared = await db
		.delete(ideaEvents)
		.where(
			and(
				inArray(ideaEvents.ideaId, [...fourteenIds, ...thirtyIds]),
				eq(ideaEvents.eventType, "reminder_sent"),
			),
		)
		.returning({ id: ideaEvents.id });

	console.log(`  Cleared ${cleared.length} prior reminder_sent events.`);

	// 3. Init email log + run cron
	initEmailLog();

	console.log("\n[3] Running checkSlaReminders()...");
	const startTime = new Date();
	const result = await checkSlaReminders();
	console.log("Result:", result);

	// 4. Inspect resulting events + email log (small delay so async inserts land)
	await new Promise((r) => setTimeout(r, 1500));

	const newEvents = await db.query.ideaEvents.findMany({
		where: inArray(ideaEvents.ideaId, [...fourteenIds, ...thirtyIds]),
		orderBy: (e, { desc }) => [desc(e.createdAt)],
	});

	const reminderEvents = newEvents.filter(
		(e) => e.eventType === "reminder_sent" && e.createdAt >= startTime,
	);

	console.log(`\n[4] reminder_sent events written (${reminderEvents.length}):`);
	console.table(
		reminderEvents.map((e) => ({
			ideaId: e.ideaId,
			submissionId: snapshot.find((s) => s.id === e.ideaId)?.submissionId,
			threshold: e.newValue,
			createdAt: e.createdAt.toISOString(),
		})),
	);

	const emails = await db.query.emailLog.findMany({
		where: gte(emailLog.createdAt, startTime),
		orderBy: (e, { desc }) => [desc(e.createdAt)],
	});

	console.log(`\n[5] email_log rows since cron start (${emails.length}):`);
	console.table(
		emails.map((e) => ({
			template: e.template,
			recipient: e.recipient,
			status: e.status,
			subject: e.subject,
			error: e.error?.slice(0, 80),
		})),
	);

	// 5. Restore (or skip)
	if (process.env.KEEP === "1") {
		console.log("\n[6] KEEP=1 — leaving DB in aged state. Manually restore later.");
	} else {
		const rl = readline.createInterface({ input, output });
		const answer = await rl.question(
			"\n[6] Restore original slaStartedAt/status for these ideas? [y/N] ",
		);
		rl.close();

		if (answer.trim().toLowerCase() === "y") {
			for (const orig of snapshot) {
				await db
					.update(ideas)
					.set({
						slaStartedAt: orig.slaStartedAt,
						status: orig.status,
					})
					.where(eq(ideas.id, orig.id));
			}
			console.log(`  Restored ${snapshot.length} ideas to original slaStartedAt/status.`);
		} else {
			console.log("  Skipped restore. DB still in aged state.");
		}
	}

	await sql.end();
	console.log("\nDone.");
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
