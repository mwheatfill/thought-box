import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";

type SlaStatus = "on_track" | "approaching" | "overdue" | "none";

interface SlaIndicatorProps {
	slaStatus: SlaStatus;
	slaDaysRemaining: number | null;
	slaDueDate: string | null;
	label?: string;
}

export function SlaIndicator({
	slaStatus,
	slaDaysRemaining,
	slaDueDate,
	label,
}: SlaIndicatorProps) {
	if (slaStatus === "none") return null;

	const dotColor = {
		on_track: "bg-green-500",
		approaching: "bg-yellow-500",
		overdue: "bg-red-500",
	}[slaStatus];

	const text =
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
					<span className="text-xs text-muted-foreground">
						{label ? `${label}: ` : ""}
						{text}
					</span>
				</span>
			</TooltipTrigger>
			<TooltipContent>Due {dueFormatted}</TooltipContent>
		</Tooltip>
	);
}

function getSlaStatus(daysRemaining: number | null): SlaStatus {
	if (daysRemaining === null) return "none";
	if (daysRemaining <= 0) return "overdue";
	if (daysRemaining <= 3) return "approaching";
	return "on_track";
}

interface DualSlaIndicatorProps {
	reviewSlaDueDate: string | null;
	reviewSlaDaysRemaining: number | null;
	reviewSlaStatus: SlaStatus;
	closureSlaDueDate: string | null;
	closureSlaDaysRemaining: number | null;
}

export function DualSlaIndicator({
	reviewSlaDueDate,
	reviewSlaDaysRemaining,
	reviewSlaStatus,
	closureSlaDueDate,
	closureSlaDaysRemaining,
}: DualSlaIndicatorProps) {
	const closureSlaStatus = getSlaStatus(closureSlaDaysRemaining);

	return (
		<div className="space-y-1.5">
			<SlaIndicator
				slaStatus={reviewSlaStatus}
				slaDaysRemaining={reviewSlaDaysRemaining}
				slaDueDate={reviewSlaDueDate}
				label="Review"
			/>
			{closureSlaStatus !== "none" && (
				<SlaIndicator
					slaStatus={closureSlaStatus}
					slaDaysRemaining={closureSlaDaysRemaining}
					slaDueDate={closureSlaDueDate}
					label="Closure"
				/>
			)}
		</div>
	);
}
