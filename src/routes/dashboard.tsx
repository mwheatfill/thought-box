import { Await, Link, createFileRoute, defer, redirect } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Suspense } from "react";
import { AdminDashboard } from "#/components/dashboard/admin-dashboard";
import { LeaderDashboard } from "#/components/dashboard/leader-dashboard";
import { PageTransition } from "#/components/ui/animated";
import { Card, CardContent, CardHeader } from "#/components/ui/card";
import { RouteError } from "#/components/ui/route-error";
import { Skeleton } from "#/components/ui/skeleton";
import {
	getAssignedIdeas,
	getDashboardStats,
	getLeaderStats,
	getOutcomeDistribution,
	getRecentProgramActivity,
	getSubmissionsByCategory,
	getSubmissionsByMonth,
} from "#/server/functions/dashboard";

export const Route = createFileRoute("/dashboard")({
	errorComponent: ({ error }) => <RouteError error={error} />,
	beforeLoad: ({ context }) => {
		if (context.user.role === "submitter") {
			throw redirect({ to: "/my-ideas" });
		}
	},
	loader: async ({ context }) => {
		const { user } = context;

		if (user.role === "admin") {
			const stats = await getDashboardStats();
			return {
				role: "admin" as const,
				stats,
				chartsDeferred: defer(
					Promise.all([
						getSubmissionsByCategory(),
						getSubmissionsByMonth(),
						getOutcomeDistribution(),
						getRecentProgramActivity(),
					]),
				),
			};
		}

		// Leader
		const [ideas, stats] = await Promise.all([getAssignedIdeas(), getLeaderStats()]);
		return { role: "leader" as const, ideas, stats };
	},
	component: DashboardPage,
});

function DashboardPage() {
	const data = Route.useLoaderData();

	return (
		<PageTransition>
			<main className="min-w-0 flex-1 bg-background p-6">
				<div className="mb-6">
					<h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
					<p className="text-muted-foreground">
						{data.role === "admin"
							? "Program overview across the organization."
							: "Your assigned ideas and response metrics."}
					</p>
				</div>

				{data.role === "admin" && <AdminSummary data={data} />}
				{data.role === "leader" && <LeaderSummary data={data} />}
			</main>
		</PageTransition>
	);
}

// ── Admin Summary ─────────────────────────────────────────────────────────

function AdminSummary({
	data,
}: {
	data: {
		stats: Awaited<ReturnType<typeof getDashboardStats>>;
		chartsDeferred: ReturnType<typeof defer<ReturnType<typeof Promise.all>>>;
	};
}) {
	return (
		<div className="space-y-6">
			{/* KPIs render immediately */}
			<AdminDashboard stats={data.stats} />

			{/* Charts + activity stream in */}
			<Suspense fallback={<DashboardSkeleton />}>
				<Await promise={data.chartsDeferred}>
					{([byCategory, byMonth, outcomeDistribution, recentActivity]) => (
						<AdminDashboard
							stats={data.stats}
							byCategory={byCategory}
							byMonth={byMonth}
							outcomeDistribution={outcomeDistribution}
							recentActivity={recentActivity}
							hideKpi
						/>
					)}
				</Await>
			</Suspense>

			{/* Link card to full ideas table */}
			<LinkCard
				to="/admin/ideas"
				title="All Ideas"
				description="View, search, and export every idea across the organization."
			/>
		</div>
	);
}

// ── Leader Summary ────────────────────────────────────────────────────────

function LeaderSummary({
	data,
}: {
	data: {
		ideas: Awaited<ReturnType<typeof getAssignedIdeas>>;
		stats: Awaited<ReturnType<typeof getLeaderStats>>;
	};
}) {
	// Show only KPIs + preview (no selection, no bulk actions)
	return (
		<div className="space-y-6">
			<LeaderDashboard ideas={data.ideas} stats={data.stats} />

			<LinkCard
				to="/queue"
				title="Full Queue"
				description="Open your full queue with bulk actions and advanced filters."
			/>
		</div>
	);
}

// ── Shared ────────────────────────────────────────────────────────────────

function LinkCard({
	to,
	title,
	description,
}: {
	to: string;
	title: string;
	description: string;
}) {
	return (
		<Link to={to}>
			<Card className="group transition-colors hover:border-primary/30 hover:bg-muted/30">
				<CardContent className="flex items-center justify-between p-5">
					<div>
						<p className="font-medium">{title}</p>
						<p className="text-sm text-muted-foreground">{description}</p>
					</div>
					<ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
				</CardContent>
			</Card>
		</Link>
	);
}

function DashboardSkeleton() {
	return (
		<div className="min-w-0 space-y-6">
			<div className="grid gap-6 lg:grid-cols-2">
				{[0, 1].map((i) => (
					<Card key={i}>
						<CardHeader className="pb-3">
							<Skeleton className="h-4 w-28" />
						</CardHeader>
						<CardContent>
							<div className="space-y-3">
								{[0, 1, 2].map((j) => (
									<Skeleton key={j} className="h-8 w-full" />
								))}
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
