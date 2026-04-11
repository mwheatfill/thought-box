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
	pendingComponent: DashboardSkeleton,
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

				{data.role === "admin" && (
					<div className="space-y-6">
						{/* KPIs render immediately */}
						<AdminDashboard stats={data.stats} />

						{/* Charts stream in */}
						<Suspense fallback={<ChartsSkeleton />}>
							<Await promise={data.chartsDeferred}>
								{(result: unknown) => {
									const r = result as [unknown, unknown, unknown, unknown];
									return (
										<AdminDashboard
											stats={data.stats}
											byCategory={r[0] as undefined}
											byMonth={r[1] as undefined}
											outcomeDistribution={r[2] as undefined}
											recentActivity={r[3] as undefined}
											hideKpi
										/>
									);
								}}
							</Await>
						</Suspense>

						<div className="grid gap-4 sm:grid-cols-3">
							<LinkCard
								to="/admin/ideas"
								title="All Ideas"
								description="Search and export every idea."
							/>
							<LinkCard
								to="/queue"
								title="My Queue"
								description="Ideas assigned to you for review."
							/>
							<LinkCard to="/my-ideas" title="My Ideas" description="Track your own submissions." />
						</div>
					</div>
				)}

				{data.role === "leader" && (
					<div className="space-y-6">
						<LeaderDashboard ideas={data.ideas} stats={data.stats} />
						<LinkCard
							to="/queue"
							title="Full Queue"
							description="Open your full queue with bulk actions and advanced filters."
						/>
					</div>
				)}
			</main>
		</PageTransition>
	);
}

function LinkCard({ to, title, description }: { to: string; title: string; description: string }) {
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

function ChartsSkeleton() {
	return (
		<div className="grid gap-6 lg:grid-cols-2">
			{[0, 1, 2, 3].map((i) => (
				<Card key={i}>
					<CardHeader className="pb-3">
						<Skeleton className="h-4 w-32" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-[250px] w-full" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function DashboardSkeleton() {
	return (
		<main className="min-w-0 flex-1 bg-background p-6">
			<div className="mb-6">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="mt-1 h-4 w-64" />
			</div>
			<div className="space-y-6">
				<div className="grid gap-6 sm:grid-cols-3">
					{[0, 1, 2].map((i) => (
						<Card key={i}>
							<CardContent className="flex items-center gap-3 p-4">
								<Skeleton className="size-9 rounded-full" />
								<div className="space-y-1.5">
									<Skeleton className="h-6 w-12" />
									<Skeleton className="h-3 w-20" />
								</div>
							</CardContent>
						</Card>
					))}
				</div>
				<ChartsSkeleton />
			</div>
		</main>
	);
}
