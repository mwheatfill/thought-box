import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { OwnerDashboard } from "#/components/dashboard/owner-dashboard";
import { getAssignedIdeas, getOwnerStats } from "#/server/functions/dashboard";
import { bulkUpdateStatus } from "#/server/functions/ideas";

export const Route = createFileRoute("/queue")({
	beforeLoad: ({ context }) => {
		if (context.user.role !== "owner" && context.user.role !== "admin") {
			throw new Error("Forbidden");
		}
	},
	loader: async () => {
		const [ideas, stats] = await Promise.all([getAssignedIdeas(), getOwnerStats()]);
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
		<main className="min-w-0 p-6">
			<h1 className="mb-6 text-2xl font-bold">My Queue</h1>
			<OwnerDashboard
				ideas={ideas}
				stats={stats}
				onBulkUpdate={async (ideaIds, status) => {
					await bulkMutation.mutateAsync({ ideaIds, status });
				}}
				isBulkUpdating={bulkMutation.isPending}
				enableKpiFilter
			/>
		</main>
	);
}
