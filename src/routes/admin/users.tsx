import { createFileRoute, redirect } from "@tanstack/react-router";
import { Users } from "lucide-react";

export const Route = createFileRoute("/admin/users")({
	beforeLoad: ({ context }) => {
		if (context.user.role !== "admin") {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: UsersPage,
});

function UsersPage() {
	return (
		<main className="flex-1 p-6">
			<div className="mb-8">
				<h1 className="text-2xl font-bold tracking-tight">Users</h1>
				<p className="text-muted-foreground">Manage user roles and view directory information.</p>
			</div>

			<div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
				<div className="mb-4 rounded-full bg-muted p-4">
					<Users className="size-8 text-muted-foreground" />
				</div>
				<h2 className="mb-2 text-lg font-semibold">User management coming soon</h2>
				<p className="max-w-sm text-sm text-muted-foreground">
					Search the directory, promote users to leader or admin roles, and view enriched profile
					information.
				</p>
			</div>
		</main>
	);
}
