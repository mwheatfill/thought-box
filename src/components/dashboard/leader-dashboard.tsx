import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle, Clock, Inbox, X } from "lucide-react";
import { useMemo, useState } from "react";
import { FadeIn } from "#/components/ui/animated";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { DataTable, SortableHeader } from "#/components/ui/data-table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { cn } from "#/lib/utils";
import { SlaIndicator } from "./sla-indicator";
import { StatusBadge } from "./status-badge";

interface LeaderIdea {
	id: string;
	submissionId: string;
	title: string;
	status: string;
	categoryName: string;
	submitterName: string;
	submitterPhotoUrl: string | null;
	submittedAt: string;
	slaDueDate: string | null;
	slaDaysRemaining: number | null;
	slaStatus: "on_track" | "approaching" | "overdue" | "none";
}

interface LeaderStats {
	openCount: number;
	overdueCount: number;
	totalAssigned: number;
}

type QueueFilter = "open" | "overdue" | null;

interface LeaderDashboardProps {
	ideas: LeaderIdea[];
	stats: LeaderStats;
	onBulkUpdate?: (ideaIds: string[], status: string) => Promise<void>;
	isBulkUpdating?: boolean;
	enableKpiFilter?: boolean;
}

// ── Column definitions ────────────────────────────────────────────────────

