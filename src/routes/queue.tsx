import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { OwnerDashboard } from "#/components/dashboard/owner-dashboard";
import { getAssignedIdeas, getOwnerStats } from "#/server/functions/dashboard";
import { bulkUpdateStatus } from "#/server/functions/ideas";

export const Route = createFileRoute("/queue")({
	beforeLoad: ({ context }) => {
		// Owners, admins, and Contributors (assigned ideas) have a queue; submitters don't.
		if (context.user.role === "submitter") {
			throw redirect({ to: "/my-ideas" });
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
		onSuccess: ({ count }) => {
			queryClient.invalidateQueries();
			toast.success(
				count === 1 ? "1 idea moved to Under Review" : `${count} ideas moved to Under Review`,
			);
		},
		onError: () => toast.error("Couldn't update the selected ideas"),
	});

	return (
		<main className="min-w-0 p-6">
			<h1 className="mb-6 text-2xl font-bold">My Queue</h1>
			<OwnerDashboard
				ideas={ideas}
				stats={stats}
				onBulkUpdate={async (ideaIds, status) => {
					// Errors surface via the mutation's onError toast; swallow here so the
					// awaiting caller doesn't produce an unhandled rejection.
					await bulkMutation.mutateAsync({ ideaIds, status }).catch(() => {});
				}}
				isBulkUpdating={bulkMutation.isPending}
				enableKpiFilter
			/>
		</main>
	);
}
