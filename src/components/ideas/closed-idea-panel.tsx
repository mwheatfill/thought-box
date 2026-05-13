import { CheckCircle2, Lock, MoveRight, XCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Card, CardContent } from "#/components/ui/card";
import { UserCardPopover } from "#/components/ui/user-card";
import { cn } from "#/lib/utils";
import { businessDaysBetween } from "#/server/lib/sla";

type ClosedStatus = "accepted" | "declined" | "redirected";

interface ClosedIdeaPanelProps {
	status: ClosedStatus;
	rejectionReason: string | null;
	closedAt: string | null;
	submittedAt: string;
	assignedLeader: { id: string; displayName: string; photoUrl: string | null } | null;
	className?: string;
}

const OUTCOME_CONFIG: Record<
	ClosedStatus,
	{
		label: string;
		blurb: string;
		icon: typeof CheckCircle2;
		ringClass: string;
		iconClass: string;
	}
> = {
	accepted: {
		label: "Accepted",
		blurb: "This idea is moving forward.",
		icon: CheckCircle2,
		ringClass: "bg-emerald-50 ring-emerald-100 dark:bg-emerald-500/10 dark:ring-emerald-500/20",
		iconClass: "text-emerald-600 dark:text-emerald-400",
	},
	declined: {
		label: "Declined",
		blurb: "This idea won't be pursued.",
		icon: XCircle,
		ringClass: "bg-rose-50 ring-rose-100 dark:bg-rose-500/10 dark:ring-rose-500/20",
		iconClass: "text-rose-600 dark:text-rose-400",
	},
	redirected: {
		label: "Redirected",
		blurb: "This idea was sent to another team.",
		icon: MoveRight,
		ringClass: "bg-amber-50 ring-amber-100 dark:bg-amber-500/10 dark:ring-amber-500/20",
		iconClass: "text-amber-600 dark:text-amber-400",
	},
};

const REJECTION_REASON_LABELS: Record<string, string> = {
	already_in_progress: "Already in progress",
	not_feasible: "Not feasible at this time",
	not_aligned: "Not aligned with priorities",
	not_thoughtbox: "Not a ThoughtBox idea",
};

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

function initials(name: string): string {
	return name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.slice(0, 2);
}

export function ClosedIdeaPanel({
	status,
	rejectionReason,
	closedAt,
	submittedAt,
	assignedLeader,
	className,
}: ClosedIdeaPanelProps) {
	const config = OUTCOME_CONFIG[status];
	const Icon = config.icon;

	const resolutionDays =
		closedAt !== null ? businessDaysBetween(new Date(submittedAt), new Date(closedAt)) : null;

	return (
		<Card className={className}>
			<CardContent className="space-y-5 p-5">
				<div className="flex items-center gap-4">
					<div
						className={cn(
							"flex size-12 shrink-0 items-center justify-center rounded-full ring-4",
							config.ringClass,
						)}
					>
						<Icon className={cn("size-6", config.iconClass)} />
					</div>
					<div className="min-w-0">
						<p className="text-xs uppercase tracking-wide text-muted-foreground">Outcome</p>
						<p className="text-lg font-semibold leading-tight">{config.label}</p>
						<p className="text-xs text-muted-foreground">{config.blurb}</p>
					</div>
				</div>

				<dl className="space-y-3 border-t pt-4">
					{rejectionReason && (
						<div className="flex items-baseline justify-between gap-3">
							<dt className="text-xs text-muted-foreground">Reason</dt>
							<dd className="text-sm font-medium text-right">
								{REJECTION_REASON_LABELS[rejectionReason] ?? rejectionReason}
							</dd>
						</div>
					)}

					{assignedLeader && (
						<div className="flex items-center justify-between gap-3">
							<dt className="text-xs text-muted-foreground">Reviewer</dt>
							<dd>
								<UserCardPopover userId={assignedLeader.id}>
									<button
										type="button"
										className="flex items-center gap-2 rounded-md transition-colors hover:text-primary"
									>
										<Avatar className="size-6">
											{assignedLeader.photoUrl && (
												<AvatarImage
													src={assignedLeader.photoUrl}
													alt={assignedLeader.displayName}
												/>
											)}
											<AvatarFallback className="text-[10px]">
												{initials(assignedLeader.displayName)}
											</AvatarFallback>
										</Avatar>
										<span className="text-sm font-medium hover:underline">
											{assignedLeader.displayName}
										</span>
									</button>
								</UserCardPopover>
							</dd>
						</div>
					)}

					{closedAt && (
						<div className="flex items-baseline justify-between gap-3">
							<dt className="text-xs text-muted-foreground">Closed</dt>
							<dd className="text-sm font-medium">{formatDate(closedAt)}</dd>
						</div>
					)}

					{resolutionDays !== null && resolutionDays > 0 && (
						<div className="flex items-baseline justify-between gap-3">
							<dt className="text-xs text-muted-foreground">Resolution time</dt>
							<dd className="text-sm font-medium">
								{resolutionDays} business day{resolutionDays === 1 ? "" : "s"}
							</dd>
						</div>
					)}
				</dl>

				<div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
					<Lock className="size-3.5" />
					<span>Closed and locked from further edits.</span>
				</div>
			</CardContent>
		</Card>
	);
}
