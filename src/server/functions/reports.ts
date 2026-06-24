import { createServerFn } from "@tanstack/react-start";
import { toCsv } from "#/lib/csv";
import { sql } from "#/server/db";
import { adminMiddleware } from "#/server/middleware/auth";

/**
 * Export the `idea_report` fact view as CSV (admin only). The same view PowerBI
 * can connect to directly — this is the in-app convenience download.
 */
export const getIdeaReportCsv = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const rows = (await sql`
			SELECT * FROM idea_report ORDER BY submitted_at DESC NULLS LAST
		`) as unknown as Record<string, unknown>[];

		if (rows.length === 0) return { csv: "", count: 0 };

		const cols = Object.keys(rows[0]);
		const csv = toCsv([cols, ...rows.map((r) => cols.map((c) => r[c]))]);
		return { csv, count: rows.length };
	});
