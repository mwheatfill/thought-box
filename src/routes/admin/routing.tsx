import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/routing")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/categories" });
	},
});
