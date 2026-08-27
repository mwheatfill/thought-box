import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { toCsv } from "#/lib/csv";
import { db, sql } from "#/server/db";
import { ideaEvents } from "#/server/db/schema";
import { env } from "#/server/lib/env";
import { adminMiddleware } from "#/server/middleware/auth";

/**
 * The PostgreSQL connection target for the reporting view, so an admin can point
 * PowerBI at it. Host/port/database only — never the username or password.
 */
export const getReportConnectionInfo = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		let host = "";
		let port = "5432";
		let database = "";
		try {
			const u = new URL(env.DATABASE_URL);
			host = u.hostname;
			if (u.port) port = u.port;
			database = decodeURIComponent(u.pathname.replace(/^\//, ""));
		} catch {
			// Leave blanks — the UI falls back to "ask your DBA".
		}
		const sslRequired = /\.azure\.com$/i.test(host) || /sslmode=require/i.test(env.DATABASE_URL);
		return { host, port, database, schema: "public", view: "idea_report", sslRequired };
	});

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

/**
 * Export every Change Category event as CSV (admin only) — the R23 "report on
 * all previous items that were reassigned", for category-reporting accuracy.
 * One row per move: which idea, from/to category, who moved it, why, when, and
 * the category it sits in today.
 */
export const getReassignmentReportCsv = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const events = await db.query.ideaEvents.findMany({
			where: eq(ideaEvents.eventType, "reassigned"),
			orderBy: [desc(ideaEvents.createdAt)],
			with: {
				idea: {
					columns: { submissionId: true, title: true },
					with: { category: { columns: { name: true } } },
				},
				actor: { columns: { displayName: true } },
			},
		});

		if (events.length === 0) return { csv: "", count: 0 };

		const header = [
			"submission_id",
			"title",
			"from_category",
			"to_category",
			"reason",
			"changed_by",
			"changed_at",
			"current_category",
		];
		const csv = toCsv([
			header,
			...events.map((e) => [
				e.idea?.submissionId ?? "",
				e.idea?.title ?? "",
				e.oldValue ?? "",
				e.newValue ?? "",
				e.reason ?? "",
				e.actor?.displayName ?? "",
				e.createdAt.toISOString(),
				e.idea?.category?.name ?? "",
			]),
		]);
		return { csv, count: events.length };
	});
