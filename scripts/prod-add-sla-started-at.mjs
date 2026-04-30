import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

const exists = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'ideas' AND column_name = 'sla_started_at'
`;

if (exists.length > 0) {
  console.log("Column sla_started_at already exists — skipping ALTER");
} else {
  await sql`ALTER TABLE ideas ADD COLUMN sla_started_at timestamp with time zone`;
  console.log("Added sla_started_at column");
}

const backfilled = await sql`
  UPDATE ideas
  SET sla_started_at = COALESCE(
    (SELECT MAX(created_at) FROM idea_events
     WHERE idea_events.idea_id = ideas.id AND event_type = 'reassigned'),
    submitted_at
  )
  WHERE sla_started_at IS NULL
  RETURNING id
`;

console.log(`Backfilled sla_started_at for ${backfilled.length} rows`);

await sql.end();
