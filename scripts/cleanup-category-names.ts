/**
 * One-off cleanup of category name whitespace in the categories table.
 * Collapses runs of inner whitespace to single spaces and trims edges.
 *
 *   "ATM /  ACH /  Wires / Payments"  →  "ATM / ACH / Wires / Payments"
 *   "Internal Communications "        →  "Internal Communications"
 *   "Fraud "                          →  "Fraud"
 *
 * Run:  DATABASE_URL=... pnpm tsx scripts/cleanup-category-names.ts [--apply]
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, sql } from "#/server/db";
import { categories } from "#/server/db/schema";

const APPLY = process.argv.includes("--apply");

const rows = await db.select({ id: categories.id, name: categories.name }).from(categories);

const changes: { id: string; from: string; to: string }[] = [];
for (const r of rows) {
	const cleaned = r.name.replace(/\s+/g, " ").trim();
	if (cleaned !== r.name) changes.push({ id: r.id, from: r.name, to: cleaned });
}

if (!changes.length) {
	console.log("All category names already clean. Nothing to do.");
} else {
	console.log(`${changes.length} category name(s) need cleanup:`);
	for (const c of changes) console.log(`  ${JSON.stringify(c.from)}  →  ${JSON.stringify(c.to)}`);
	if (APPLY) {
		for (const c of changes) {
			await db
				.update(categories)
				.set({ name: c.to, updatedAt: new Date() })
				.where(eq(categories.id, c.id));
		}
		console.log(`\n✓ Applied ${changes.length} updates.`);
	} else {
		console.log("\nDry-run. Re-run with --apply to write.");
	}
}

await sql.end();
