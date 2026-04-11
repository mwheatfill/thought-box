import { db } from "#/server/db";
import { emailLog } from "#/server/db/schema";
import { registerEmailLogger } from "#/server/lib/email";

/**
 * Register the email logger callback.
 * Must be called once from a server-only context (auth middleware).
 */
export function initEmailLog() {
	registerEmailLogger((entry) => {
		db.insert(emailLog)
			.values({
				recipient: entry.recipient,
				subject: entry.subject,
				template: entry.template,
				ideaId: entry.ideaId,
				status: entry.status,
				error: entry.error,
			})
			.catch(() => {});
	});
}
