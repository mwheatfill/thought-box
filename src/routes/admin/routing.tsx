import { createFileRoute, redirect } from "@tanstack/react-router";
import { Waypoints } from "lucide-react";

export const Route = createFileRoute("/admin/routing")({
	beforeLoad: ({ context }) => {
		if (context.user.role !== "admin") {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: RoutingPage,
});

function RoutingPage() {
	return (
		<main className="flex-1 p-6">
			<div className="mb-8">
				<h1 className="text-2xl font-bold tracking-tight">Routing</h1>
				<p className="text-muted-foreground">
					Configure which leaders receive ideas for each category.
				</p>
			</div>

			<div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
				<div className="mb-4 rounded-full bg-muted p-4">
					<Waypoints className="size-8 text-muted-foreground" />
				</div>
				<h2 className="mb-2 text-lg font-semibold">Routing configuration coming soon</h2>
				<p className="max-w-sm text-sm text-muted-foreground">
					Assign default leaders to categories so new ideas are automatically routed to the right
					reviewer.
				</p>
			</div>
		</main>
	);
}
