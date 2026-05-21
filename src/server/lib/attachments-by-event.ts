import { and, eq, isNull } from "drizzle-orm";
import { db } from "#/server/db";
import { attachments } from "#/server/db/schema";

export interface EventAttachment {
	id: string;
	filename: string;
	contentType: string;
	sizeBytes: number;
}

/**
 * Load all non-deleted attachments for an idea, grouped by the event ID
 * they were attached to. Used by message + internal-note threads to
 * decorate each event with its files. Returns an empty Map when there
 * are no events to decorate (skips the DB roundtrip).
 */
export async function loadAttachmentsByEvent(
	ideaId: string,
	eventIds: string[],
): Promise<Map<string, EventAttachment[]>> {
	if (eventIds.length === 0) return new Map();

	const rows = await db.query.attachments.findMany({
		where: and(eq(attachments.ideaId, ideaId), isNull(attachments.deletedAt)),
		columns: {
			id: true,
			messageId: true,
			filename: true,
			contentType: true,
			sizeBytes: true,
		},
	});

	const grouped = new Map<string, EventAttachment[]>();
	for (const row of rows) {
		if (!row.messageId) continue;
		const existing = grouped.get(row.messageId) ?? [];
		existing.push({
			id: row.id,
			filename: row.filename,
			contentType: row.contentType,
			sizeBytes: row.sizeBytes,
		});
		grouped.set(row.messageId, existing);
	}
	return grouped;
}
