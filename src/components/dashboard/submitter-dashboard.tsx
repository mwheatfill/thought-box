import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { Lightbulb, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { DataTable, SortableHeader } from "#/components/ui/data-table";
import { STATUS_LABELS } from "#/lib/constants";
import type { AuthUser } from "#/server/middleware/auth";
import { StatusBadge } from "./status-badge";

interface SubmitterIdea {
	id: string;
	submissionId: string;
	title: string;
	status: string;
	categoryName: string;
	submittedAt: string;
}

interface SubmitterDashboardProps {
	user: AuthUser;
	ideas: SubmitterIdea[];
	yearlyCount: number;
}

const submitterColumns: ColumnDef<SubmitterIdea, unknown>[] = [
	{
		accessorKey: "submissionId",
		header: "ID",
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
		accessorKey: "categoryName",
		header: "Category",
		cell: ({ row }) => <span className="text-muted-foreground">{row.original.categoryName}</span>,
		filterFn: "equals",
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<StatusBadge status={row.original.status as Parameters<typeof StatusBadge>[0]["status"]} />
		),
		filterFn: "equals",
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

export function SubmitterDashboard({ user, ideas, yearlyCount }: SubmitterDashboardProps) {
	const navigate = useNavigate();
	const firstName = user.displayName.split(" ")[0];

	return (
		<div className="space-y-6">
			{/* Stat card */}
			<Card>
				<CardContent className="flex items-center gap-4 p-6">
					<div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900/30">
						<Lightbulb className="size-6 text-amber-600 dark:text-amber-400" />
					</div>
					<div>
						<p className="text-2xl font-bold">{yearlyCount}</p>
						<p className="text-sm text-muted-foreground">
							{yearlyCount === 0
								? `${firstName}, you haven't shared an idea yet this year`
								: yearlyCount === 1
									? "idea shared this year — great start!"
									: "ideas shared this year — keep it up!"}
						</p>
					</div>
				</CardContent>
			</Card>

			{/* Ideas list */}
			{ideas.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center p-12 text-center">
						<div className="mb-4 rounded-full bg-muted p-4">
							<Sparkles className="size-8 text-muted-foreground" />
						</div>
						<h2 className="mb-2 text-lg font-semibold">You haven't shared an idea yet</h2>
						<p className="mb-4 max-w-sm text-sm text-muted-foreground">
							It only takes a minute, and every idea helps. Head to the Submit page and tell us
							what's on your mind.
						</p>
						<Link
							to="/"
							className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
						>
							Share an idea
						</Link>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>My Ideas</CardTitle>
					</CardHeader>
					<CardContent>
						<DataTable
							columns={submitterColumns}
							data={ideas}
							searchPlaceholder="Search my ideas..."
							searchColumn="title"
							facetedFilters={[
								{
									columnId: "status",
									label: "Status",
									options: Object.entries(STATUS_LABELS).map(([value, label]) => ({
										value,
										label,
									})),
								},
							]}
							onRowClick={(idea) =>
								navigate({
									to: "/ideas/$submissionId",
									params: { submissionId: idea.submissionId },
								})
							}
						/>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
