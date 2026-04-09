import type postgres from "postgres";

/**
 * Generate the next submission ID from the PostgreSQL sequence.
 * Format: TB-0001, TB-0002, etc.
 */
export async function nextSubmissionId(sql: postgres.Sql): Promise<string> {
	const [result] = await sql`SELECT nextval('thoughtbox_submission_id_seq') as val`;
	const num = Number(result.val);
	return `TB-${num.toString().padStart(4, "0")}`;
}
