import postgres from "postgres";

const ORIGINAL = [
  { submission_id: "TB-0006", status: "under_review", sla_started_at: "2026-04-10T22:31:11.545Z" },
  { submission_id: "TB-0007", status: "new",         sla_started_at: "2026-04-10T22:34:55.172Z" },
  { submission_id: "TB-0010", status: "new",         sla_started_at: "2026-04-13T21:22:43.725Z" },
  { submission_id: "TB-0019", status: "new",         sla_started_at: "2026-04-15T02:27:51.440Z" },
  { submission_id: "TB-0030", status: "new",         sla_started_at: "2026-04-16T22:33:49.403Z" },
  { submission_id: "TB-0038", status: "new",         sla_started_at: "2026-04-21T17:19:55.570Z" },
];

const sql = postgres(process.env.DATABASE_URL);

for (const o of ORIGINAL) {
  await sql`
    UPDATE ideas
       SET status = ${o.status},
           sla_started_at = ${o.sla_started_at}
     WHERE submission_id = ${o.submission_id}
  `;
  console.log(`Restored ${o.submission_id} → status=${o.status}, slaStartedAt=${o.sla_started_at}`);
}

// Also clear test reminder_sent events from today
const cleared = await sql`
  DELETE FROM idea_events
  WHERE event_type = 'reminder_sent'
    AND idea_id IN (SELECT id FROM ideas WHERE submission_id = ANY(${sql.array(ORIGINAL.map(o => o.submission_id))}))
    AND created_at >= ${new Date(Date.now() - 6 * 3600 * 1000).toISOString()}
  RETURNING id
`;
console.log(`\nCleared ${cleared.length} reminder_sent events from the last 6 hours.`);

await sql.end();
