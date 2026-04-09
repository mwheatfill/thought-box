import { createFileRoute, redirect } from "@tanstack/react-router";
import { Settings } from "lucide-react";

export const Route = createFileRoute("/admin/settings")({
	beforeLoad: ({ context }) => {
		if (context.user.role !== "admin") {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: SettingsPage,
});

function SettingsPage() {
	return (
		<main className="flex-1 p-6">
			<div className="mb-8">
				<h1 className="text-2xl font-bold tracking-tight">Settings</h1>
				<p className="text-muted-foreground">
					Configure application settings, AI behavior, and email preferences.
				</p>
			</div>

			<div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
				<div className="mb-4 rounded-full bg-muted p-4">
					<Settings className="size-8 text-muted-foreground" />
				</div>
				<h2 className="mb-2 text-lg font-semibold">Settings coming soon</h2>
				<p className="max-w-sm text-sm text-muted-foreground">
					Manage the AI system prompt, suggested prompts, SLA thresholds, social proof settings, and
					email configuration.
				</p>
			</div>
		</main>
	);
}
