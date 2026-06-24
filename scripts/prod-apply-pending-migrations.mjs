/**
 * Apply migrations 0014 + 0015 to prod.
 *
 * 0014 — drop action_taken, rename owner_notes → message_to_submitter,
 *        rename rejection_reason → decline_reason (column + enum type)
 * 0015 — add 'internal_note' to event_type enum, add idea_events.mentions
 *
 * Both source SQL files use DO $$ ... END $$ idempotency guards, so this
 * script is safe to re-run.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const files = [
	"drizzle/migrations/0014_message_to_submitter_and_decline_reason.sql",
	"drizzle/migrations/0015_internal_notes_and_mentions.sql",
];

if (!process.env.DATABASE_URL) {
	console.error("DATABASE_URL is not set.");
	process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

try {
	for (const file of files) {
		const content = readFileSync(file, "utf8");
		const blocks = content
			.split("--> statement-breakpoint")
			.map((s) => s.trim())
			.filter(Boolean);
		console.log(`\n${file} — ${blocks.length} statement blocks`);
		for (const [i, block] of blocks.entries()) {
			console.log(`  [${i + 1}/${blocks.length}] executing…`);
			await sql.unsafe(block);
		}
	}
	console.log("\nDone. Verifying…");

	const ideasCols = await sql`
		SELECT column_name FROM information_schema.columns
		WHERE table_name = 'ideas'
		  AND column_name IN ('action_taken', 'owner_notes', 'message_to_submitter',
		                      'rejection_reason', 'decline_reason')
		ORDER BY column_name
	`;
	console.log("ideas columns:", ideasCols.map((c) => c.column_name));

	const eventCols = await sql`
		SELECT column_name FROM information_schema.columns
		WHERE table_name = 'idea_events' AND column_name = 'mentions'
	`;
	console.log("idea_events.mentions present:", eventCols.length === 1);

	const enumVals = await sql`
		SELECT enumlabel FROM pg_enum e
		JOIN pg_type t ON e.enumtypid = t.oid
		WHERE t.typname = 'event_type' AND enumlabel = 'internal_note'
	`;
	console.log("event_type.internal_note enum present:", enumVals.length === 1);

	const declineType = await sql`SELECT 1 FROM pg_type WHERE typname = 'decline_reason'`;
	console.log("decline_reason enum type present:", declineType.length === 1);
} finally {
	await sql.end();
}
