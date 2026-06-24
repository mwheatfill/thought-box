import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { OwnerDashboard } from "#/components/dashboard/owner-dashboard";
import { getCategoryIdeas, getCategoryStats } from "#/server/functions/dashboard";

const searchSchema = z.object({
	filter: z.enum(["open", "overdue", "closed"]).optional(),
	category: z.string().optional(),
});

export const Route = createFileRoute("/ideas/")({
	validateSearch: searchSchema,
	beforeLoad: ({ context }) => {
		// All Ideas is the category-scoped overview for owners/contributors.
		// Submitters have no category scope → their own ideas instead.
		if (context.user.role === "submitter") {
			throw redirect({ to: "/my-ideas" });
		}
	},
	loader: async () => {
		const [ideas, stats] = await Promise.all([getCategoryIdeas(), getCategoryStats()]);
		return { ideas, stats };
	},
	component: AllIdeasPage,
});

function AllIdeasPage() {
	const { ideas, stats } = Route.useLoaderData();
	const search = Route.useSearch();

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
				stats={stats}
				enableKpiFilter
				initialKpiFilter={search.filter ?? null}
				initialColumnFilters={
					search.category ? [{ id: "categoryName", value: search.category }] : undefined
				}
			/>
		</main>
	);
}
