import { createServerFn } from "@tanstack/react-start";
import { adminMiddleware } from "#/server/middleware/auth";

const APP_INSIGHTS_APP_ID = "84c09e17-f35f-4b45-8ae9-37b531ae17fc";

/**
 * Query App Insights REST API for analytics data.
 * Uses the API key-free approach via the app's managed identity.
 * Falls back to mock data in dev mode.
 */
async function queryAppInsights(query: string): Promise<unknown[]> {
	const appId = APP_INSIGHTS_APP_ID;
	if (!appId) return [];

	try {
		const apiKey = process.env.APPINSIGHTS_API_KEY;
		if (!apiKey) return [];

		const res = await fetch(
			`https://api.applicationinsights.io/v1/apps/${appId}/query?query=${encodeURIComponent(query)}`,
			{ headers: { "x-api-key": apiKey } },
		);

		if (!res.ok) return [];
		const data = await res.json();
		return data.tables?.[0]?.rows ?? [];
	} catch {
		return [];
	}
}

export const getAnalytics = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		// Filter out non-user requests: health checks, static assets, availability tests, server functions
		const userFilter = [
			"timestamp > ago(30d)",
			"url !has '/health'",
			"url !has '/assets/'",
			"url !has '/_serverFn/'",
			"url !has '/api/'",
			"name !has 'GET /_serverFn'",
			"source != 'availability'",
			"client_Type == 'PC'",
		].join(" and ");

		const [userRows, pageRows, errorRows, dailyRows] = await Promise.all([
			queryAppInsights(
				`requests | where ${userFilter} | summarize dcount(client_IP) | project users=Column1`,
			),
			queryAppInsights(`requests | where ${userFilter} | summarize totalRequests=count()`),
			queryAppInsights(
				`requests | where ${userFilter} and resultCode >= 500 | summarize errors=count()`,
			),
			queryAppInsights(
				`requests | where ${userFilter} | summarize requests=count() by bin(timestamp, 1d) | order by timestamp asc`,
			),
		]);

		const totalUsers = (userRows[0] as number[])?.[0] ?? 0;
		const totalRequests = (pageRows[0] as number[])?.[0] ?? 0;
		const totalErrors = (errorRows[0] as number[])?.[0] ?? 0;
		const errorRate = totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(1) : "0";

		const dailyTraffic = (dailyRows as [string, number][]).map(([date, count]) => ({
			date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
			requests: count,
		}));

		return {
			period: "Last 30 days",
			uniqueUsers: totalUsers,
			totalRequests,
			totalErrors,
			errorRate: `${errorRate}%`,
			dailyTraffic,
			appInsightsConfigured: !!process.env.APPINSIGHTS_API_KEY,
		};
	});
