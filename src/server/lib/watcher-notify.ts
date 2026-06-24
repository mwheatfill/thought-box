import { eq } from "drizzle-orm";
import { db } from "#/server/db";
import { ideaWatchers } from "#/server/db/schema";
import { sendWatcherUpdateEmail } from "#/server/functions/email";
import { notifiesWatchers } from "#/server/lib/watcher-events";

type WatcherUpdate =
	| { kind: "status"; statusLabel: string }
	| { kind: "message"; messagePreview: string };

/**
 * Notify a per-idea's Watchers of an event — but only the submitter-facing ones
 * (status changes, public messages), enforced through `notifiesWatchers`. The
 * actor who triggered the event and the submitter (notified through their own
 * emails) are excluded. Fire-and-forget: never blocks the primary action.
 */
export async function notifyIdeaWatchers(params: {
	ideaId: string;
	submissionId: string;
	ideaTitle: string;
	eventType: string;
	actorId: string;
	submitterId: string;
	update: WatcherUpdate;
}): Promise<void> {
	if (!notifiesWatchers(params.eventType)) return;

	const rows = await db.query.ideaWatchers.findMany({
		where: eq(ideaWatchers.ideaId, params.ideaId),
		with: { user: { columns: { id: true, email: true, displayName: true } } },
	});

	for (const row of rows) {
		const u = row.user;
		// Don't echo the event back to whoever caused it, and never to the
		// submitter — they're already notified through the submitter-facing emails.
		if (!u || u.id === params.actorId || u.id === params.submitterId) continue;
		sendWatcherUpdateEmail({
			watcherEmail: u.email,
			watcherFirstName: u.displayName.split(" ")[0],
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			updateKind: params.update.kind,
			statusLabel: params.update.kind === "status" ? params.update.statusLabel : null,
			messagePreview: params.update.kind === "message" ? params.update.messagePreview : null,
		}).catch(() => {});
	}
}
