import { useMutation } from "@tanstack/react-query";
import { Await, createFileRoute, defer, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Suspense } from "react";
import { toast } from "sonner";
import { AdminDashboard } from "#/components/dashboard/admin-dashboard";
import { LeaderDashboard } from "#/components/dashboard/leader-dashboard";
import { SubmitterDashboard } from "#/components/dashboard/submitter-dashboard";
import { PageTransition } from "#/components/ui/animated";
import { Card, CardContent, CardHeader } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { getUserSubmissionCount } from "#/server/functions/ai";
import {
	getAllIdeas,
	getAssignedIdeas,
	getDashboardStats,
	getLeaderStats,
	getMyIdeas,
	getOutcomeDistribution,
	getRecentProgramActivity,
	getSubmissionsByCategory,
	getSubmissionsByMonth,
} from "#/server/functions/dashboard";
import { bulkUpdateStatus } from "#/server/functions/ideas";

export const Route = createFileRoute("/dashboard")({
	loader: async ({ context }) => {
		const { user } = context;

		if (user.role === "admin") {
			// Block on stats (KPI cards, above the fold), stream in everything else
			const stats = await getDashboardStats();
			return {
				role: "admin" as const,
				stats,
				deferred: defer(
					Promise.all([
						getAllIdeas(),
						getSubmissionsByCategory(),
						getSubmissionsByMonth(),
						getOutcomeDistribution(),
						getRecentProgramActivity(),
					]),
				),
			};
		}

		if (user.role === "leader") {
			const stats = await getLeaderStats();
			return {
				role: "leader" as const,
				stats,
				deferred: defer(getAssignedIdeas()),
			};
		}

		// Submitter
		const [ideas, yearlyCount] = await Promise.all([
			getMyIdeas(),
			getUserSubmissionCount({ data: user.id }),
		]);
		return { role: "submitter" as const, ideas, yearlyCount };
	},
	component: DashboardPage,
});

function DashboardPage() {
	const { user } = Route.useRouteContext();
	const data = Route.useLoaderData();
	const router = useRouter();

	const bulkFn = useServerFn(bulkUpdateStatus);
	const bulkMutation = useMutation({
		mutationFn: ({ ideaIds, status }: { ideaIds: string[]; status: string }) =>
			bulkFn({ data: { ideaIds, status: status as "under_review" } }),
		onSuccess: (result) => {
			toast.success(`Updated ${result.count} idea${result.count === 1 ? "" : "s"}`);
			router.invalidate();
		},
		onError: () => toast.error("Failed to update"),
	});

	return (
		<PageTransition>
			<main className="min-w-0 flex-1 bg-background p-6">
				<div className="mb-6">
					<h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
					<p className="text-muted-foreground">
						{user.role === "admin"
							? "Program overview and all ideas across the organization."
							: user.role === "leader"
								? "Your assigned ideas and response metrics."
								: "Track the status of your submitted ideas."}
					</p>
				</div>

				{data.role === "admin" && (
					<>
						<AdminDashboard stats={data.stats} />
						<Suspense fallback={<DashboardSkeleton />}>
							<Await promise={data.deferred}>
								{([ideas, byCategory, byMonth, outcomeDistribution, recentActivity]) => (
									<AdminDashboard
										stats={data.stats}
										ideas={ideas}
										byCategory={byCategory}
										byMonth={byMonth}
										outcomeDistribution={outcomeDistribution}
										recentActivity={recentActivity}
										hideKpi
									/>
								)}
							</Await>
						</Suspense>
					</>
				)}

				{data.role === "leader" && (
					<Suspense fallback={<DashboardSkeleton />}>
						<Await promise={data.deferred}>
							{(ideas) => (
								<LeaderDashboard
									ideas={ideas}
									stats={data.stats}
									onBulkUpdate={async (ideaIds, status) => {
										await bulkMutation.mutateAsync({ ideaIds, status });
									}}
									isBulkUpdating={bulkMutation.isPending}
								/>
							)}
						</Await>
					</Suspense>
				)}

				{data.role === "submitter" && (
					<SubmitterDashboard user={user} ideas={data.ideas} yearlyCount={data.yearlyCount} />
				)}
			</main>
		</PageTransition>
	);
}

function DashboardSkeleton() {
	return (
		<div className="min-w-0 space-y-6">
			{/* Charts row — matches the 2-col grid */}
			<div className="grid gap-4 lg:grid-cols-2">
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
			{/* Second charts row */}
			<div className="grid gap-4 lg:grid-cols-2">
				{[0, 1].map((i) => (
					<Card key={i}>
						<CardHeader className="pb-3">
							<Skeleton className="h-4 w-28" />
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{[0, 1, 2, 3].map((j) => (
									<Skeleton key={j} className="h-6 w-full" />
								))}
							</div>
						</CardContent>
					</Card>
				))}
			</div>
			{/* Ideas table */}
			<Card>
				<CardHeader className="pb-3">
					<Skeleton className="h-5 w-20" />
				</CardHeader>
				<CardContent className="space-y-2">
					<Skeleton className="h-8 w-full" />
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-12 w-full" />
					))}
				</CardContent>
			</Card>
		</div>
	);
}
