import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
	Activity,
	BarChart3,
	CheckCircle,
	Clock,
	Download,
	Inbox,
	Lightbulb,
	TrendingUp,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "#/components/ui/chart";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { STATUS_LABELS } from "#/lib/constants";
import { cn } from "#/lib/utils";
import { SlaIndicator } from "./sla-indicator";
import { StatusBadge } from "./status-badge";

// ── Types ─────────────────────────────────────────────────────────────────

interface DashboardStats {
	totalThisMonth: number;
	totalThisYear: number;
	openCount: number;
	overdueCount: number;
	avgCloseTimeDays: number | null;
	slaCompliancePercent: number | null;
}

interface AdminIdea {
	id: string;
	submissionId: string;
	title: string;
	status: string;
	categoryName: string;
	submitterName: string;
	assignedLeaderName: string | null;
	submittedAt: string;
	slaDueDate: string | null;
	slaDaysRemaining: number | null;
	slaStatus: "on_track" | "approaching" | "overdue" | "none";
}

interface CategoryData {
	categoryName: string;
	count: number;
}

interface DepartmentData {
	department: string;
	count: number;
}

interface OutcomeData {
	status: string;
	count: number;
}

interface ActivityEvent {
	id: string;
	eventType: string;
	actorName: string;
	ideaSubmissionId: string;
	ideaTitle: string;
	oldValue: string | null;
	newValue: string | null;
	createdAt: string;
}

interface AdminDashboardProps {
	stats: DashboardStats;
	ideas: AdminIdea[];
	byCategory: CategoryData[];
	byDepartment: DepartmentData[];
	outcomeDistribution: OutcomeData[];
	recentActivity: ActivityEvent[];
}

// ── Chart configs ─────────────────────────────────────────────────────────

const categoryChartConfig = {
	count: { label: "Ideas", color: "#3b82f6" },
} satisfies ChartConfig;

const departmentChartConfig = {
	count: { label: "Ideas", color: "#8b5cf6" },
} satisfies ChartConfig;

const STATUS_COLORS: Record<string, string> = {
	new: "#3b82f6",
	under_review: "#f59e0b",
	accepted: "#10b981",
	in_progress: "#8b5cf6",
	implemented: "#06b6d4",
	declined: "#ef4444",
	redirected: "#9ca3af",
};

// ── Component ─────────────────────────────────────────────────────────────

