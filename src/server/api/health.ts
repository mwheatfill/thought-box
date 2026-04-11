import { sql } from "drizzle-orm";
import { db } from "#/server/db";

export async function handleHealthRequest(): Promise<Response> {
	try {
		await db.execute(sql`SELECT 1`);
		return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch {
		return new Response(
			JSON.stringify({ status: "unhealthy", timestamp: new Date().toISOString() }),
			{ status: 503, headers: { "Content-Type": "application/json" } },
		);
	}
}
