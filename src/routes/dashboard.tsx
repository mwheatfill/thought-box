import { useMutation } from "@tanstack/react-query";
import { Await, createFileRoute, defer, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Inbox, Lightbulb } from "lucide-react";
import { Suspense } from "react";
import { toast } from "sonner";
import { AdminDashboard } from "#/components/dashboard/admin-dashboard";
import { LeaderDashboard } from "#/components/dashboard/leader-dashboard";
import { SubmitterDashboard } from "#/components/dashboard/submitter-dashboard";
import { PageTransition } from "#/components/ui/animated";
import { Card, CardContent, CardHeader } from "#/components/ui/card";
import { RouteError } from "#/components/ui/route-error";
import { Skeleton } from "#/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
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
	errorComponent: ({ error }) => <RouteError error={error} />,
	loader: async ({ context }) => {
		const { user } = context;

		// Always load submitter data (every role can see their own ideas)
		const submitterData = Promise.all([getMyIdeas(), getUserSubmissionCount({ data: user.id })]);

		if (user.role === "admin") {
			const stats = await getDashboardStats();
			return {
				role: "admin" as const,
				stats,
				adminDeferred: defer(
					Promise.all([
						getAllIdeas(),
						getSubmissionsByCategory(),
						getSubmissionsByMonth(),
						getOutcomeDistribution(),
						getRecentProgramActivity(),
					]),
				),
				leaderDeferred: defer(Promise.all([getAssignedIdeas(), getLeaderStats()])),
				submitterDeferred: defer(submitterData),
			};
		}

		if (user.role === "leader") {
			const [leaderIdeas, leaderStats] = await Promise.all([getAssignedIdeas(), getLeaderStats()]);
			return {
				role: "leader" as const,
				leaderIdeas,
				leaderStats,
				submitterDeferred: defer(submitterData),
			};
		}

		// Submitter
		const [ideas, yearlyCount] = await submitterData;
		return { role: "submitter" as const, ideas, yearlyCount };
	},
	component: DashboardPage,
});

const TAB_CONFIG = {
	admin: [
		{ value: "program", label: "Program", icon: BarChart3 },
		{ value: "queue", label: "My Queue", icon: Inbox },
		{ value: "ideas", label: "My Ideas", icon: Lightbulb },
	],
	leader: [
		{ value: "queue", label: "My Queue", icon: Inbox },
		{ value: "ideas", label: "My Ideas", icon: Lightbulb },
	],
	submitter: [{ value: "ideas", label: "My Ideas", icon: Lightbulb }],
} as const;

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

	const tabs = TAB_CONFIG[data.role];
	const defaultTab = tabs[0].value;

	return (
		<PageTransition>
			<main className="min-w-0 flex-1 bg-background p-6">
				<div className="mb-6">
					<h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
					<p className="text-muted-foreground">
						{data.role === "admin"
							? "Program overview and all ideas across the organization."
							: data.role === "leader"
								? "Your assigned ideas and response metrics."
								: "Track the status of your submitted ideas."}
					</p>
				</div>

				{tabs.length > 1 ? (
					<Tabs defaultValue={defaultTab}>
						<TabsList className="mb-6">
							{tabs.map((tab) => (
								<TabsTrigger key={tab.value} value={tab.value} className="gap-2">
									<tab.icon className="size-4" />
									{tab.label}
								</TabsTrigger>
							))}
						</TabsList>

						{data.role === "admin" && (
							<>
								<TabsContent value="program">
									<div className="space-y-6">
										<AdminDashboard stats={data.stats} />
										<Suspense fallback={<DashboardSkeleton />}>
											<Await promise={data.adminDeferred}>
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
									</div>
								</TabsContent>
								<TabsContent value="queue">
									<Suspense fallback={<DashboardSkeleton />}>
										<Await promise={data.leaderDeferred}>
											{([ideas, stats]) => (
												<LeaderDashboard
													ideas={ideas}
													stats={stats}
													onBulkUpdate={async (ideaIds, status) => {
														await bulkMutation.mutateAsync({ ideaIds, status });
													}}
													isBulkUpdating={bulkMutation.isPending}
												/>
											)}
										</Await>
									</Suspense>
								</TabsContent>
								<TabsContent value="ideas">
									<Suspense fallback={<DashboardSkeleton />}>
										<Await promise={data.submitterDeferred}>
											{([ideas, yearlyCount]) => (
												<SubmitterDashboard user={user} ideas={ideas} yearlyCount={yearlyCount} />
											)}
										</Await>
									</Suspense>
								</TabsContent>
							</>
						)}

						{data.role === "leader" && (
							<>
								<TabsContent value="queue">
									<LeaderDashboard
										ideas={data.leaderIdeas}
										stats={data.leaderStats}
										onBulkUpdate={async (ideaIds, status) => {
											await bulkMutation.mutateAsync({ ideaIds, status });
										}}
										isBulkUpdating={bulkMutation.isPending}
									/>
								</TabsContent>
								<TabsContent value="ideas">
									<Suspense fallback={<DashboardSkeleton />}>
										<Await promise={data.submitterDeferred}>
											{([ideas, yearlyCount]) => (
												<SubmitterDashboard user={user} ideas={ideas} yearlyCount={yearlyCount} />
											)}
										</Await>
									</Suspense>
								</TabsContent>
							</>
						)}
					</Tabs>
				) : (
					// Submitter: no tabs needed, just show the dashboard directly
					<SubmitterDashboard user={user} ideas={data.ideas} yearlyCount={data.yearlyCount} />
				)}
			</main>
		</PageTransition>
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
