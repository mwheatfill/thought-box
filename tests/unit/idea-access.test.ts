import { describe, expect, it } from "vitest";
import { resolveIdeaAccess } from "#/server/lib/owner-visibility";

// Stable ids for the actors in the matrix below.
const SUBMITTER = "user-submitter";
const CATEGORY_OWNER = "user-category-owner";
const OTHER = "user-unrelated";

/**
 * Access and perspective are governed by the viewer's relationship to a
 * specific idea, never their global role alone. Under the category-centric
 * model (ADR-0001) the owner perspective is granted to the Category Owner OR a
 * delegated assigned reviewer. The regression these tests guard: an owner-role
 * user who SUBMITTED an idea whose Category someone else owns must still be able
 * to view it — as its submitter (TB-? "View Issue", Jun 2026).
 */
describe("resolveIdeaAccess", () => {
	it("lets the submitter view their own idea as a submitter", () => {
		const access = resolveIdeaAccess({
			userId: SUBMITTER,
			userRole: "submitter",
			submitterId: SUBMITTER,
			categoryOwnerId: CATEGORY_OWNER,
			assignedReviewerId: null,
		});
		expect(access).toEqual({ canView: true, viewerRole: "submitter", canEdit: false });
	});

	it("lets the Category Owner view and edit the idea as an owner", () => {
		const access = resolveIdeaAccess({
			userId: CATEGORY_OWNER,
			userRole: "owner",
			submitterId: SUBMITTER,
			categoryOwnerId: CATEGORY_OWNER,
			assignedReviewerId: null,
		});
		expect(access).toEqual({ canView: true, viewerRole: "owner", canEdit: true });
	});

	it("lets an assigned reviewer view and edit the idea as an owner", () => {
		const access = resolveIdeaAccess({
			userId: OTHER,
			userRole: "submitter",
			submitterId: SUBMITTER,
			categoryOwnerId: CATEGORY_OWNER,
			assignedReviewerId: OTHER,
		});
		expect(access).toEqual({ canView: true, viewerRole: "owner", canEdit: true });
	});

	it("lets an admin view and edit any idea, even when unrelated to it", () => {
		const access = resolveIdeaAccess({
			userId: OTHER,
			userRole: "admin",
			submitterId: SUBMITTER,
			categoryOwnerId: CATEGORY_OWNER,
			assignedReviewerId: null,
		});
		expect(access).toEqual({ canView: true, viewerRole: "admin", canEdit: true });
	});

	it("denies an owner who is neither the Category Owner, reviewer, nor submitter", () => {
		const access = resolveIdeaAccess({
			userId: OTHER,
			userRole: "owner",
			submitterId: SUBMITTER,
			categoryOwnerId: CATEGORY_OWNER,
			assignedReviewerId: null,
		});
		expect(access.canView).toBe(false);
		expect(access.canEdit).toBe(false);
	});

	it("denies a submitter trying to view someone else's idea", () => {
		const access = resolveIdeaAccess({
			userId: OTHER,
			userRole: "submitter",
			submitterId: SUBMITTER,
			categoryOwnerId: CATEGORY_OWNER,
			assignedReviewerId: null,
		});
		expect(access.canView).toBe(false);
	});

	// The bug. Colby holds the global "owner" role but is the SUBMITTER of an
	// idea whose Category a different owner owns. He must view it (to read/answer
	// the reviewers' messages) — but as a submitter: no edit, submitter perspective.
	it("treats an owner-role user as the submitter of their own submission", () => {
		const access = resolveIdeaAccess({
			userId: SUBMITTER,
			userRole: "owner",
			submitterId: SUBMITTER,
			categoryOwnerId: CATEGORY_OWNER,
			assignedReviewerId: null,
		});
		expect(access).toEqual({ canView: true, viewerRole: "submitter", canEdit: false });
	});

	it("gives the owner perspective when an owner is both submitter and Category Owner", () => {
		const access = resolveIdeaAccess({
			userId: SUBMITTER,
			userRole: "owner",
			submitterId: SUBMITTER,
			categoryOwnerId: SUBMITTER,
			assignedReviewerId: null,
		});
		expect(access).toEqual({ canView: true, viewerRole: "owner", canEdit: true });
	});

	it("denies an owner-role user on an idea they neither own nor are assigned", () => {
		const access = resolveIdeaAccess({
			userId: OTHER,
			userRole: "owner",
			submitterId: SUBMITTER,
			categoryOwnerId: CATEGORY_OWNER,
			assignedReviewerId: null,
		});
		expect(access.canView).toBe(false);
	});
});
