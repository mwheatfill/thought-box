import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
	component: DashboardPage,
});

function DashboardPage() {
	const { user } = Route.useRouteContext();

	return (
		<main className="flex-1 p-6">
			<div className="mb-8">
				<h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
				<p className="text-muted-foreground">
					{user.role === "admin"
						? "Program overview and all ideas across the organization."
						: user.role === "leader"
							? "Your assigned ideas and response metrics."
							: "Track the status of your submitted ideas."}
				</p>
			</div>

			<div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
				<div className="mb-4 rounded-full bg-muted p-4">
					<LayoutDashboard className="size-8 text-muted-foreground" />
				</div>
				<h2 className="mb-2 text-lg font-semibold">
					{user.role === "submitter" ? "You haven't shared an idea yet" : "No ideas to show yet"}
				</h2>
				<p className="max-w-sm text-sm text-muted-foreground">
					{user.role === "submitter"
						? "It only takes a minute. Head to the Submit page and tell us what's on your mind."
						: "Ideas will appear here once they're submitted and assigned."}
				</p>
			</div>
		</main>
	);
}
