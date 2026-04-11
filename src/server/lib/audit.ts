import { db } from "#/server/db";
import { auditLog } from "#/server/db/schema";

interface AuditEvent {
	actorId: string | null;
	action: string;
	resourceType: string;
	resourceId?: string | null;
	details?: Record<string, unknown>;
}

/**
 * Log an audit event. Fire-and-forget — errors are logged but don't block.
 */
export function audit(event: AuditEvent): void {
	db.insert(auditLog)
		.values({
			actorId: event.actorId,
			action: event.action,
			resourceType: event.resourceType,
			resourceId: event.resourceId ?? null,
			details: event.details ?? null,
		})
		.catch((err) => console.error("[audit] Failed to log event:", event.action, err));
}
