import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LeaderDashboard } from "#/components/dashboard/leader-dashboard";
import { getAssignedIdeas, getLeaderStats } from "#/server/functions/dashboard";
import { bulkUpdateStatus } from "#/server/functions/ideas";

export const Route = createFileRoute("/queue")({
	beforeLoad: ({ context }) => {
		if (context.user.role !== "leader" && context.user.role !== "admin") {
			throw new Error("Forbidden");
		}
	},
	loader: async () => {
		const [ideas, stats] = await Promise.all([getAssignedIdeas(), getLeaderStats()]);
		return { ideas, stats };
	},
	component: QueuePage,
});

function QueuePage() {
	const { ideas, stats } = Route.useLoaderData();
	const queryClient = useQueryClient();

	const bulkUpdate = useServerFn(bulkUpdateStatus);
	const bulkMutation = useMutation({
		mutationFn: ({ ideaIds, status }: { ideaIds: string[]; status: string }) =>
			bulkUpdate({ data: { ideaIds, status: status as "under_review" } }),
		onSuccess: () => {
			queryClient.invalidateQueries();
		},
	});

	return (
		<main className="mx-auto max-w-7xl p-6">
			<h1 className="mb-6 text-2xl font-bold">My Queue</h1>
			<LeaderDashboard
				ideas={ideas}
				stats={stats}
				onBulkUpdate={async (ideaIds, status) => {
					await bulkMutation.mutateAsync({ ideaIds, status });
				}}
				isBulkUpdating={bulkMutation.isPending}
			/>
		</main>
	);
}
