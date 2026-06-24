import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);
const result = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'idea_events' AND column_name = 'reason'
`;
if (result.length > 0) {
	console.log("Column idea_events.reason already exists — no changes made");
} else {
	await sql`ALTER TABLE idea_events ADD COLUMN reason varchar(50)`;
	console.log("Added idea_events.reason column (nullable, no data backfill)");
}
await sql.end();
