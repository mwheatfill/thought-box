import { createServerFn } from "@tanstack/react-start";
import { sql } from "#/server/db";
import { adminMiddleware } from "#/server/middleware/auth";

/**
 * CSV-escape a value: ISO for dates, quote when it contains a comma/quote/
 * newline, and neutralize spreadsheet formula injection (a user-controlled
 * title like `=cmd()` shouldn't execute when opened in Excel/PowerBI) by
 * prefixing leading =,+,-,@ with a single quote.
 */
function csvCell(v: unknown): string {
	if (v === null || v === undefined) return "";
	let s = v instanceof Date ? v.toISOString() : String(v);
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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
		const lines = [cols.join(",")];
		for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(","));
		return { csv: lines.join("\n"), count: rows.length };
	});
