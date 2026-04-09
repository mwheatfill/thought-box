import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminDashboard } from "#/components/dashboard/admin-dashboard";
import { LeaderDashboard } from "#/components/dashboard/leader-dashboard";
import { SubmitterDashboard } from "#/components/dashboard/submitter-dashboard";
import { PageTransition } from "#/components/ui/animated";
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
			const [stats, ideas, byCategory, byMonth, outcomeDistribution, recentActivity] =
				await Promise.all([
					getDashboardStats(),
					getAllIdeas(),
					getSubmissionsByCategory(),
					getSubmissionsByMonth(),
					getOutcomeDistribution(),
					getRecentProgramActivity(),
				]);
			return {
				role: "admin" as const,
				stats,
				ideas,
				byCategory,
				byMonth,
				outcomeDistribution,
				recentActivity,
			};
		}

		if (user.role === "leader") {
			const [ideas, stats] = await Promise.all([getAssignedIdeas(), getLeaderStats()]);
			return { role: "leader" as const, ideas, stats };
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
			<main className="flex-1 p-6">
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
					<AdminDashboard
						stats={data.stats}
						ideas={data.ideas}
						byCategory={data.byCategory}
						byMonth={data.byMonth}
						outcomeDistribution={data.outcomeDistribution}
						recentActivity={data.recentActivity}
					/>
				)}

				{data.role === "leader" && (
					<LeaderDashboard
						ideas={data.ideas}
						stats={data.stats}
						onBulkUpdate={async (ideaIds, status) => {
							await bulkMutation.mutateAsync({ ideaIds, status });
						}}
						isBulkUpdating={bulkMutation.isPending}
					/>
				)}

				{data.role === "submitter" && (
					<SubmitterDashboard user={user} ideas={data.ideas} yearlyCount={data.yearlyCount} />
				)}
			</main>
		</PageTransition>
	);
}
