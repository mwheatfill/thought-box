import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);
const result = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'ideas' AND column_name = 'has_been_reviewed'`;
if (result.length > 0) {
  console.log("Column already exists — no changes made");
} else {
  await sql`ALTER TABLE ideas ADD COLUMN has_been_reviewed boolean DEFAULT false NOT NULL`;
  console.log("Added has_been_reviewed column (existing rows default to false, no data loss)");
}
await sql.end();
