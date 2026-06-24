import { readFileSync } from "node:fs";
import postgres from "postgres";

const sqlFile = "drizzle/migrations/0013_leader_to_owner.sql";
const content = readFileSync(sqlFile, "utf8");

const blocks = content
	.split("--> statement-breakpoint")
	.map((s) => s.trim())
	.filter(Boolean);

const sql = postgres(process.env.DATABASE_URL);

console.log(`Running ${blocks.length} statement blocks from ${sqlFile}…`);
for (const [i, block] of blocks.entries()) {
	console.log(`  [${i + 1}/${blocks.length}] executing…`);
	await sql.unsafe(block);
}
console.log("Migration complete.");

await sql.end();
