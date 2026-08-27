import { and, eq, inArray } from "drizzle-orm";
import { firstName } from "#/lib/utils";
import { db } from "#/server/db";
import { categoryContributors, ideaWatchers, users } from "#/server/db/schema";
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
 * `assignment` rows are ignored — the reviewer follows implicitly) PLUS the
 * **category Watcher roster** (R14: category watchers get alerts for everything
 * in their category) PLUS an optional implicit follower (`alsoNotifyId`, the
 * active reviewer, passed for status changes so they learn the owner's
 * verdict). The actor and the submitter are always excluded — they're notified
 * through their own emails. Fire-and-forget: never blocks the primary action.
 */
export async function notifyIdeaWatchers(params: {
	ideaId: string;
	submissionId: string;
	ideaTitle: string;
	/** The idea's category — its Watcher roster is alerted too. */
	categoryId: string;
	eventType: string;
	actorId: string;
	submitterId: string;
	/** Active reviewer to also notify (status events only — they get a reply email otherwise). */
	alsoNotifyId?: string | null;
	update: WatcherUpdate;
}): Promise<void> {
	if (!notifiesWatchers(params.eventType)) return;

	const [rows, rosterRows] = await Promise.all([
		db.query.ideaWatchers.findMany({
			where: and(
				eq(ideaWatchers.ideaId, params.ideaId),
				inArray(ideaWatchers.source, ["self", "owner_added"]),
			),
			with: { user: { columns: { id: true, email: true, displayName: true, active: true } } },
		}),
		db.query.categoryContributors.findMany({
			where: eq(categoryContributors.categoryId, params.categoryId),
			with: { user: { columns: { id: true, email: true, displayName: true, active: true } } },
		}),
	]);

	// The first query already loaded each watcher's email/displayName via the
	// `user` relation — keep them, and only round-trip for ids it didn't cover
	// (just the optional active reviewer in `alsoNotifyId`).
	// Deactivated accounts get no mail, however they're subscribed.
	const byId = new Map<string, { email: string; displayName: string }>();
	for (const r of [...rows, ...rosterRows]) {
		if (r.user?.active)
			byId.set(r.user.id, { email: r.user.email, displayName: r.user.displayName });
	}

	const recipientIds = new Set<string>(byId.keys());
	if (params.alsoNotifyId) recipientIds.add(params.alsoNotifyId);
	recipientIds.delete(params.actorId);
	recipientIds.delete(params.submitterId);
	if (recipientIds.size === 0) return;

	const missing = [...recipientIds].filter((id) => !byId.has(id));
	if (missing.length > 0) {
		const extra = await db.query.users.findMany({
			where: and(inArray(users.id, missing), eq(users.active, true)),
			columns: { id: true, email: true, displayName: true },
		});
		for (const u of extra) byId.set(u.id, { email: u.email, displayName: u.displayName });
	}

	for (const id of recipientIds) {
		const u = byId.get(id);
		if (!u) continue;
		sendWatcherUpdateEmail({
			watcherEmail: u.email,
			watcherFirstName: firstName(u.displayName),
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			updateKind: params.update.kind,
			statusLabel: params.update.kind === "status" ? params.update.statusLabel : null,
			messagePreview: params.update.kind === "message" ? params.update.messagePreview : null,
		}).catch(() => {});
	}
}
