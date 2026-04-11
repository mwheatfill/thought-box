import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle, Clock, Inbox } from "lucide-react";
import { useMemo, useState } from "react";
import { FadeIn } from "#/components/ui/animated";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { DataTable, SortableHeader } from "#/components/ui/data-table";
import { KpiCard } from "#/components/ui/kpi-card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { UserCardPopover } from "#/components/ui/user-card";
import { OPEN_STATUSES, STATUS_LABELS } from "#/lib/constants";
import { cn } from "#/lib/utils";
import { SlaIndicator } from "./sla-indicator";
import { StatusBadge } from "./status-badge";

interface LeaderIdea {
	id: string;
	submissionId: string;
	title: string;
	status: string;
	categoryName: string;
	submitterId: string;
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

type QueueFilter = "open" | "overdue" | "closed" | null;

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
			<UserCardPopover userId={row.original.submitterId}>
				<button type="button" className="flex items-center gap-2 hover:text-primary">
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
				</button>
			</UserCardPopover>
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
	const openIdeas = useMemo(() => ideas.filter((i) => OPEN_STATUSES.includes(i.status)), [ideas]);
	const closedIdeas = useMemo(
		() => ideas.filter((i) => !OPEN_STATUSES.includes(i.status)),
		[ideas],
	);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [bulkStatus, setBulkStatus] = useState("under_review");
	const [kpiFilter, setKpiFilter] = useState<QueueFilter>(enableKpiFilter ? "open" : null);

	const displayIdeas = useMemo(() => {
		if (!kpiFilter) return ideas;
		if (kpiFilter === "open") return openIdeas;
		if (kpiFilter === "overdue") return openIdeas.filter((i) => i.slaStatus === "overdue");
		if (kpiFilter === "closed") return closedIdeas;
		return ideas;
	}, [ideas, openIdeas, closedIdeas, kpiFilter]);

	const toggleKpi = (key: QueueFilter) => {
		if (!enableKpiFilter) return;
		setKpiFilter((prev) => (prev === key ? null : key));
		setRowSelection({});
	};

	return (
		<div className="space-y-6">
			{/* KPI row */}
			<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
				<FadeIn delay={0}>
					<KpiCard
						icon={Inbox}
						label="My Open"
						value={stats.openCount}
						color="blue"
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
						color={stats.overdueCount > 0 ? "red" : undefined}
						onClick={enableKpiFilter ? () => toggleKpi("overdue") : undefined}
						isActive={kpiFilter === "overdue"}
					/>
				</FadeIn>
				<FadeIn delay={0.1}>
					<KpiCard
						icon={CheckCircle}
						label="Closed"
						value={closedIdeas.length}
						color="emerald"
						onClick={enableKpiFilter ? () => toggleKpi("closed") : undefined}
						isActive={kpiFilter === "closed"}
					/>
				</FadeIn>
				<FadeIn delay={0.15}>
					<KpiCard
						icon={Clock}
						label="Total Assigned"
						value={stats.totalAssigned}
						color="purple"
						onClick={
							enableKpiFilter
								? () => {
										setKpiFilter(null);
										setRowSelection({});
									}
								: undefined
						}
						isActive={kpiFilter === null}
					/>
				</FadeIn>
			</div>

			{/* Ideas table */}
			{displayIdeas.length === 0 && !kpiFilter ? (
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
						<CardTitle>
							{kpiFilter === null
								? "All Assigned Ideas"
								: kpiFilter === "closed"
									? "Closed Ideas"
									: "Assigned Ideas"}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<DataTable
							columns={leaderColumns}
							data={displayIdeas}
							searchPlaceholder="Search ideas..."
							enableSelection={kpiFilter === "open" || kpiFilter === "overdue"}
							rowSelection={kpiFilter === "open" || kpiFilter === "overdue" ? rowSelection : {}}
							onRowSelectionChange={
								kpiFilter === "open" || kpiFilter === "overdue" ? setRowSelection : undefined
							}
							getRowId={(row) => row.id}
							facetedFilters={[
								{
									columnId: "status",
									label: "Status",
									options: [...new Set(displayIdeas.map((i) => i.status))].map((s) => ({
										value: s,
										label: STATUS_LABELS[s as keyof typeof STATUS_LABELS] ?? s,
									})),
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
