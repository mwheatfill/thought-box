import { describe, expect, it } from "vitest";
import { resolveIdeaCapabilities } from "#/server/lib/idea-permissions";

const NONE = {
	isAdmin: false,
	isCategoryOwner: false,
	isAssignedReviewer: false,
	isCategoryContributor: false,
	isSubmitter: false,
};

/**
 * The client's ownership model (2026-09-01): whoever a ticket is assigned to
 * owns it — full powers, verdict included. Category Watchers get notes and
 * messages only. Closed ideas are locked except for Reopen.
 */
describe("resolveIdeaCapabilities", () => {
	it("gives an owner full rights on an open idea", () => {
		const c = resolveIdeaCapabilities({ ...NONE, isCategoryOwner: true, status: "under_review" });
		expect(c.canDecide).toBe(true);
		expect(c.canChangeCategory).toBe(true);
		expect(c.canAssignReviewer).toBe(true);
		expect(c.canEditOwnerNotes).toBe(true);
	});

	it("gives an admin full rights even when unrelated to the idea's category", () => {
		const c = resolveIdeaCapabilities({ ...NONE, isAdmin: true, status: "new" });
		expect(c.canDecide).toBe(true);
		expect(c.canAdvanceToUnderReview).toBe(true);
	});

	it("gives the assigned person full powers on their ticket — they own it", () => {
		const c = resolveIdeaCapabilities({ ...NONE, isAssignedReviewer: true, status: "new" });
		expect(c.canEditOwnerNotes).toBe(true);
		expect(c.canReadInternalNotes).toBe(true);
		expect(c.canMessageSubmitter).toBe(true);
		expect(c.canAdvanceToUnderReview).toBe(true);
		expect(c.canDecide).toBe(true);
		expect(c.canChangeCategory).toBe(true);
		expect(c.canAssignReviewer).toBe(true);
	});

	it("lets the assigned person Reopen their closed ticket, but nothing else on it", () => {
		const c = resolveIdeaCapabilities({ ...NONE, isAssignedReviewer: true, status: "declined" });
		expect(c.canReopen).toBe(true);
		expect(c.canDecide).toBe(false);
		expect(c.canEditOwnerNotes).toBe(false);
	});

	it("gives a category Watcher notes + messaging on any idea in the category, but no status power (R14)", () => {
		const c = resolveIdeaCapabilities({ ...NONE, isCategoryContributor: true, status: "new" });
		expect(c.canView).toBe(true);
		expect(c.canReadInternalNotes).toBe(true);
		expect(c.canEditOwnerNotes).toBe(true);
		expect(c.canMessageSubmitter).toBe(true);
		expect(c.canAdvanceToUnderReview).toBe(false);
		expect(c.canDecide).toBe(false);
		expect(c.canChangeCategory).toBe(false);
		expect(c.canAssignReviewer).toBe(false);
	});

	it("locks a category Watcher's notes + messaging once the idea closes", () => {
		const c = resolveIdeaCapabilities({ ...NONE, isCategoryContributor: true, status: "declined" });
		expect(c.canReadInternalNotes).toBe(true);
		expect(c.canEditOwnerNotes).toBe(false);
		expect(c.canMessageSubmitter).toBe(false);
		expect(c.canReopen).toBe(false);
	});

	it("keeps internal notes readable to the assigned reviewer after the idea closes", () => {
		const c = resolveIdeaCapabilities({ ...NONE, isAssignedReviewer: true, status: "declined" });
		expect(c.canReadInternalNotes).toBe(true);
		expect(c.canEditOwnerNotes).toBe(false);
	});

	it("never shows internal notes to the submitter", () => {
		const c = resolveIdeaCapabilities({ ...NONE, isSubmitter: true, status: "under_review" });
		expect(c.canReadInternalNotes).toBe(false);
	});

	it("lets the submitter view but not act", () => {
		const c = resolveIdeaCapabilities({ ...NONE, isSubmitter: true, status: "new" });
		expect(c.canView).toBe(true);
		expect(c.canEditOwnerNotes).toBe(false);
		expect(c.canDecide).toBe(false);
	});

	it("denies view to a wholly unrelated user", () => {
		const c = resolveIdeaCapabilities({ ...NONE, status: "new" });
		expect(c.canView).toBe(false);
	});

	it("grants a per-idea Watcher view only — no acting", () => {
		const c = resolveIdeaCapabilities({ ...NONE, isWatcher: true, status: "under_review" });
		expect(c.canView).toBe(true);
		expect(c.canReadInternalNotes).toBe(false);
		expect(c.canEditOwnerNotes).toBe(false);
		expect(c.canMessageSubmitter).toBe(false);
		expect(c.canDecide).toBe(false);
	});

	it("only allows advancing to Under Review from New", () => {
		const fromNew = resolveIdeaCapabilities({ ...NONE, isCategoryOwner: true, status: "new" });
		const fromReview = resolveIdeaCapabilities({
			...NONE,
			isCategoryOwner: true,
			status: "under_review",
		});
		expect(fromNew.canAdvanceToUnderReview).toBe(true);
		expect(fromReview.canAdvanceToUnderReview).toBe(false);
	});

	it("locks a closed idea except for owner Reopen", () => {
		const owner = resolveIdeaCapabilities({ ...NONE, isCategoryOwner: true, status: "declined" });
		expect(owner.canReopen).toBe(true);
		expect(owner.canEditOwnerNotes).toBe(false);
		expect(owner.canDecide).toBe(false);
		expect(owner.canChangeCategory).toBe(false);

		const assignee = resolveIdeaCapabilities({
			...NONE,
			isAssignedReviewer: true,
			status: "declined",
		});
		// The assigned person owns the ticket — Reopen included.
		expect(assignee.canReopen).toBe(true);
	});
});
