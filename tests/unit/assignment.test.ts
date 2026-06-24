import { describe, expect, it } from "vitest";
import { isScopedToCategory, planAssignment } from "#/server/lib/assignment";

const OWNER = "user-owner";
const CONTRIBUTOR = "user-contributor";

/**
 * The Assignment lever (ADR-0002): who may be the single Active reviewer, and
 * what follows from setting them. Assignment is delegation, never ownership — it
 * never resets the SLA, and assigning to the Owner is the same as no assignment.
 */
describe("isScopedToCategory", () => {
	it("admits the Category Owner, a roster Contributor, or an Admin", () => {
		expect(
			isScopedToCategory({ isAdmin: false, isCategoryOwner: true, isCategoryContributor: false }),
		).toBe(true);
		expect(
			isScopedToCategory({ isAdmin: false, isCategoryOwner: false, isCategoryContributor: true }),
		).toBe(true);
		expect(
			isScopedToCategory({ isAdmin: true, isCategoryOwner: false, isCategoryContributor: false }),
		).toBe(true);
	});

	it("rejects someone with no relationship to the Category", () => {
		expect(
			isScopedToCategory({ isAdmin: false, isCategoryOwner: false, isCategoryContributor: false }),
		).toBe(false);
	});
});

describe("planAssignment", () => {
	it("stores a distinct reviewer, auto-watches them, and notifies them", () => {
		const plan = planAssignment({ reviewerId: CONTRIBUTOR, categoryOwnerId: OWNER });
		expect(plan.assignedReviewerId).toBe(CONTRIBUTOR);
		expect(plan.addsWatcher).toBe(true);
		expect(plan.notifiesAssignee).toBe(true);
	});

	it("collapses assigning to the Owner into 'clear' — no reviewer row, watcher, or email", () => {
		const plan = planAssignment({ reviewerId: OWNER, categoryOwnerId: OWNER });
		expect(plan.assignedReviewerId).toBeNull();
		expect(plan.addsWatcher).toBe(false);
		expect(plan.notifiesAssignee).toBe(false);
	});

	it("treats an explicit unassign (null) as reverting to the derived Owner", () => {
		const plan = planAssignment({ reviewerId: null, categoryOwnerId: OWNER });
		expect(plan.assignedReviewerId).toBeNull();
		expect(plan.addsWatcher).toBe(false);
		expect(plan.notifiesAssignee).toBe(false);
	});

	it("still stores a distinct reviewer when the Category is unowned", () => {
		const plan = planAssignment({ reviewerId: CONTRIBUTOR, categoryOwnerId: null });
		expect(plan.assignedReviewerId).toBe(CONTRIBUTOR);
		expect(plan.addsWatcher).toBe(true);
		expect(plan.notifiesAssignee).toBe(true);
	});
});
