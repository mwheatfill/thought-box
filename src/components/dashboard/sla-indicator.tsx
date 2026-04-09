import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";

type SlaStatus = "on_track" | "approaching" | "overdue" | "none";

interface SlaIndicatorProps {
	slaStatus: SlaStatus;
	slaDaysRemaining: number | null;
	slaDueDate: string | null;
}

export function SlaIndicator({ slaStatus, slaDaysRemaining, slaDueDate }: SlaIndicatorProps) {
	if (slaStatus === "none") return null;

	const dotColor = {
		on_track: "bg-green-500",
		approaching: "bg-yellow-500",
		overdue: "bg-red-500",
	}[slaStatus];

	const label =
		slaStatus === "overdue"
			? `${Math.abs(slaDaysRemaining ?? 0)} days overdue`
			: slaStatus === "approaching"
				? `${slaDaysRemaining} day${slaDaysRemaining === 1 ? "" : "s"} remaining`
				: `${slaDaysRemaining} days remaining`;

	const dueFormatted = slaDueDate
		? new Date(slaDueDate).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			})
		: "";

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="inline-flex items-center gap-1.5">
					<span className={cn("size-2 rounded-full", dotColor)} />
					<span className="text-xs text-muted-foreground">{label}</span>
				</span>
			</TooltipTrigger>
			<TooltipContent>Due {dueFormatted}</TooltipContent>
		</Tooltip>
	);
}
