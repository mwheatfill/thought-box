import { createFileRoute, redirect } from "@tanstack/react-router";
import { OwnerDashboard } from "#/components/dashboard/owner-dashboard";
import { getCategoryIdeas } from "#/server/functions/dashboard";

export const Route = createFileRoute("/ideas/")({
	beforeLoad: ({ context }) => {
		// All Ideas is the category-scoped overview for owners/contributors.
		// Submitters have no category scope → their own ideas instead.
		if (context.user.role === "submitter") {
			throw redirect({ to: "/my-ideas" });
		}
	},
	loader: () => getCategoryIdeas(),
	component: AllIdeasPage,
});

function AllIdeasPage() {
	const ideas = Route.useLoaderData();

	return (
		<main className="min-w-0 p-6">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">All Ideas</h1>
				<p className="text-sm text-muted-foreground">
					Every idea in the categories you own or contribute to, and who's reviewing each one.
				</p>
			</div>
			<OwnerDashboard
				ideas={ideas}
				stats={{ openCount: 0, overdueCount: 0, totalAssigned: ideas.length }}
				showKpis={false}
				title={`All Ideas (${ideas.length})`}
			/>
		</main>
	);
}
