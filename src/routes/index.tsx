import { createFileRoute } from "@tanstack/react-router";
import { Lightbulb } from "lucide-react";
import { ChatInterface } from "#/components/chat/chat-interface";
import { getLandingData } from "#/server/functions/landing";

export const Route = createFileRoute("/")({
	loader: () => getLandingData(),
	component: LandingPage,
});

function LandingPage() {
	const { user } = Route.useRouteContext();
	const { yearlyCount, monthlyCount, suggestedPrompts, showSocialProof } = Route.useLoaderData();

	return (
		<main className="flex flex-1 flex-col">
			{/* Hero section */}
			<div className="flex flex-col items-center px-4 pt-8 pb-4 text-center">
				<div className="mb-4 rounded-full bg-primary/10 p-3">
					<Lightbulb className="size-8 text-primary" />
				</div>

				{yearlyCount > 0 && (
					<p className="mb-2 text-3xl font-bold tracking-tight">
						{yearlyCount} {yearlyCount === 1 ? "idea" : "ideas"} shared in{" "}
						{new Date().getFullYear()}
					</p>
				)}

				<p className="max-w-md text-sm text-muted-foreground">
					Share an idea to make things better for our team and our members.
				</p>

				{showSocialProof && monthlyCount > 0 && (
					<p className="mt-2 text-xs text-muted-foreground">
						{monthlyCount} {monthlyCount === 1 ? "idea" : "ideas"} shared this month
					</p>
				)}
			</div>

			{/* Chat section */}
			<div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden rounded-t-xl border border-b-0 bg-card shadow-sm">
				<ChatInterface user={user} suggestedPrompts={suggestedPrompts} />
			</div>
		</main>
	);
}