export function AdminDashboard({
	stats,
	ideas,
	byCategory,
	byDepartment,
	outcomeDistribution,
	recentActivity,
}: AdminDashboardProps) {
	const outcomeConfig = Object.fromEntries(
		outcomeDistribution.map((d) => [
			d.status,
			{
				label: STATUS_LABELS[d.status as keyof typeof STATUS_LABELS] ?? d.status,
				color: STATUS_COLORS[d.status] ?? "var(--color-chart-1)",
			},
		]),
	) satisfies ChartConfig;

	const healthStatus = getHealthStatus(stats);

	return (
		<div className="space-y-6">
			{/* Program health badge */}
			<div className="flex items-center gap-2">
				<Activity className={cn("size-4", healthStatus.color)} />
				<span className={cn("text-sm font-medium", healthStatus.color)}>{healthStatus.label}</span>
				<span className="text-xs text-muted-foreground">{healthStatus.detail}</span>
			</div>

			{/* KPI row */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
				<KpiCard
					icon={Lightbulb}
					label="This Month"
					value={stats.totalThisMonth}
					detail={`${stats.totalThisYear} this year`}
				/>
				<KpiCard
					icon={Inbox}
					label="Open Ideas"
					value={stats.openCount}
					detail={stats.overdueCount > 0 ? `${stats.overdueCount} overdue` : "none overdue"}
					variant={stats.overdueCount > 0 ? "warning" : "default"}
				/>
				<KpiCard
					icon={CheckCircle}
					label="SLA Compliance"
					value={stats.slaCompliancePercent !== null ? `${stats.slaCompliancePercent}%` : "—"}
					variant={
						stats.slaCompliancePercent === null
							? "default"
							: stats.slaCompliancePercent >= 80
								? "success"
								: stats.slaCompliancePercent >= 60
									? "warning"
									: "destructive"
					}
				/>
				<KpiCard
					icon={Clock}
					label="Avg Close Time"
					value={stats.avgCloseTimeDays !== null ? `${stats.avgCloseTimeDays}d` : "—"}
				/>
				<KpiCard icon={TrendingUp} label="Total This Year" value={stats.totalThisYear} />
			</div>

			{/* Charts row */}
			<div className="grid gap-4 lg:grid-cols-2">
				{/* Submissions by Category */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-sm font-medium">
							<BarChart3 className="size-4" />
							Ideas by Category
						</CardTitle>
					</CardHeader>
					<CardContent>
						{byCategory.length > 0 ? (
							<ChartContainer config={categoryChartConfig} className="h-[250px] w-full">
								<BarChart data={byCategory} layout="vertical" margin={{ left: 0, right: 16 }}>
									<CartesianGrid horizontal={false} />
									<YAxis
										dataKey="categoryName"
										type="category"
										width={120}
										tickLine={false}
										axisLine={false}
										fontSize={12}
									/>
									<XAxis type="number" hide />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Bar dataKey="count" fill="var(--color-count)" radius={4} />
								</BarChart>
							</ChartContainer>
						) : (
							<p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>
						)}
					</CardContent>
				</Card>

				{/* Outcome Distribution */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-sm font-medium">
							<TrendingUp className="size-4" />
							Outcome Distribution
						</CardTitle>
					</CardHeader>
					<CardContent>
						{outcomeDistribution.length > 0 ? (
							<ChartContainer config={outcomeConfig} className="mx-auto h-[250px] w-full">
								<PieChart>
									<ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
									<Pie
										data={outcomeDistribution.map((d) => ({
											...d,
											fill: STATUS_COLORS[d.status] ?? "var(--color-chart-1)",
										}))}
										dataKey="count"
										nameKey="status"
										cx="50%"
										cy="50%"
										innerRadius={50}
										outerRadius={90}
										paddingAngle={2}
									>
										{outcomeDistribution.map((entry) => (
											<Cell
												key={entry.status}
												fill={STATUS_COLORS[entry.status] ?? "var(--color-chart-1)"}
											/>
										))}
									</Pie>
								</PieChart>
							</ChartContainer>
						) : (
							<p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>
						)}
					</CardContent>
				</Card>

				{/* Submissions by Department */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-sm font-medium">
							<BarChart3 className="size-4" />
							Ideas by Department
						</CardTitle>
					</CardHeader>
					<CardContent>
						{byDepartment.length > 0 ? (
							<ChartContainer config={departmentChartConfig} className="h-[250px] w-full">
								<BarChart data={byDepartment} layout="vertical" margin={{ left: 0, right: 16 }}>
									<CartesianGrid horizontal={false} />
									<YAxis
										dataKey="department"
										type="category"
										width={120}
										tickLine={false}
										axisLine={false}
										fontSize={12}
									/>
									<XAxis type="number" hide />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Bar dataKey="count" fill="var(--color-count)" radius={4} />
								</BarChart>
							</ChartContainer>
						) : (
							<p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>
						)}
					</CardContent>
				</Card>

				{/* Recent Activity */}
				<Card>
					<CardHeader>
						<CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
					</CardHeader>
					<CardContent>
						{recentActivity.length > 0 ? (
							<div className="space-y-3">
								{recentActivity.slice(0, 10).map((event) => (
									<div key={event.id} className="flex items-start gap-3 text-sm">
										<div className="mt-0.5 size-2 shrink-0 rounded-full bg-muted-foreground" />
										<div className="flex-1">
											<span className="font-medium">{event.actorName}</span>{" "}
											{formatEventDescription(event)}{" "}
											<span className="font-medium">{event.ideaSubmissionId}</span>
										</div>
										<span className="shrink-0 text-xs text-muted-foreground">
											{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
										</span>
									</div>
								))}
							</div>
						) : (
							<p className="py-8 text-center text-sm text-muted-foreground">No activity yet</p>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Full ideas table */}
			<Card>
				<CardHeader className="flex-row items-center justify-between space-y-0">
					<CardTitle>All Ideas</CardTitle>
					{ideas.length > 0 && (
						<Button variant="outline" size="sm" onClick={() => exportIdeasCsv(ideas)}>
							<Download className="mr-2 size-3.5" />
							Export CSV
						</Button>
					)}
				</CardHeader>
				<CardContent>
					{ideas.length === 0 ? (
						<div className="flex flex-col items-center justify-center p-12 text-center">
							<div className="mb-4 rounded-full bg-muted p-4">
								<Lightbulb className="size-8 text-muted-foreground" />
							</div>
							<h2 className="mb-2 text-lg font-semibold">ThoughtBox is live</h2>
							<p className="max-w-sm text-sm text-muted-foreground">
								Ideas will appear here once employees start sharing. Time to spread the word.
							</p>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[90px]">ID</TableHead>
									<TableHead>Title</TableHead>
									<TableHead>Submitter</TableHead>
									<TableHead>Assigned To</TableHead>
									<TableHead>Category</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>SLA</TableHead>
									<TableHead className="text-right">Submitted</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{ideas.map((idea) => (
									<TableRow
										key={idea.id}
										className={cn(
											"cursor-pointer hover:bg-muted/50",
											idea.slaStatus === "overdue" && "bg-destructive/5",
										)}
									>
										<TableCell className="font-mono text-xs">{idea.submissionId}</TableCell>
										<TableCell>
											<Link
												to="/ideas/$submissionId"
												params={{ submissionId: idea.submissionId }}
												className="font-medium hover:underline"
											>
												{idea.title}
											</Link>
										</TableCell>
										<TableCell className="text-muted-foreground">{idea.submitterName}</TableCell>
										<TableCell className="text-muted-foreground">
											{idea.assignedLeaderName ?? "—"}
										</TableCell>
										<TableCell className="text-muted-foreground">{idea.categoryName}</TableCell>
										<TableCell>
											<StatusBadge
												status={idea.status as Parameters<typeof StatusBadge>[0]["status"]}
											/>
										</TableCell>
										<TableCell>
											<SlaIndicator
												slaStatus={idea.slaStatus}
												slaDaysRemaining={idea.slaDaysRemaining}
												slaDueDate={idea.slaDueDate}
											/>
										</TableCell>
										<TableCell className="text-right text-muted-foreground">
											{formatDistanceToNow(new Date(idea.submittedAt), { addSuffix: true })}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getHealthStatus(stats: DashboardStats): {
	label: string;
	color: string;
	detail: string;
} {
	const slaGood = stats.slaCompliancePercent === null || stats.slaCompliancePercent >= 80;
	const volumeGood = stats.totalThisMonth > 0;

	if (slaGood && volumeGood) {
		return {
			label: "Program Healthy",
			color: "text-green-600 dark:text-green-400",
			detail: "SLA compliance on target, ideas flowing",
		};
	}
	if (!slaGood && !volumeGood) {
		return {
			label: "Needs Attention",
			color: "text-red-600 dark:text-red-400",
			detail: "Low volume and SLA compliance below target",
		};
	}
	return {
		label: "Monitor",
		color: "text-yellow-600 dark:text-yellow-400",
		detail: !slaGood ? "SLA compliance below 80%" : "No submissions this month",
	};
}

function exportIdeasCsv(ideas: AdminIdea[]) {
	const headers = [
		"ID",
		"Title",
		"Submitter",
		"Assigned To",
		"Category",
		"Status",
		"SLA Status",
		"Submitted",
	];
	const rows = ideas.map((i) => [
		i.submissionId,
		`"${i.title.replace(/"/g, '""')}"`,
		i.submitterName,
		i.assignedLeaderName ?? "",
		i.categoryName,
		STATUS_LABELS[i.status as keyof typeof STATUS_LABELS] ?? i.status,
		i.slaStatus,
		new Date(i.submittedAt).toLocaleDateString(),
	]);

	const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
	const blob = new Blob([csv], { type: "text/csv" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `thoughtbox-ideas-${new Date().toISOString().slice(0, 10)}.csv`;
	a.click();
	URL.revokeObjectURL(url);
}

function formatEventDescription(event: ActivityEvent): string {
	switch (event.eventType) {
		case "created":
			return "submitted idea";
		case "status_changed":
			return `changed status to ${STATUS_LABELS[event.newValue as keyof typeof STATUS_LABELS] ?? event.newValue} on`;
		case "reassigned":
			return "reassigned";
		case "note_added":
			return "added a note on";
		case "message":
			return "sent a message on";
		default:
			return "updated";
	}
}

function KpiCard({
	icon: Icon,
	label,
	value,
	detail,
	variant = "default",
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: number | string;
	detail?: string;
	variant?: "default" | "success" | "warning" | "destructive";
}) {
	const colorMap = {
		default: { bg: "bg-muted", icon: "text-muted-foreground", value: "" },
		success: {
			bg: "bg-green-100 dark:bg-green-900/30",
			icon: "text-green-600 dark:text-green-400",
			value: "text-green-600 dark:text-green-400",
		},
		warning: {
			bg: "bg-yellow-100 dark:bg-yellow-900/30",
			icon: "text-yellow-600 dark:text-yellow-400",
			value: "text-yellow-600 dark:text-yellow-400",
		},
		destructive: {
			bg: "bg-red-100 dark:bg-red-900/30",
			icon: "text-red-600 dark:text-red-400",
			value: "text-red-600 dark:text-red-400",
		},
	};

	const colors = colorMap[variant];

	return (
		<Card>
			<CardContent className="flex items-center gap-3 p-4">
				<div className={cn("rounded-full p-2", colors.bg)}>
					<Icon className={cn("size-4", colors.icon)} />
				</div>
				<div className="min-w-0">
					<p className={cn("text-2xl font-bold", colors.value)}>{value}</p>
					<p className="text-xs text-muted-foreground">{label}</p>
					{detail && <p className="text-xs text-muted-foreground/70">{detail}</p>}
				</div>
			</CardContent>
		</Card>
	);
}
