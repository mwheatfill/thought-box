import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	Activity,
	AlertTriangle,
	Check,
	Copy,
	Database,
	Download,
	Eye,
	FileSpreadsheet,
	Users,
} from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "#/components/ui/chart";
import { RouteError } from "#/components/ui/route-error";
import { getAnalytics } from "#/server/functions/analytics";
import { getIdeaReportCsv, getReportConnectionInfo } from "#/server/functions/reports";

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

	const { data: conn } = useQuery({
		queryKey: ["report-connection"],
		queryFn: () => getReportConnectionInfo(),
		staleTime: Number.POSITIVE_INFINITY,
	});

	const exportFn = useServerFn(getIdeaReportCsv);
	const exportMutation = useMutation({
		mutationFn: () => exportFn(),
		onSuccess: ({ csv, count }) => {
			if (count === 0) {
				toast.message("No ideas to export yet.");
				return;
			}
			const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `idea-report-${new Date().toISOString().slice(0, 10)}.csv`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success(`Exported ${count} ideas`);
		},
		onError: () => toast.error("Export failed"),
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

			{/* Reports & exports — canned export options */}
			<section className="mt-8">
				<h2 className="mb-1 text-lg font-semibold tracking-tight">Reports &amp; exports</h2>
				<p className="mb-4 text-sm text-muted-foreground">
					Canned datasets for analysis. Connect PowerBI to the{" "}
					<code className="rounded bg-muted px-1 py-0.5 text-xs">idea_report</code> view for the
					same data live.
				</p>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<Card className="flex flex-col">
						<CardHeader className="flex-1">
							<div className="mb-1 flex items-center gap-2">
								<FileSpreadsheet className="size-5 text-primary" />
								<CardTitle className="text-base">Idea performance report</CardTitle>
							</div>
							<CardDescription>
								Every idea with cycle time, response time, SLA compliance, and reassignment accuracy
								— in both calendar and business days.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button
								variant="outline"
								className="w-full"
								disabled={exportMutation.isPending}
								onClick={() => exportMutation.mutate()}
							>
								<Download className="mr-2 size-4" />
								{exportMutation.isPending ? "Exporting…" : "Export CSV"}
							</Button>
						</CardContent>
					</Card>
				</div>

				{/* PowerBI connection helper */}
				<Card className="mt-4">
					<CardHeader>
						<div className="flex items-center gap-2">
							<Database className="size-5 text-primary" />
							<CardTitle className="text-base">Connect Power BI to the live data</CardTitle>
						</div>
						<CardDescription>
							Point Power BI at the <code className="text-xs">idea_report</code> view for
							always-current data you can join with your other sources — no export needed.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-5">
						<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
							<CopyField label="Server" value={conn?.host} />
							<CopyField label="Database" value={conn?.database} />
							<CopyField label="Schema" value={conn?.schema ?? "public"} />
							<CopyField label="View" value={conn?.view ?? "idea_report"} />
						</dl>

						<ol className="list-decimal space-y-1.5 pl-5 text-sm">
							<li>
								In Power BI Desktop, choose <strong>Get data → PostgreSQL database</strong>.
							</li>
							<li>
								Paste the <strong>Server</strong> and <strong>Database</strong> above. Pick{" "}
								<strong>Import</strong> (this dataset is small) and, if prompted, leave encryption
								on.
							</li>
							<li>
								Sign in with a <strong>read-only reporting login</strong> (ask the DBA — don't reuse
								the app's credentials).
							</li>
							<li>
								In the Navigator, expand <code className="text-xs">public</code> and tick{" "}
								<code className="text-xs">idea_report</code>, then <strong>Load</strong>.
							</li>
							<li>
								Build visuals — e.g. average <code className="text-xs">business_days_to_close</code>{" "}
								by <code className="text-xs">category_name</code>, SLA-met %, or reassignment
								accuracy from <code className="text-xs">improper_assignment_count</code>.
							</li>
						</ol>

						<p className="text-xs text-muted-foreground">
							{conn?.sslRequired
								? "The connection requires SSL/encryption (on by default in the Azure connector). "
								: ""}
							The database firewall must allow your machine's IP (Power BI Desktop) or the
							on-premises data gateway (for scheduled refresh in the Power BI Service). Grant the
							reporting login <code className="text-xs">SELECT</code> on{" "}
							<code className="text-xs">idea_report</code> only.
						</p>
					</CardContent>
				</Card>
			</section>

			{/* Link to Azure portal */}
			<p className="mt-8 text-center text-xs text-muted-foreground">
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

function CopyField({ label, value }: { label: string; value?: string }) {
	const [copied, setCopied] = useState(false);
	const ready = !!value;

	function copy() {
		if (!value) return;
		navigator.clipboard.writeText(value).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	}

	return (
		<div>
			<dt className="mb-1 text-xs font-medium uppercase text-muted-foreground">{label}</dt>
			<dd>
				<button
					type="button"
					onClick={copy}
					disabled={!ready}
					className="flex w-full items-center justify-between gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-left font-mono text-xs hover:bg-muted disabled:cursor-default disabled:opacity-60"
					title={ready ? "Copy" : undefined}
				>
					<span className="truncate">{value ?? "— ask your DBA —"}</span>
					{ready &&
						(copied ? (
							<Check className="size-3.5 shrink-0 text-emerald-500" />
						) : (
							<Copy className="size-3.5 shrink-0 text-muted-foreground" />
						))}
				</button>
			</dd>
		</div>
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
