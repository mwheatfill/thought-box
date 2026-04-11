import { checkSlaReminders } from "#/server/lib/sla-check";

/**
 * Run SLA reminder check. Called by the in-process timer in server-adapter.js.
 * Also available as an API endpoint for manual testing.
 */
export async function handleSlaCronRequest(): Promise<Response> {
	try {
		const result = await checkSlaReminders();
		return new Response(JSON.stringify(result), {
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		console.error("[sla-cron] Error:", err);
		return new Response(JSON.stringify({ error: "SLA check failed" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
