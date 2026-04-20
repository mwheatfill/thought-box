import type { IdeaStatus } from "#/lib/constants";
import { cn } from "#/lib/utils";

const PIPELINE_STEPS: { status: IdeaStatus; label: string }[] = [
	{ status: "new", label: "New" },
	{ status: "under_review", label: "Review" },
	{ status: "accepted", label: "Accepted" },
];

const STEP_COLORS: Record<string, string> = {
	new: "bg-blue-500",
	under_review: "bg-yellow-500",
	accepted: "bg-green-500",
};

const TERMINAL_STATUSES = new Set<string>(["declined", "redirected"]);

export function StatusPipeline({ status }: { status: IdeaStatus }) {
	if (TERMINAL_STATUSES.has(status)) {
		const label = status === "declined" ? "Declined" : "Redirected";
		return <span className="text-xs font-medium text-muted-foreground">{label}</span>;
	}

	const currentIdx = PIPELINE_STEPS.findIndex((s) => s.status === status);

	return (
		<div className="flex items-center gap-1" title={PIPELINE_STEPS[currentIdx]?.label ?? status}>
			{PIPELINE_STEPS.map((step, i) => (
				<div
					key={step.status}
					className={cn(
						"h-1.5 flex-1 rounded-full transition-colors",
						i < currentIdx
							? "bg-muted-foreground/30"
							: i === currentIdx
								? STEP_COLORS[step.status]
								: "bg-muted",
					)}
				/>
			))}
		</div>
	);
}
