import { and, eq, inArray } from "drizzle-orm";
import { db } from "#/server/db";
import { ideaWatchers, users } from "#/server/db/schema";
import { sendWatcherUpdateEmail } from "#/server/functions/email";
import { notifiesWatchers } from "#/server/lib/watcher-events";

type WatcherUpdate =
	| { kind: "status"; statusLabel: string }
	| { kind: "message"; messagePreview: string };

/**
 * Notify the people following an idea of a submitter-facing event (status change
 * or public message — enforced through `notifiesWatchers`).
 *
 * Recipients = the **explicit Watchers** (self opt-in + owner-added; legacy
 * `assignment` rows are ignored — the reviewer follows implicitly) PLUS an
 * optional implicit follower (`alsoNotifyId`, the active reviewer, passed for
 * status changes so a Contributor learns the owner's verdict). The actor and the
 * submitter are always excluded — they're notified through their own emails.
 * Fire-and-forget: never blocks the primary action.
 */
export async function notifyIdeaWatchers(params: {
	ideaId: string;
	submissionId: string;
	ideaTitle: string;
	eventType: string;
	actorId: string;
	submitterId: string;
	/** Active reviewer to also notify (status events only — they get a reply email otherwise). */
	alsoNotifyId?: string | null;
	update: WatcherUpdate;
}): Promise<void> {
	if (!notifiesWatchers(params.eventType)) return;

	const rows = await db.query.ideaWatchers.findMany({
		where: and(
			eq(ideaWatchers.ideaId, params.ideaId),
			inArray(ideaWatchers.source, ["self", "owner_added"]),
		),
		with: { user: { columns: { id: true, email: true, displayName: true } } },
	});

	const recipientIds = new Set<string>(rows.flatMap((r) => (r.user ? [r.user.id] : [])));
	if (params.alsoNotifyId) recipientIds.add(params.alsoNotifyId);
	recipientIds.delete(params.actorId);
	recipientIds.delete(params.submitterId);
	if (recipientIds.size === 0) return;

	const recipients = await db.query.users.findMany({
		where: inArray(users.id, [...recipientIds]),
		columns: { email: true, displayName: true },
	});

	for (const u of recipients) {
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
