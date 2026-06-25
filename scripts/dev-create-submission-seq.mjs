import postgres from "postgres";

/**
 * Create the submission-ID sequence on a fresh dev/UAT database.
 *
 * `nextSubmissionId()` (src/server/lib/submission-id.ts) reads
 * `thoughtbox_submission_id_seq`, but that sequence lives only in migration
 * 0003 — it is NOT modeled in schema.ts, so a dev DB built with
 * `drizzle-kit push` never gets it, and every idea submission throws.
 *
 * Idempotent: START 1 matches migration 0003. Seeded ideas use TB-9xxx
 * literals, so real submissions counting up from TB-0001 won't collide.
 *
 * Run: DATABASE_URL=<dev> node scripts/dev-create-submission-seq.mjs
 */
const sql = postgres(process.env.DATABASE_URL);

const existed = await sql`SELECT to_regclass('public.thoughtbox_submission_id_seq') AS seq`;
if (existed[0]?.seq) {
	console.log("Sequence already exists — no changes made");
} else {
	await sql`CREATE SEQUENCE IF NOT EXISTS thoughtbox_submission_id_seq START 1`;
	console.log("Created thoughtbox_submission_id_seq (START 1)");
}

const [{ last_value, is_called }] = await sql`
	SELECT last_value, is_called FROM thoughtbox_submission_id_seq
`;
console.log(`Verified: last_value=${last_value}, is_called=${is_called} → next submission will be TB-${String(is_called ? Number(last_value) + 1 : Number(last_value)).padStart(4, "0")}`);

await sql.end();
