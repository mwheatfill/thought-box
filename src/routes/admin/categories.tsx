import { createFileRoute, redirect } from "@tanstack/react-router";
import { Tags } from "lucide-react";

export const Route = createFileRoute("/admin/categories")({
	beforeLoad: ({ context }) => {
		if (context.user.role !== "admin") {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: CategoriesPage,
});

function CategoriesPage() {
	return (
		<main className="flex-1 p-6">
			<div className="mb-8">
				<h1 className="text-2xl font-bold tracking-tight">Categories</h1>
				<p className="text-muted-foreground">
					Manage the idea category taxonomy and routing configuration.
				</p>
			</div>

			<div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
				<div className="mb-4 rounded-full bg-muted p-4">
					<Tags className="size-8 text-muted-foreground" />
				</div>
				<h2 className="mb-2 text-lg font-semibold">Category management coming soon</h2>
				<p className="max-w-sm text-sm text-muted-foreground">
					Add, edit, and reorder categories. Configure which categories create ThoughtBox
					submissions and which redirect to external intake forms.
				</p>
			</div>
		</main>
	);
}
