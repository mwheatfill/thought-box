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
 * The Contributor model (ADR-0002): acting is assignment-gated, the verdict is
 * reserved to owner/admin, and closed ideas are locked except for Reopen.
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

	it("lets an assigned Contributor do legwork but never the verdict", () => {
		const c = resolveIdeaCapabilities({ ...NONE, isAssignedReviewer: true, status: "new" });
		expect(c.canEditOwnerNotes).toBe(true);
		expect(c.canReadInternalNotes).toBe(true);
		expect(c.canMessageSubmitter).toBe(true);
		expect(c.canAdvanceToUnderReview).toBe(true);
		expect(c.canDecide).toBe(false);
		expect(c.canChangeCategory).toBe(false);
		expect(c.canAssignReviewer).toBe(false);
	});

	it("gives an unassigned roster Contributor view-and-watch only — no internal notes", () => {
		const c = resolveIdeaCapabilities({ ...NONE, isCategoryContributor: true, status: "new" });
		expect(c.canView).toBe(true);
		expect(c.canReadInternalNotes).toBe(false);
		expect(c.canEditOwnerNotes).toBe(false);
		expect(c.canMessageSubmitter).toBe(false);
		expect(c.canAdvanceToUnderReview).toBe(false);
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

		const contributor = resolveIdeaCapabilities({
			...NONE,
			isAssignedReviewer: true,
			status: "declined",
		});
		expect(contributor.canReopen).toBe(false);
	});
});
