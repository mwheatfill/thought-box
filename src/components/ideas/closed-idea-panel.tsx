import { Lock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { UserCardPopover } from "#/components/ui/user-card";
import { DECLINE_REASONS, type LockedStatus } from "#/lib/constants";
import { cn, initials } from "#/lib/utils";
import { businessDaysBetween } from "#/server/lib/sla";

interface ClosedIdeaPanelProps {
	status: LockedStatus;
	declineReason: string | null;
	closedAt: string | null;
	submittedAt: string;
	assignedOwner: { id: string; displayName: string; photoUrl: string | null } | null;
	className?: string;
}

const OUTCOME_CONFIG: Record<LockedStatus, { label: string; badgeClass: string }> = {
	accepted: {
		label: "Accepted",
		badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
	},
	declined: {
		label: "Declined",
		badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
	},
	redirected: {
		label: "Redirected",
		badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
	},
};

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

export function ClosedIdeaPanel({
	status,
	declineReason,
	closedAt,
	submittedAt,
	assignedOwner,
	className,
}: ClosedIdeaPanelProps) {
	const config = OUTCOME_CONFIG[status];

	const resolutionDays =
		closedAt !== null ? businessDaysBetween(new Date(submittedAt), new Date(closedAt)) : null;

	return (
		<Card className={className}>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-sm font-medium">Outcome</CardTitle>
					<Badge variant="outline" className={cn("border-0", config.badgeClass)}>
						{config.label}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<dl className="space-y-3">
					{declineReason && (
						<div className="flex items-baseline justify-between gap-3">
							<dt className="text-xs text-muted-foreground">Reason</dt>
							<dd className="text-sm font-medium text-right">
								{DECLINE_REASONS[declineReason as keyof typeof DECLINE_REASONS] ?? declineReason}
							</dd>
						</div>
					)}

					{assignedOwner && (
						<div className="flex items-center justify-between gap-3">
							<dt className="text-xs text-muted-foreground">Reviewer</dt>
							<dd>
								<UserCardPopover userId={assignedOwner.id}>
									<button
										type="button"
										className="flex items-center gap-2 rounded-md transition-colors hover:text-primary"
									>
										<Avatar className="size-6">
											{assignedOwner.photoUrl && (
												<AvatarImage src={assignedOwner.photoUrl} alt={assignedOwner.displayName} />
											)}
											<AvatarFallback className="text-[10px]">
												{initials(assignedOwner.displayName)}
											</AvatarFallback>
										</Avatar>
										<span className="text-sm font-medium hover:underline">
											{assignedOwner.displayName}
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
