import { describe, expect, it } from "vitest";
import { planCategoryChange } from "#/server/lib/category-change";

const TARGET = "category-me-tools";
const NEW_OWNER = "user-me-tools-owner";

/**
 * Change Category invariants (ADR-0001 / Pri 6): moving an Idea always clears
 * the assignment, resets the SLA, records a reason, and notifies the new Owner.
 */
describe("planCategoryChange", () => {
	it("always clears the assignment and resets the SLA", () => {
		const plan = planCategoryChange({
			newCategoryId: TARGET,
			newCategoryOwnerId: NEW_OWNER,
			reason: "improperly_assigned",
		});
		expect(plan.clearsAssignment).toBe(true);
		expect(plan.resetsSla).toBe(true);
	});

	it("carries the reason and notifies the new category owner", () => {
		const plan = planCategoryChange({
			newCategoryId: TARGET,
			newCategoryOwnerId: NEW_OWNER,
			reason: "internal_department",
		});
		expect(plan.reason).toBe("internal_department");
		expect(plan.notifyOwnerId).toBe(NEW_OWNER);
		expect(plan.newCategoryId).toBe(TARGET);
	});

	it("surfaces an unowned target as a null notify owner", () => {
		const plan = planCategoryChange({
			newCategoryId: TARGET,
			newCategoryOwnerId: null,
			reason: "improperly_assigned",
		});
		expect(plan.notifyOwnerId).toBeNull();
	});
});
