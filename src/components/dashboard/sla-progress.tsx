import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";

interface SlaProgressBarProps {
	label: string;
	daysRemaining: number | null;
	dueDate: string | null;
	totalDays: number;
}

export function SlaProgressBar({ label, daysRemaining, dueDate, totalDays }: SlaProgressBarProps) {
	if (daysRemaining === null) return null;

	const elapsed = totalDays - daysRemaining;
	const pct = Math.min(Math.max((elapsed / totalDays) * 100, 0), 100);
	const isOverdue = daysRemaining <= 0;
	const isApproaching = daysRemaining > 0 && daysRemaining <= 3;

	const barColor = isOverdue ? "bg-red-500" : isApproaching ? "bg-yellow-500" : "bg-green-500";

	const text = isOverdue
		? `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? "" : "s"} overdue`
		: `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`;

	const dueFormatted = dueDate
		? new Date(dueDate).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			})
		: "";

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="space-y-1.5">
					<div className="flex items-center justify-between text-xs">
						<span className="text-muted-foreground">{label}</span>
						<span
							className={cn(
								"font-medium",
								isOverdue
									? "text-red-600 dark:text-red-400"
									: isApproaching
										? "text-yellow-600 dark:text-yellow-400"
										: "text-muted-foreground",
							)}
						>
							{text}
						</span>
					</div>
					<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
						<div
							className={cn("h-full rounded-full transition-all", barColor)}
							style={{ width: `${isOverdue ? 100 : pct}%` }}
						/>
					</div>
				</div>
			</TooltipTrigger>
			<TooltipContent>Due {dueFormatted}</TooltipContent>
		</Tooltip>
	);
}

interface DualSlaProgressProps {
	reviewSlaDueDate: string | null;
	reviewSlaDaysRemaining: number | null;
	closureSlaDueDate: string | null;
	closureSlaDaysRemaining: number | null;
	reviewTotalDays?: number;
	closureTotalDays?: number;
}

export function DualSlaProgress({
	reviewSlaDueDate,
	reviewSlaDaysRemaining,
	closureSlaDueDate,
	closureSlaDaysRemaining,
	reviewTotalDays = 15,
	closureTotalDays = 30,
}: DualSlaProgressProps) {
	return (
		<div className="space-y-3">
			<SlaProgressBar
				label="Review"
				daysRemaining={reviewSlaDaysRemaining}
				dueDate={reviewSlaDueDate}
				totalDays={reviewTotalDays}
			/>
			{closureSlaDaysRemaining !== null && (
				<SlaProgressBar
					label="Closure"
					daysRemaining={closureSlaDaysRemaining}
					dueDate={closureSlaDueDate}
					totalDays={closureTotalDays}
				/>
			)}
		</div>
	);
}
