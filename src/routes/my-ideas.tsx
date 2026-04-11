import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, Clock, Lightbulb, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusBadge } from "#/components/dashboard/status-badge";
import { StatusPipeline } from "#/components/dashboard/status-pipeline";
import { Card, CardContent } from "#/components/ui/card";
import { DataTable, SortableHeader } from "#/components/ui/data-table";
import type { IdeaStatus } from "#/lib/constants";
import { cn } from "#/lib/utils";
import { getUserSubmissionCount } from "#/server/functions/ai";
import { getMyIdeas } from "#/server/functions/dashboard";

export const Route = createFileRoute("/my-ideas")({
	loader: async ({ context }) => {
		const [ideas, yearlyCount] = await Promise.all([
			getMyIdeas(),
			getUserSubmissionCount({ data: context.user.id }),
		]);
		return { ideas, yearlyCount };
	},
	component: MyIdeasPage,
});

interface MyIdea {
	id: string;
	submissionId: string;
	title: string;
	status: string;
	categoryName: string;
	submittedAt: string;
}

type FilterKey = "all" | "active" | "completed" | "closed";

const FILTERS: { key: FilterKey; label: string; statuses: string[] | null }[] = [
	{ key: "all", label: "All", statuses: null },
	{ key: "active", label: "Active", statuses: ["new", "under_review", "in_progress"] },
	{ key: "completed", label: "Completed", statuses: ["accepted", "implemented"] },
	{ key: "closed", label: "Closed", statuses: ["declined", "redirected"] },
];

const columns: ColumnDef<MyIdea, unknown>[] = [
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
			<span className="font-medium max-w-[400px] line-clamp-1">{row.original.title}</span>
		),
	},
	{
		accessorKey: "categoryName",
		header: "Category",
		cell: ({ row }) => <span className="text-muted-foreground">{row.original.categoryName}</span>,
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => <StatusBadge status={row.original.status as IdeaStatus} />,
	},
	{
		id: "progress",
		header: "Progress",
		cell: ({ row }) => (
			<div className="w-24">
				<StatusPipeline status={row.original.status as IdeaStatus} />
			</div>
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

function MyIdeasPage() {
	const { ideas, yearlyCount } = Route.useLoaderData();
	const navigate = useNavigate();
	const [filter, setFilter] = useState<FilterKey>("all");

	const stats = useMemo(() => {
		const inProgress = ideas.filter((i) =>
			["new", "under_review", "in_progress"].includes(i.status),
		).length;
		const implemented = ideas.filter((i) => i.status === "implemented").length;
		return { inProgress, implemented };
	}, [ideas]);

	const filteredIdeas = useMemo(() => {
		const f = FILTERS.find((f) => f.key === filter);
		if (!f?.statuses) return ideas;
		return ideas.filter((i) => f.statuses?.includes(i.status));
	}, [ideas, filter]);

	const filterCounts = useMemo(() => {
		const counts: Record<FilterKey, number> = {
			all: ideas.length,
			active: 0,
			completed: 0,
			closed: 0,
		};
		for (const idea of ideas) {
			if (["new", "under_review", "in_progress"].includes(idea.status)) counts.active++;
			else if (["accepted", "implemented"].includes(idea.status)) counts.completed++;
			else counts.closed++;
		}
		return counts;
	}, [ideas]);

	if (ideas.length === 0) {
		return (
			<main className="mx-auto max-w-4xl p-6">
				<h1 className="mb-6 text-2xl font-bold">My Ideas</h1>
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
			</main>
		);
	}

	return (
		<main className="mx-auto max-w-6xl p-6">
			<h1 className="mb-6 text-2xl font-bold">My Ideas</h1>

			{/* Stat strip */}
			<div className="mb-6 grid grid-cols-3 gap-4">
				<Card>
					<CardContent className="flex items-center gap-3 p-4">
						<div className="rounded-full bg-amber-100 p-2 dark:bg-amber-900/30">
							<Lightbulb className="size-4 text-amber-600 dark:text-amber-400" />
						</div>
						<div>
							<p className="text-xl font-bold">{yearlyCount}</p>
							<p className="text-xs text-muted-foreground">
								{yearlyCount === 1 ? "Idea this year" : "Ideas this year"}
							</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="flex items-center gap-3 p-4">
						<div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
							<Clock className="size-4 text-blue-600 dark:text-blue-400" />
						</div>
						<div>
							<p className="text-xl font-bold">{stats.inProgress}</p>
							<p className="text-xs text-muted-foreground">In progress</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="flex items-center gap-3 p-4">
						<div className="rounded-full bg-emerald-100 p-2 dark:bg-emerald-900/30">
							<CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
						</div>
						<div>
							<p className="text-xl font-bold">{stats.implemented}</p>
							<p className="text-xs text-muted-foreground">Implemented</p>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Filter pills */}
			<div className="mb-4 flex gap-2">
				{FILTERS.map((f) => (
					<button
						key={f.key}
						type="button"
						onClick={() => setFilter(f.key)}
						className={cn(
							"rounded-full border px-3 py-1 text-xs font-medium transition-colors",
							filter === f.key
								? "border-primary bg-primary text-primary-foreground"
								: "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						{f.label}
						<span className="ml-1 opacity-60">{filterCounts[f.key]}</span>
					</button>
				))}
			</div>

			{/* Ideas table */}
			<Card>
				<CardContent className="p-0 pt-2">
					<DataTable
						columns={columns}
						data={filteredIdeas}
						searchPlaceholder="Search my ideas..."
						searchColumn="title"
						onRowClick={(idea) =>
							navigate({
								to: "/ideas/$submissionId",
								params: { submissionId: idea.submissionId },
							})
						}
					/>
				</CardContent>
			</Card>
		</main>
	);
}
