import { describe, expect, it } from "vitest";
import { resolveDeactivation } from "#/server/lib/owner-departure";

/**
 * In-app demotion/deactivation is blocked while a user still owns Categories
 * (Pri 13), so deriving ownership from the Category can't orphan Ideas.
 */
describe("resolveDeactivation", () => {
	it("allows deactivation when the user owns no categories", () => {
		expect(resolveDeactivation({ ownedCategoryCount: 0 })).toEqual({ canDeactivate: true });
	});

	it("blocks deactivation while the user owns categories", () => {
		const decision = resolveDeactivation({ ownedCategoryCount: 3 });
		expect(decision.canDeactivate).toBe(false);
		expect(decision.reason).toContain("3");
	});

	it("uses singular wording for a single owned category", () => {
		const decision = resolveDeactivation({ ownedCategoryCount: 1 });
		expect(decision.reason).toContain("1 Category.");
	});

	it("blocks deactivation while the user holds open assigned ideas (assignment confers ownership)", () => {
		const decision = resolveDeactivation({ ownedCategoryCount: 0, openAssignedIdeaCount: 2 });
		expect(decision.canDeactivate).toBe(false);
		expect(decision.reason).toContain("2 open ideas");
	});

	it("ignores closed assignments", () => {
		expect(resolveDeactivation({ ownedCategoryCount: 0, openAssignedIdeaCount: 0 })).toEqual({
			canDeactivate: true,
		});
	});
});
