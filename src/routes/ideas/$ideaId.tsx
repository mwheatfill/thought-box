import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/ideas/$ideaId")({
	component: IdeaDetailPage,
});

function IdeaDetailPage() {
	const { ideaId } = Route.useParams();

	return (
		<main className="flex-1 p-6">
			<div className="mb-8">
				<h1 className="text-2xl font-bold tracking-tight">Idea Detail</h1>
				<p className="text-muted-foreground">Viewing idea {ideaId}</p>
			</div>

			<div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
				<div className="mb-4 rounded-full bg-muted p-4">
					<FileText className="size-8 text-muted-foreground" />
				</div>
				<h2 className="mb-2 text-lg font-semibold">Idea detail view coming soon</h2>
				<p className="max-w-sm text-sm text-muted-foreground">
					This page will show the full idea with activity timeline, status updates, and the
					leader-submitter conversation thread.
				</p>
			</div>
		</main>
	);
}
