import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download } from "lucide-react";
import {
	type AdminIdea,
	adminIdeaColumns,
	exportIdeasCsv,
} from "#/components/dashboard/admin-dashboard";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { DataTable } from "#/components/ui/data-table";
import { STATUS_LABELS } from "#/lib/constants";
import { cn } from "#/lib/utils";
import { getAllIdeas } from "#/server/functions/dashboard";

export const Route = createFileRoute("/admin/ideas")({
	beforeLoad: ({ context }) => {
		if (context.user.role !== "admin") {
			throw new Error("Forbidden");
		}
	},
	loader: () => getAllIdeas(),
	component: AdminIdeasPage,
});

function AdminIdeasPage() {
	const ideas = Route.useLoaderData();
	const navigate = useNavigate();

	return (
		<main className="mx-auto max-w-7xl p-6">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-2xl font-bold">All Ideas</h1>
				{ideas && ideas.length > 0 && (
					<Button variant="outline" size="sm" onClick={() => exportIdeasCsv(ideas)}>
						<Download className="mr-2 size-3.5" />
						Export CSV
					</Button>
				)}
			</div>

			<Card>
				<CardContent className="p-0 pt-2">
					<DataTable
						columns={adminIdeaColumns}
						data={ideas ?? []}
						searchPlaceholder="Search all ideas..."
						searchColumn="title"
						facetedFilters={[
							{
								columnId: "status",
								label: "Status",
								options: Object.entries(STATUS_LABELS).map(([value, label]) => ({
									value,
									label,
								})),
							},
							{
								columnId: "categoryName",
								label: "Category",
								options: [...new Set((ideas ?? []).map((i: AdminIdea) => i.categoryName))]
									.sort()
									.map((c) => ({ value: c, label: c })),
							},
						]}
						onRowClick={(idea: AdminIdea) =>
							navigate({
								to: "/ideas/$submissionId",
								params: { submissionId: idea.submissionId },
							})
						}
						rowClassName={(idea: AdminIdea) =>
							cn(idea.slaStatus === "overdue" && "bg-destructive/5")
						}
					/>
				</CardContent>
			</Card>
		</main>
	);
}
