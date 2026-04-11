import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Activity, AlertTriangle, Eye, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "#/components/ui/chart";
import { RouteError } from "#/components/ui/route-error";
import { getAnalytics } from "#/server/functions/analytics";

export const Route = createFileRoute("/admin/analytics")({
	errorComponent: ({ error }) => <RouteError error={error} />,
	beforeLoad: ({ context }) => {
		if (context.user.role !== "admin") {
			throw redirect({ to: "/dashboard" });
		}
	},
	loader: () => getAnalytics(),
	component: AnalyticsPage,
});

const chartConfig = {
	requests: { label: "Requests", color: "#3b82f6" },
} satisfies ChartConfig;

function AnalyticsPage() {
	const initialData = Route.useLoaderData();

	const { data = initialData } = useQuery({
		queryKey: ["admin-analytics"],
		queryFn: () => getAnalytics(),
		initialData,
	});

	return (
		<main className="flex-1 bg-background p-6">
			<div className="mb-6">
				<h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
				<p className="text-muted-foreground">
					{data.period} — application usage and health metrics.
				</p>
			</div>

			{!data.appInsightsConfigured && (
				<Card className="mb-6 border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
					<CardContent className="flex items-center gap-3 p-4">
						<AlertTriangle className="size-5 text-yellow-600 dark:text-yellow-400" />
						<div>
							<p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
								App Insights API key not configured
							</p>
							<p className="text-xs text-yellow-700 dark:text-yellow-400">
								Set APPINSIGHTS_API_KEY in App Service settings to enable analytics data. Create an
								API key in Azure Portal &gt; Application Insights &gt; API Access.
							</p>
						</div>
					</CardContent>
				</Card>
			)}

			{/* KPI cards */}
			<div className="mb-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
				<KpiCard icon={Users} label="Unique Users" value={data.uniqueUsers} />
				<KpiCard icon={Eye} label="Total Requests" value={data.totalRequests.toLocaleString()} />
				<KpiCard
					icon={AlertTriangle}
					label="Errors"
					value={data.totalErrors}
					variant={data.totalErrors > 0 ? "destructive" : "default"}
				/>
				<KpiCard
					icon={Activity}
					label="Error Rate"
					value={data.errorRate}
					variant={Number.parseFloat(data.errorRate) > 5 ? "destructive" : "default"}
				/>
			</div>

			{/* Traffic chart */}
			<Card>
				<CardHeader>
					<CardTitle>Daily Traffic</CardTitle>
					<CardDescription>Requests per day over the last 30 days</CardDescription>
				</CardHeader>
				<CardContent>
					{data.dailyTraffic.length > 0 ? (
						<ChartContainer config={chartConfig} className="h-[300px] w-full">
							<AreaChart data={data.dailyTraffic} margin={{ left: 0, right: 16 }}>
								<CartesianGrid vertical={false} />
								<XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
								<YAxis tickLine={false} axisLine={false} fontSize={12} />
								<ChartTooltip content={<ChartTooltipContent />} />
								<Area
									type="monotone"
									dataKey="requests"
									fill="var(--color-requests)"
									fillOpacity={0.2}
									stroke="var(--color-requests)"
									strokeWidth={2}
								/>
							</AreaChart>
						</ChartContainer>
					) : (
						<p className="py-12 text-center text-sm text-muted-foreground">
							{data.appInsightsConfigured
								? "No traffic data yet. Check back after the app has been in use."
								: "Configure the App Insights API key to see traffic data."}
						</p>
					)}
				</CardContent>
			</Card>

			{/* Link to Azure portal */}
			<p className="mt-4 text-center text-xs text-muted-foreground">
				For detailed diagnostics, visit{" "}
				<a
					href="https://portal.azure.com/#@desertfinancial.com/resource/subscriptions/7e479c8e-4e78-4cb7-a019-a8bf6d0dbfab/resourceGroups/rg-df-thoughtbox-prod/providers/microsoft.insights/components/appi-df-thoughtbox-prod/overview"
					target="_blank"
					rel="noopener noreferrer"
					className="text-primary underline hover:no-underline"
				>
					Application Insights in Azure Portal
				</a>
			</p>
		</main>
	);
}

function KpiCard({
	icon: Icon,
	label,
	value,
	variant = "default",
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: number | string;
	variant?: "default" | "destructive";
}) {
	return (
		<Card className="h-full">
			<CardContent className="flex h-full items-center gap-4 p-4">
				<div
					className={`rounded-full p-2 ${variant === "destructive" ? "bg-red-100 dark:bg-red-900/30" : "bg-muted"}`}
				>
					<Icon
						className={`size-4 ${variant === "destructive" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
					/>
				</div>
				<div>
					<p
						className={`text-2xl font-bold ${variant === "destructive" ? "text-red-600 dark:text-red-400" : ""}`}
					>
						{value}
					</p>
					<p className="text-xs text-muted-foreground">{label}</p>
				</div>
			</CardContent>
		</Card>
	);
}
