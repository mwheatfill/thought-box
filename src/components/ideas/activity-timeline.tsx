import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { UserCardPopover } from "#/components/ui/user-card";
import { STATUS_LABELS } from "#/lib/constants";
import { cn } from "#/lib/utils";

interface TimelineEvent {
	id: string;
	eventType: string;
	actorId: string;
	actorName: string;
	actorPhotoUrl: string | null;
	oldValue: string | null;
	newValue: string | null;
	note: string | null;
	createdAt: string;
}

interface ActivityTimelineProps {
	events: TimelineEvent[];
	limit?: number;
}

export function ActivityTimeline({ events, limit = 5 }: ActivityTimelineProps) {
	const [expanded, setExpanded] = useState(false);
	const displayEvents = expanded ? events : events.slice(0, limit);
	const hasMore = events.length > limit;

	if (events.length === 0) {
		return <p className="text-sm text-muted-foreground">No activity yet.</p>;
	}

	return (
		<div className="space-y-0">
			{displayEvents.map((event, i) => {
				const isLast = i === displayEvents.length - 1 && !hasMore;

				return (
					<div key={event.id} className="flex gap-3">
						{/* Vertical line + avatar */}
						<div className="flex flex-col items-center">
							<Avatar className="size-7 shrink-0">
								{event.actorPhotoUrl && (
									<AvatarImage src={event.actorPhotoUrl} alt={event.actorName} />
								)}
								<AvatarFallback
									className={cn(
										"text-[10px]",
										event.eventType === "message"
											? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
											: "bg-muted text-muted-foreground",
									)}
								>
									{event.actorName
										.split(" ")
										.map((n) => n[0])
										.join("")
										.slice(0, 2)}
								</AvatarFallback>
							</Avatar>
							{!isLast && <div className="w-px flex-1 bg-border" />}
						</div>

						{/* Content */}
						<div className={cn("pb-4", isLast && "pb-0")}>
							<p className="text-sm">
								<UserCardPopover userId={event.actorId}>
									<button type="button" className="font-medium hover:text-primary hover:underline">
										{event.actorName}
									</button>
								</UserCardPopover>{" "}
								{formatEventText(event)}
							</p>
							{event.eventType === "message" && event.note && (
								<div className="mt-1 rounded-md bg-muted px-3 py-2 text-sm">{event.note}</div>
							)}
							<p className="mt-0.5 text-xs text-muted-foreground">
								{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
							</p>
						</div>
					</div>
				);
			})}
			{hasMore && (
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className="ml-10 text-xs font-medium text-primary hover:underline"
				>
					{expanded ? "Show less" : `Show all ${events.length} events`}
				</button>
			)}
		</div>
	);
}

function formatEventText(event: TimelineEvent): string {
	switch (event.eventType) {
		case "created":
			return "submitted this idea";
		case "status_changed": {
			const newLabel =
				STATUS_LABELS[event.newValue as keyof typeof STATUS_LABELS] ?? event.newValue;
			return `changed status to ${newLabel}`;
		}
		case "reassigned":
			return `reassigned to ${event.newValue ?? "another leader"}`;
		case "note_added":
			return "added a note";
		case "message":
			return "sent a message";
		case "communicated":
			return "communicated with the employee";
		case "reminder_sent":
			return `received an SLA reminder (${event.newValue}-day threshold)`;
		case "attachment_added":
			return `attached "${event.note ?? "a file"}"`;
		case "attachment_deleted":
			return `removed "${event.note ?? "a file"}"`;
		default:
			return "updated this idea";
	}
}
