/**
 * The idea-event types a Watcher is notified about: the submitter-facing set
 * only. Status changes (incl. Reopen, which logs a status_changed event),
 * public owner↔submitter messages, and formal communications. Everything else
 * — internal notes, owner notes, SLA reminders, reassignment/admin events,
 * attachment churn — is kept off watcher feeds so internal content never leaks
 * to an owner-added stakeholder.
 */
const WATCHER_NOTIFIABLE_EVENTS = new Set<string>(["status_changed", "message", "communicated"]);

/** Whether an idea event of this type should notify the idea's Watchers. */
export function notifiesWatchers(eventType: string): boolean {
	return WATCHER_NOTIFIABLE_EVENTS.has(eventType);
}
