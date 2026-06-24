/**
 * Apply migration 0016 (attachments.is_internal) to prod.
 * Source SQL is idempotent — safe to re-run.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const file = "drizzle/migrations/0016_attachment_is_internal.sql";

if (!process.env.DATABASE_URL) {
	console.error("DATABASE_URL is not set.");
	process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

try {
	const content = readFileSync(file, "utf8");
	const blocks = content
		.split("--> statement-breakpoint")
		.map((s) => s.trim())
		.filter(Boolean);
	console.log(`${file} — ${blocks.length} statement blocks`);
	for (const [i, block] of blocks.entries()) {
		console.log(`  [${i + 1}/${blocks.length}] executing…`);
		await sql.unsafe(block);
	}

	console.log("\nVerifying…");
	const cols = await sql`
		SELECT column_name, data_type, column_default, is_nullable
		FROM information_schema.columns
		WHERE table_name = 'attachments' AND column_name = 'is_internal'
	`;
	if (cols.length === 0) {
		console.error("❌ is_internal column NOT present after migration!");
		process.exit(1);
	}
	console.log("✓ attachments.is_internal:", cols[0]);
} finally {
	await sql.end();
}
