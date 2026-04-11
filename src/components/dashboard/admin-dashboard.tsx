import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import {
	Activity,
	BarChart3,
	CheckCircle,
	Clock,
	Inbox,
	Lightbulb,
	TrendingUp,
} from "lucide-react";
import { useState } from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Pie,
	PieChart,
	XAxis,
	YAxis,
} from "recharts";
import { FadeIn } from "#/components/ui/animated";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "#/components/ui/chart";
import { SortableHeader } from "#/components/ui/data-table";
import { UserCardPopover } from "#/components/ui/user-card";
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

export interface AdminIdea {
	id: string;
	submissionId: string;
	title: string;
	status: string;
	categoryName: string;
	submitterName: string;
	submitterPhotoUrl: string | null;
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

interface MonthlyData {
	month: string;
	status: string;
	count: number;
}

interface OutcomeData {
	status: string;
	count: number;
}

interface ActivityEvent {
	id: string;
	eventType: string;
	actorId: string;
	actorName: string;
	ideaSubmissionId: string;
	ideaTitle: string;
	oldValue: string | null;
	newValue: string | null;
	createdAt: string;
}

interface AdminDashboardProps {
	stats: DashboardStats;
	byCategory?: CategoryData[];
	byMonth?: MonthlyData[];
	outcomeDistribution?: OutcomeData[];
	recentActivity?: ActivityEvent[];
	hideKpi?: boolean;
}

// ── Chart configs ─────────────────────────────────────────────────────────

const categoryChartConfig = {
	count: { label: "Ideas", color: "#3b82f6" },
} satisfies ChartConfig;

const monthlyChartConfig = {
	count: { label: "Ideas", color: "#3b82f6" },
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

// ── Column definitions ────────────────────────────────────────────────────

export const adminIdeaColumns: ColumnDef<AdminIdea, unknown>[] = [
	{
		accessorKey: "submissionId",
		header: ({ column }) => <SortableHeader column={column}>ID</SortableHeader>,
		cell: ({ row }) => <span className="font-mono text-xs">{row.original.submissionId}</span>,
		size: 90,
	},
	{
		accessorKey: "title",
		header: ({ column }) => <SortableHeader column={column}>Title</SortableHeader>,
		cell: ({ row }) => (
			<div className="max-w-[400px]">
				<Link
					to="/ideas/$submissionId"
					params={{ submissionId: row.original.submissionId }}
					className="font-medium line-clamp-1"
					onClick={(e) => e.stopPropagation()}
				>
					{row.original.title}
				</Link>
			</div>
		),
	},
	{
		accessorKey: "submitterName",
		header: ({ column }) => <SortableHeader column={column}>Submitter</SortableHeader>,
		cell: ({ row }) => (
			<div className="flex items-center gap-2">
				<Avatar className="size-6">
					{row.original.submitterPhotoUrl && (
						<AvatarImage src={row.original.submitterPhotoUrl} alt={row.original.submitterName} />
					)}
					<AvatarFallback className="text-[10px]">
						{row.original.submitterName
							.split(" ")
							.map((n) => n[0])
							.join("")
							.slice(0, 2)}
					</AvatarFallback>
				</Avatar>
				<span className="text-muted-foreground">{row.original.submitterName}</span>
			</div>
		),
	},
	{
		accessorKey: "assignedLeaderName",
		header: ({ column }) => <SortableHeader column={column}>Assigned To</SortableHeader>,
		cell: ({ row }) => (
			<span className="text-muted-foreground">{row.original.assignedLeaderName ?? "—"}</span>
		),
	},
	{
		accessorKey: "categoryName",
		header: ({ column }) => <SortableHeader column={column}>Category</SortableHeader>,
		cell: ({ row }) => <span className="text-muted-foreground">{row.original.categoryName}</span>,
		filterFn: "equals",
	},
	{
		accessorKey: "status",
		header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
		cell: ({ row }) => (
			<StatusBadge status={row.original.status as Parameters<typeof StatusBadge>[0]["status"]} />
		),
		filterFn: "equals",
	},
	{
		accessorKey: "slaDaysRemaining",
		header: ({ column }) => <SortableHeader column={column}>SLA</SortableHeader>,
		cell: ({ row }) => (
			<SlaIndicator
				slaStatus={row.original.slaStatus}
				slaDaysRemaining={row.original.slaDaysRemaining}
				slaDueDate={row.original.slaDueDate}
			/>
		),
	},
	{
		accessorKey: "submittedAt",
		header: ({ column }) => (
			<SortableHeader column={column}>
				<span className="text-right">Submitted</span>
			</SortableHeader>
		),
		cell: ({ row }) => (
			<span className="text-muted-foreground">
				{formatDistanceToNow(new Date(row.original.submittedAt), { addSuffix: true })}
			</span>
		),
	},
];

// ── Component ─────────────────────────────────────────────────────────────

export function AdminDashboard({
	stats,
	byCategory,
	byMonth,
	outcomeDistribution,
	recentActivity,
	hideKpi,
}: AdminDashboardProps) {
	const navigate = useNavigate();
	const hasCharts = !!byCategory;

	const outcomeConfig = Object.fromEntries(
		(outcomeDistribution ?? []).map((d) => [
			d.status,
			{
				label: STATUS_LABELS[d.status as keyof typeof STATUS_LABELS] ?? d.status,
				color: STATUS_COLORS[d.status] ?? "var(--color-chart-1)",
			},
		]),
	) satisfies ChartConfig;

	const monthlyTrend = Object.entries(
		(byMonth ?? []).reduce<Record<string, number>>((acc, d) => {
			acc[d.month] = (acc[d.month] ?? 0) + d.count;
			return acc;
		}, {}),
	)
		.map(([month, count]) => ({ month, count }))
		.sort((a, b) => a.month.localeCompare(b.month));

	const healthStatus = getHealthStatus(stats);

	if (!hasCharts) {
		return (
			<div className="min-w-0 space-y-6">
				<div className="flex items-center gap-2">
					<Activity className={cn("size-4", healthStatus.color)} />
					<span className={cn("text-sm font-medium", healthStatus.color)}>
						{healthStatus.label}
					</span>
					<span className="text-xs text-muted-foreground">{healthStatus.detail}</span>
				</div>
				<KpiRow stats={stats} />
			</div>
		);
	}

	return (
		<div className="min-w-0 space-y-6">
			{!hideKpi && (
				<>
					<div className="flex items-center gap-2">
						<Activity className={cn("size-4", healthStatus.color)} />
						<span className={cn("text-sm font-medium", healthStatus.color)}>
							{healthStatus.label}
						</span>
						<span className="text-xs text-muted-foreground">{healthStatus.detail}</span>
					</div>
					<KpiRow stats={stats} />
				</>
			)}

			{/* Charts row */}
			<div className="grid gap-6 lg:grid-cols-2">
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
									<Bar
										dataKey="count"
										fill="var(--color-count)"
										radius={4}
										className="cursor-pointer"
										onClick={(data) => {
											if (data?.categoryName) {
												navigate({ to: "/admin/ideas", search: { category: data.categoryName } });
											}
										}}
									/>
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

				{/* Submissions Over Time */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-sm font-medium">
							<TrendingUp className="size-4" />
							Submissions Over Time
						</CardTitle>
					</CardHeader>
					<CardContent>
						{monthlyTrend.length > 0 ? (
							<ChartContainer config={monthlyChartConfig} className="h-[250px] w-full">
								<AreaChart data={monthlyTrend} margin={{ left: 0, right: 16 }}>
									<defs>
										<linearGradient id="fillCount" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
											<stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
										</linearGradient>
									</defs>
									<CartesianGrid vertical={false} />
									<XAxis
										dataKey="month"
										tickLine={false}
										axisLine={false}
										fontSize={12}
										tickFormatter={(v) => {
											const [y, m] = v.split("-");
											return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", {
												month: "short",
											});
										}}
									/>
									<YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Area
										type="monotone"
										dataKey="count"
										stroke="#3b82f6"
										fill="url(#fillCount)"
										strokeWidth={2}
									/>
								</AreaChart>
							</ChartContainer>
						) : (
							<p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>
						)}
					</CardContent>
				</Card>

				{/* Recent Activity */}
				<ActivityFeed events={recentActivity} />
			</div>
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

export function exportIdeasCsv(ideas: AdminIdea[]) {
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

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
	const [expanded, setExpanded] = useState(false);
	const displayEvents = expanded ? events : events.slice(0, 10);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
			</CardHeader>
			<CardContent>
				{events.length > 0 ? (
					<div className="space-y-3">
						{displayEvents.map((event) => (
							<div key={event.id} className="flex items-start gap-3 text-sm">
								<div className="mt-0.5 size-2 shrink-0 rounded-full bg-muted-foreground" />
								<div className="flex-1">
									<UserCardPopover userId={event.actorId}>
										<button
											type="button"
											className="font-medium hover:text-primary hover:underline"
										>
											{event.actorName}
										</button>
									</UserCardPopover>{" "}
									{formatEventDescription(event)}{" "}
									<Link
										to="/ideas/$submissionId"
										params={{ submissionId: event.ideaSubmissionId }}
										className="font-medium text-primary hover:underline"
									>
										{event.ideaSubmissionId}
									</Link>
								</div>
								<span className="shrink-0 text-xs text-muted-foreground">
									{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
								</span>
							</div>
						))}
						{events.length > 10 && (
							<button
								type="button"
								onClick={() => setExpanded(!expanded)}
								className="text-xs font-medium text-primary hover:underline"
							>
								{expanded ? "Show less" : `Show all ${events.length} events`}
							</button>
						)}
					</div>
				) : (
					<p className="py-8 text-center text-sm text-muted-foreground">No activity yet</p>
				)}
			</CardContent>
		</Card>
	);
}

function KpiRow({ stats }: { stats: DashboardStats }) {
	const navigate = useNavigate();
	const goToIdeas = (filter: string) => navigate({ to: "/admin/ideas", search: { filter } });

	return (
		<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
			<FadeIn delay={0}>
				<KpiCard
					icon={Lightbulb}
					label="This Month"
					value={stats.totalThisMonth}
					detail={`${stats.totalThisYear} this year`}
					onClick={() => goToIdeas("thisMonth")}
				/>
			</FadeIn>
			<FadeIn delay={0.05}>
				<KpiCard
					icon={Inbox}
					label="Open Ideas"
					value={stats.openCount}
					detail={stats.overdueCount > 0 ? `${stats.overdueCount} overdue` : "none overdue"}
					variant={stats.overdueCount > 0 ? "warning" : "default"}
					onClick={() => goToIdeas("open")}
				/>
			</FadeIn>
			<FadeIn delay={0.1}>
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
			</FadeIn>
			<FadeIn delay={0.15}>
				<KpiCard
					icon={Clock}
					label="Avg Close Time"
					value={stats.avgCloseTimeDays !== null ? `${stats.avgCloseTimeDays}d` : "—"}
				/>
			</FadeIn>
			<FadeIn delay={0.2}>
				<KpiCard
					icon={TrendingUp}
					label="Total This Year"
					value={stats.totalThisYear}
					onClick={() => goToIdeas("thisYear")}
				/>
			</FadeIn>
		</div>
	);
}

function KpiCard({
	icon: Icon,
	label,
	value,
	detail,
	variant = "default",
	onClick,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: number | string;
	detail?: string;
	variant?: "default" | "success" | "warning" | "destructive";
	onClick?: () => void;
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
	const Wrapper = onClick ? "button" : "div";

	return (
		<Wrapper
			type={onClick ? "button" : undefined}
			onClick={onClick}
			className={onClick ? "w-full text-left" : undefined}
		>
			<Card
				className={cn(
					"h-full transition-all",
					onClick && "hover:border-primary/30 hover:bg-muted/30",
				)}
			>
				<CardContent className="flex h-full items-center gap-3 p-4">
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
		</Wrapper>
	);
}
