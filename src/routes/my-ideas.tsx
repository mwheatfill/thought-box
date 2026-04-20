import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, Clock, Lightbulb, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusBadge } from "#/components/dashboard/status-badge";
import { StatusPipeline } from "#/components/dashboard/status-pipeline";
import { Card, CardContent } from "#/components/ui/card";
import { DataTable, SortableHeader } from "#/components/ui/data-table";
import { KpiCard } from "#/components/ui/kpi-card";
import { type IdeaStatus, OPEN_STATUSES } from "#/lib/constants";
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

type KpiFilter = "all" | "active" | "accepted" | null;

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
			<span className="max-w-[400px] font-medium line-clamp-1">{row.original.title}</span>
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
	const [kpiFilter, setKpiFilter] = useState<KpiFilter>(null);

	const stats = useMemo(() => {
		const active = ideas.filter((i) => OPEN_STATUSES.includes(i.status)).length;
		const accepted = ideas.filter((i) => i.status === "accepted").length;
		return { active, accepted };
	}, [ideas]);

	const filteredIdeas = useMemo(() => {
		if (!kpiFilter) return ideas;
		if (kpiFilter === "active") return ideas.filter((i) => OPEN_STATUSES.includes(i.status));
		if (kpiFilter === "accepted") return ideas.filter((i) => i.status === "accepted");
		return ideas; // "all"
	}, [ideas, kpiFilter]);

	const toggleKpi = (key: KpiFilter) => {
		setKpiFilter((prev) => (prev === key ? null : key));
	};

	if (ideas.length === 0) {
		return (
			<main className="min-w-0 p-6">
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
		<main className="min-w-0 p-6">
			<h1 className="mb-6 text-2xl font-bold">My Ideas</h1>

			{/* Clickable stat cards */}
			<div className="mb-6 grid gap-4 sm:grid-cols-3">
				<KpiCard
					icon={Lightbulb}
					label={yearlyCount === 1 ? "Idea this year" : "Ideas this year"}
					value={yearlyCount}
					color="amber"
					onClick={() => toggleKpi("all")}
					isActive={kpiFilter === "all"}
				/>
				<KpiCard
					icon={Clock}
					label="In progress"
					value={stats.active}
					color="blue"
					onClick={() => toggleKpi("active")}
					isActive={kpiFilter === "active"}
				/>
				<KpiCard
					icon={CheckCircle}
					label="Accepted"
					value={stats.accepted}
					color="emerald"
					onClick={() => toggleKpi("accepted")}
					isActive={kpiFilter === "accepted"}
				/>
			</div>

			{/* Ideas table */}
			<Card>
				<CardContent className="p-0 pt-2">
					<DataTable
						columns={columns}
						data={filteredIdeas}
						searchPlaceholder="Search my ideas..."
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