const leaderColumns: ColumnDef<LeaderIdea, unknown>[] = [
	{
		accessorKey: "submissionId",
		header: ({ column }) => <SortableHeader column={column}>ID</SortableHeader>,
		cell: ({ row }) => <span className="font-mono text-xs">{row.original.submissionId}</span>,
		size: 100,
	},
	{
		accessorKey: "title",
		header: ({ column }) => <SortableHeader column={column}>Title</SortableHeader>,
		cell: ({ row }) => (
			<Link
				to="/ideas/$submissionId"
				params={{ submissionId: row.original.submissionId }}
				className="font-medium"
				onClick={(e) => e.stopPropagation()}
			>
				{row.original.title}
			</Link>
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
		header: ({ column }) => <SortableHeader column={column}>Submitted</SortableHeader>,
		cell: ({ row }) => (
			<span className="text-muted-foreground">
				{formatDistanceToNow(new Date(row.original.submittedAt), { addSuffix: true })}
			</span>
		),
	},
];

// ── Component ─────────────────────────────────────────────────────────────

export function LeaderDashboard({
	ideas,
	stats,
	onBulkUpdate,
	isBulkUpdating,
	enableKpiFilter,
}: LeaderDashboardProps) {
	const navigate = useNavigate();
	const openStatuses = ["new", "under_review", "in_progress"];
	const openIdeas = ideas.filter((i) => openStatuses.includes(i.status));
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [bulkStatus, setBulkStatus] = useState("under_review");
	const [kpiFilter, setKpiFilter] = useState<QueueFilter>(null);

	const displayIdeas = useMemo(() => {
		if (!kpiFilter) return openIdeas;
		if (kpiFilter === "overdue") return openIdeas.filter((i) => i.slaStatus === "overdue");
		return openIdeas; // "open" is the default view
	}, [openIdeas, kpiFilter]);

	const toggleKpi = (key: QueueFilter) => {
		if (!enableKpiFilter) return;
		setKpiFilter((prev) => (prev === key ? null : key));
		setRowSelection({});
	};

	const filterLabel = kpiFilter === "overdue" ? "Overdue" : kpiFilter === "open" ? "My Open" : null;

	return (
		<div className="space-y-6">
			{/* KPI row */}
			<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
				<FadeIn delay={0}>
					<KpiCard
						icon={Inbox}
						label="My Open"
						value={stats.openCount}
						onClick={enableKpiFilter ? () => toggleKpi("open") : undefined}
						isActive={kpiFilter === "open"}
					/>
				</FadeIn>
				<FadeIn delay={0.05}>
					<KpiCard
						icon={AlertTriangle}
						label="Overdue"
						value={stats.overdueCount}
						variant={stats.overdueCount > 0 ? "destructive" : "default"}
						onClick={enableKpiFilter ? () => toggleKpi("overdue") : undefined}
						isActive={kpiFilter === "overdue"}
					/>
				</FadeIn>
				<FadeIn delay={0.1}>
					<KpiCard icon={CheckCircle} label="Total Assigned" value={stats.totalAssigned} />
				</FadeIn>
				<FadeIn delay={0.15}>
					<KpiCard
						icon={Clock}
						label="Open Rate"
						value={
							stats.totalAssigned > 0
								? `${Math.round((stats.openCount / stats.totalAssigned) * 100)}%`
								: "—"
						}
					/>
				</FadeIn>
			</div>

			{/* Active filter chip */}
			{filterLabel && (
				<div className="flex items-center gap-2">
					<span className="text-sm text-muted-foreground">Showing:</span>
					<button
						type="button"
						onClick={() => setKpiFilter(null)}
						className="inline-flex items-center gap-1 rounded-full border bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
					>
						{filterLabel}
						<X className="size-3" />
					</button>
					<span className="text-xs text-muted-foreground">
						{displayIdeas.length} {displayIdeas.length === 1 ? "idea" : "ideas"}
					</span>
				</div>
			)}

			{/* Ideas table */}
			{openIdeas.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center p-12 text-center">
						<div className="mb-4 rounded-full bg-green-100 p-4 dark:bg-green-900/30">
							<CheckCircle className="size-8 text-green-600 dark:text-green-400" />
						</div>
						<h2 className="mb-2 text-lg font-semibold">All caught up!</h2>
						<p className="max-w-sm text-sm text-muted-foreground">
							You have no open ideas to review. Great work staying on top of things.
						</p>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>Assigned Ideas</CardTitle>
					</CardHeader>
					<CardContent>
						<DataTable
							columns={leaderColumns}
							data={displayIdeas}
							searchPlaceholder="Search ideas..."
							searchColumn="title"
							enableSelection
							rowSelection={rowSelection}
							onRowSelectionChange={setRowSelection}
							getRowId={(row) => row.id}
							facetedFilters={[
								{
									columnId: "status",
									label: "Status",
									options: [
										{ value: "new", label: "New" },
										{ value: "under_review", label: "Under Review" },
										{ value: "in_progress", label: "In Progress" },
									],
								},
								{
									columnId: "categoryName",
									label: "Category",
									options: [...new Set(displayIdeas.map((i) => i.categoryName))]
										.sort()
										.map((c) => ({
											value: c,
											label: c,
										})),
								},
							]}
							onRowClick={(idea) =>
								navigate({
									to: "/ideas/$submissionId",
									params: { submissionId: idea.submissionId },
								})
							}
							rowClassName={(idea) =>
								cn(
									idea.slaStatus === "overdue" && "bg-destructive/5",
									rowSelection[idea.id] && "bg-primary/5",
								)
							}
							selectionToolbar={(count) => (
								<>
									<span className="text-sm text-muted-foreground">{count} selected</span>
									<Select value={bulkStatus} onValueChange={setBulkStatus}>
										<SelectTrigger className="h-8 w-[150px]" onClick={(e) => e.stopPropagation()}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="under_review">Under Review</SelectItem>
											<SelectItem value="accepted">Accepted</SelectItem>
											<SelectItem value="in_progress">In Progress</SelectItem>
											<SelectItem value="declined">Declined</SelectItem>
										</SelectContent>
									</Select>
									<Button
										size="sm"
										disabled={isBulkUpdating}
										onClick={async () => {
											if (!onBulkUpdate) return;
											await onBulkUpdate(Object.keys(rowSelection), bulkStatus);
											setRowSelection({});
										}}
									>
										{isBulkUpdating ? "Updating..." : "Apply"}
									</Button>
								</>
							)}
						/>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

// ── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({
	icon: Icon,
	label,
	value,
	variant = "default",
	onClick,
	isActive,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: number | string;
	variant?: "default" | "destructive";
	onClick?: () => void;
	isActive?: boolean;
}) {
	const isDestructive = variant === "destructive";
	const Wrapper = onClick ? "button" : "div";

	return (
		<Wrapper
			type={onClick ? "button" : undefined}
			onClick={onClick}
			className={onClick ? "text-left" : undefined}
		>
			<Card
				className={cn(
					"h-full transition-all",
					isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background",
					onClick && !isActive && "hover:border-primary/30 hover:bg-muted/30",
				)}
			>
				<CardContent className="flex h-full items-center gap-4 p-4">
					<div
						className={cn(
							"rounded-full p-2",
							isDestructive ? "bg-red-100 dark:bg-red-900/30" : "bg-muted",
						)}
					>
						<Icon
							className={cn(
								"size-4",
								isDestructive ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
							)}
						/>
					</div>
					<div>
						<p
							className={cn(
								"text-2xl font-bold",
								isDestructive && "text-red-600 dark:text-red-400",
							)}
						>
							{value}
						</p>
						<p className="text-xs text-muted-foreground">{label}</p>
					</div>
				</CardContent>
			</Card>
		</Wrapper>
	);
}
