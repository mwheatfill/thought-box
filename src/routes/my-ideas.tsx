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

type KpiFilter = "all" | "active" | "implemented" | null;

const ACTIVE_STATUSES = ["new", "under_review", "in_progress"];

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
		const active = ideas.filter((i) => ACTIVE_STATUSES.includes(i.status)).length;
		const implemented = ideas.filter((i) => i.status === "implemented").length;
		return { active, implemented };
	}, [ideas]);

	const filteredIdeas = useMemo(() => {
		if (!kpiFilter) return ideas;
		if (kpiFilter === "active") return ideas.filter((i) => ACTIVE_STATUSES.includes(i.status));
		if (kpiFilter === "implemented") return ideas.filter((i) => i.status === "implemented");
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
					label="Implemented"
					value={stats.implemented}
					color="emerald"
					onClick={() => toggleKpi("implemented")}
					isActive={kpiFilter === "implemented"}
				/>
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

// ── KPI Card ──────────────────────────────────────────────────────────────

const COLOR_STYLES = {
	amber: {
		bg: "bg-amber-100 dark:bg-amber-900/30",
		icon: "text-amber-600 dark:text-amber-400",
	},
	blue: {
		bg: "bg-blue-100 dark:bg-blue-900/30",
		icon: "text-blue-600 dark:text-blue-400",
	},
	emerald: {
		bg: "bg-emerald-100 dark:bg-emerald-900/30",
		icon: "text-emerald-600 dark:text-emerald-400",
	},
};

function KpiCard({
	icon: Icon,
	label,
	value,
	color,
	onClick,
	isActive,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: number;
	color: keyof typeof COLOR_STYLES;
	onClick: () => void;
	isActive: boolean;
}) {
	const styles = COLOR_STYLES[color];

	return (
		<button type="button" onClick={onClick} className="w-full text-left">
			<Card
				className={cn(
					"h-full transition-all",
					isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background",
					!isActive && "hover:border-primary/30 hover:bg-muted/30",
				)}
			>
				<CardContent className="flex items-center gap-3 p-4">
					<div className={cn("rounded-full p-2", styles.bg)}>
						<Icon className={cn("size-4", styles.icon)} />
					</div>
					<div>
						<p className="text-xl font-bold">{value}</p>
						<p className="text-xs text-muted-foreground">{label}</p>
					</div>
				</CardContent>
			</Card>
		</button>
	);
}
