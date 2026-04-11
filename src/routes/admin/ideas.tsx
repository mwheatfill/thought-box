import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Calendar, Download, Inbox, TrendingUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
	type AdminIdea,
	adminIdeaColumns,
	exportIdeasCsv,
} from "#/components/dashboard/admin-dashboard";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { DataTable } from "#/components/ui/data-table";
import { STATUS_LABELS } from "#/lib/constants";
import { cn } from "#/lib/utils";
import { getAllIdeas } from "#/server/functions/dashboard";

export const Route = createFileRoute("/admin/ideas")({
	beforeLoad: ({ context }) => {
		if (context.user.role !== "admin") {
			throw new Error("Forbidden");
		}
	},
	loader: () => getAllIdeas(),
	component: AdminIdeasPage,
});

type KpiFilter = "thisMonth" | "open" | "overdue" | "thisYear" | null;

const OPEN_STATUSES = ["new", "under_review", "in_progress"];

interface KpiDef {
	key: KpiFilter;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	variant?: "destructive";
}

const KPI_DEFS: KpiDef[] = [
	{ key: "thisMonth", label: "This Month", icon: Calendar },
	{ key: "open", label: "Open Ideas", icon: Inbox },
	{ key: "overdue", label: "Overdue", icon: AlertTriangle, variant: "destructive" },
	{ key: "thisYear", label: "Total This Year", icon: TrendingUp },
];

function AdminIdeasPage() {
	const ideas = Route.useLoaderData() ?? [];
	const navigate = useNavigate();
	const [activeKpi, setActiveKpi] = useState<KpiFilter>(null);

	const now = new Date();
	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const startOfYear = new Date(now.getFullYear(), 0, 1);

	const startOfMonthMs = startOfMonth.getTime();
	const startOfYearMs = startOfYear.getTime();

	const stats = useMemo(() => {
		const thisMonth = ideas.filter(
			(i) => new Date(i.submittedAt).getTime() >= startOfMonthMs,
		).length;
		const thisYear = ideas.filter((i) => new Date(i.submittedAt).getTime() >= startOfYearMs).length;
		const open = ideas.filter((i) => OPEN_STATUSES.includes(i.status)).length;
		const overdue = ideas.filter((i) => i.slaStatus === "overdue").length;
		return { thisMonth, thisYear, open, overdue };
	}, [ideas, startOfMonthMs, startOfYearMs]);

	const kpiCounts: Record<NonNullable<KpiFilter>, number> = {
		thisMonth: stats.thisMonth,
		open: stats.open,
		overdue: stats.overdue,
		thisYear: stats.thisYear,
	};

	const filteredIdeas = useMemo(() => {
		if (!activeKpi) return ideas;
		switch (activeKpi) {
			case "thisMonth":
				return ideas.filter((i) => new Date(i.submittedAt).getTime() >= startOfMonthMs);
			case "open":
				return ideas.filter((i) => OPEN_STATUSES.includes(i.status));
			case "overdue":
				return ideas.filter((i) => i.slaStatus === "overdue");
			case "thisYear":
				return ideas.filter((i) => new Date(i.submittedAt).getTime() >= startOfYearMs);
		}
	}, [ideas, activeKpi, startOfMonthMs, startOfYearMs]);

	const activeLabel = activeKpi ? KPI_DEFS.find((k) => k.key === activeKpi)?.label : null;

	return (
		<main className="min-w-0 p-6">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-2xl font-bold">All Ideas</h1>
				{ideas.length > 0 && (
					<Button variant="outline" size="sm" onClick={() => exportIdeasCsv(ideas)}>
						<Download className="mr-2 size-3.5" />
						Export CSV
					</Button>
				)}
			</div>

			{/* Clickable KPI row */}
			<div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{KPI_DEFS.map((kpi) => {
					const count = kpi.key ? kpiCounts[kpi.key] : 0;
					const isActive = activeKpi === kpi.key;
					const isDestructive = kpi.variant === "destructive" && count > 0;

					return (
						<button
							key={kpi.key}
							type="button"
							onClick={() => setActiveKpi(isActive ? null : kpi.key)}
							className="text-left"
						>
							<Card
								className={cn(
									"h-full transition-all",
									isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background",
									!isActive && "hover:border-primary/30 hover:bg-muted/30",
								)}
							>
								<CardContent className="flex items-center gap-3 p-4">
									<div
										className={cn(
											"rounded-full p-2",
											isDestructive ? "bg-red-100 dark:bg-red-900/30" : "bg-muted",
										)}
									>
										<kpi.icon
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
											{count}
										</p>
										<p className="text-xs text-muted-foreground">{kpi.label}</p>
									</div>
								</CardContent>
							</Card>
						</button>
					);
				})}
			</div>

			{/* Active filter chip */}
			{activeLabel && (
				<div className="mb-4 flex items-center gap-2">
					<span className="text-sm text-muted-foreground">Showing:</span>
					<button
						type="button"
						onClick={() => setActiveKpi(null)}
						className="inline-flex items-center gap-1 rounded-full border bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
					>
						{activeLabel}
						<X className="size-3" />
					</button>
					<span className="text-xs text-muted-foreground">
						{filteredIdeas.length} {filteredIdeas.length === 1 ? "idea" : "ideas"}
					</span>
				</div>
			)}

			{/* Ideas table */}
			<Card>
				<CardContent className="p-0 pt-2">
					<DataTable
						columns={adminIdeaColumns}
						data={filteredIdeas}
						searchPlaceholder="Search ideas..."
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
							{
								columnId: "categoryName",
								label: "Category",
								options: [...new Set(filteredIdeas.map((i: AdminIdea) => i.categoryName))]
									.sort()
									.map((c) => ({ value: c, label: c })),
							},
						]}
						onRowClick={(idea: AdminIdea) =>
							navigate({
								to: "/ideas/$submissionId",
								params: { submissionId: idea.submissionId },
							})
						}
						rowClassName={(idea: AdminIdea) =>
							cn(idea.slaStatus === "overdue" && "bg-destructive/5")
						}
					/>
				</CardContent>
			</Card>
		</main>
	);
}
