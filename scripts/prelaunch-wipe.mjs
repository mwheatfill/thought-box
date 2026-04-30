/**
 * Pre-launch data wipe.
 *   1. Backs up idea-related tables to JSON in BACKUP_DIR.
 *   2. Deletes rows from those tables (preserves users/categories/settings).
 *   3. Resets thoughtbox_submission_id_seq to 1.
 *
 * Required env: DATABASE_URL, BACKUP_DIR.
 *
 * Run with --execute to actually wipe; otherwise prints counts only (dry run).
 */

import postgres from "postgres";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const EXECUTE = process.argv.includes("--execute");
const BACKUP_DIR = process.env.BACKUP_DIR;

if (!BACKUP_DIR) {
  console.error("BACKUP_DIR must be set");
  process.exit(1);
}

await mkdir(BACKUP_DIR, { recursive: true });

const sql = postgres(process.env.DATABASE_URL);

// Order matters: child tables before parent for clean delete (no FKs in this
// schema, but the dependency order is good hygiene either way).
const TABLES_TO_WIPE = [
  "attachments",
  "keystone_details",
  "idea_events",
  "conversations",
  "ideas",
  "email_log",
  "audit_log",
];

console.log(`Mode: ${EXECUTE ? "EXECUTE (will wipe)" : "DRY RUN (no changes)"}`);
console.log(`Backup dir: ${BACKUP_DIR}\n`);

// 1. Backup
for (const table of TABLES_TO_WIPE) {
  const rows = await sql.unsafe(`SELECT * FROM ${table}`);
  const file = path.join(BACKUP_DIR, `${table}.json`);
  await writeFile(file, JSON.stringify(rows, null, 2));
  console.log(`backed up ${table}: ${rows.length} rows → ${file}`);
}

// Capture sequence current value too
const [{ last_value }] = await sql`SELECT last_value FROM thoughtbox_submission_id_seq`;
await writeFile(
  path.join(BACKUP_DIR, "submission-id-seq.json"),
  JSON.stringify({ last_value: String(last_value) }, null, 2),
);
console.log(`backed up submission_id_seq: last_value=${last_value}`);

if (!EXECUTE) {
  console.log("\nDry run complete. Re-run with --execute to wipe.");
  await sql.end();
  process.exit(0);
}

// 2. Wipe
console.log("\nWiping tables...");
for (const table of TABLES_TO_WIPE) {
  const result = await sql.unsafe(`DELETE FROM ${table}`);
  console.log(`  DELETE FROM ${table}: ${result.count} rows`);
}

// 3. Reset sequence
await sql`ALTER SEQUENCE thoughtbox_submission_id_seq RESTART WITH 1`;
console.log("  ALTER SEQUENCE thoughtbox_submission_id_seq RESTART WITH 1");

// 4. Verify
console.log("\nPost-wipe row counts:");
for (const table of TABLES_TO_WIPE) {
  const [{ count }] = await sql.unsafe(`SELECT COUNT(*)::int AS count FROM ${table}`);
  console.log(`  ${table}: ${count}`);
}
const [{ last_value: newSeq }] = await sql`SELECT last_value FROM thoughtbox_submission_id_seq`;
console.log(`  submission_id_seq.last_value: ${newSeq}`);

await sql.end();
console.log("\nDone.");
