import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

const ideas = await sql`
  SELECT i.submission_id, i.status, i.submitted_at, i.sla_started_at,
         u.display_name AS owner_name, u.email AS owner_email
  FROM ideas i
  LEFT JOIN users u ON u.id = i.assigned_owner_id
  WHERE i.submission_id IN ('TB-0006','TB-0007','TB-0010','TB-0019','TB-0030','TB-0038')
  ORDER BY i.submission_id
`;

console.table(
  ideas.map((i) => ({
    id: i.submission_id,
    status: i.status,
    submitted: i.submitted_at?.toISOString().slice(0, 10),
    slaStarted: i.sla_started_at?.toISOString().slice(0, 10),
    owner: i.owner_name,
    email: i.owner_email,
  })),
);

await sql.end();
