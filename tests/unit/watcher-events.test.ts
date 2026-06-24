import { describe, expect, it } from "vitest";
import { notifiesWatchers } from "#/server/lib/watcher-events";

/**
 * Watchers receive the submitter-facing event set only. The regression this
 * guards: internal notes, SLA reminders, and admin events must never reach an
 * owner-added stakeholder Watcher.
 */
describe("notifiesWatchers", () => {
	it("notifies on submitter-facing events", () => {
		expect(notifiesWatchers("status_changed")).toBe(true);
		expect(notifiesWatchers("message")).toBe(true);
		expect(notifiesWatchers("communicated")).toBe(true);
	});

	it("never notifies on internal or operational events", () => {
		for (const e of [
			"internal_note",
			"note_added",
			"reminder_sent",
			"reassigned",
			"created",
			"attachment_added",
			"attachment_deleted",
		]) {
			expect(notifiesWatchers(e)).toBe(false);
		}
	});
});
