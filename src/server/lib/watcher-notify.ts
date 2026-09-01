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
 * in their category) PLUS the implicit followers (`alsoNotifyIds`: the assignee and the category owner, the
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
	/**
	 * Implicit followers to also notify — the assignee AND the category owner
	 * on status events, so whichever of them did NOT act still learns the
	 * verdict (the actor is always excluded below). Nulls are ignored.
	 */
	alsoNotifyIds?: (string | null)[];
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
	// (the implicit followers in `alsoNotifyIds`).
	// Deactivated accounts get no mail, however they're subscribed.
	const byId = new Map<string, { email: string; displayName: string }>();
	for (const r of [...rows, ...rosterRows]) {
		if (r.user?.active)
			byId.set(r.user.id, { email: r.user.email, displayName: r.user.displayName });
	}

	const recipientIds = new Set<string>(byId.keys());
	for (const id of params.alsoNotifyIds ?? []) if (id) recipientIds.add(id);
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

/**
 * Owner notice: tell the people accountable for an idea (its category owner
 * and/or its assignee) that SOMEONE ELSE moved, handed off, or reopened it.
 * The actor and anyone in `exclude` (e.g. the new assignee, who gets their own
 * email) never receive it; deactivated accounts are skipped. Fire-and-forget.
 */
export async function notifyIdeaStakeholders(params: {
	userIds: (string | null | undefined)[];
	exclude?: (string | null | undefined)[];
	actorId: string;
	actorName: string;
	submissionId: string;
	ideaTitle: string;
	kind: "moved" | "handoff" | "reopened";
	detail?: string | null;
}): Promise<void> {
	const skip = new Set([params.actorId, ...(params.exclude ?? [])].filter(Boolean));
	const ids = [...new Set(params.userIds.filter((id): id is string => !!id && !skip.has(id)))];
	if (ids.length === 0) return;

	const recipients = await db.query.users.findMany({
		where: and(inArray(users.id, ids), eq(users.active, true)),
		columns: { email: true, displayName: true },
	});
	for (const u of recipients) {
		sendWatcherUpdateEmail({
			watcherEmail: u.email,
			watcherFirstName: firstName(u.displayName),
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			updateKind: params.kind,
			detail: params.detail ?? null,
			actorName: params.actorName,
		}).catch(() => {});
	}
}
