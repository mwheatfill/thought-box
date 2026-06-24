import { describe, expect, it } from "vitest";
import { deriveUserRole } from "#/server/lib/roles";

/**
 * Roles are derived from relationships, not stored (ADR-0003). The regression
 * these guard: a user who loses their last Category must stop being an Owner,
 * and admin must always win regardless of Category/roster relationships.
 */
describe("deriveUserRole", () => {
	it("returns submitter when the user owns nothing and is on no roster", () => {
		expect(
			deriveUserRole({ isAdmin: false, ownedCategoryCount: 0, rosterMembershipCount: 0 }),
		).toBe("submitter");
	});

	it("returns contributor when on at least one roster but owning no category", () => {
		expect(
			deriveUserRole({ isAdmin: false, ownedCategoryCount: 0, rosterMembershipCount: 1 }),
		).toBe("contributor");
	});

	it("returns owner when owning at least one category", () => {
		expect(
			deriveUserRole({ isAdmin: false, ownedCategoryCount: 1, rosterMembershipCount: 0 }),
		).toBe("owner");
	});

	it("prefers owner over contributor when the user both owns and is on a roster", () => {
		expect(
			deriveUserRole({ isAdmin: false, ownedCategoryCount: 2, rosterMembershipCount: 3 }),
		).toBe("owner");
	});

	it("returns admin regardless of category or roster relationships", () => {
		expect(deriveUserRole({ isAdmin: true, ownedCategoryCount: 0, rosterMembershipCount: 0 })).toBe(
			"admin",
		);
		expect(deriveUserRole({ isAdmin: true, ownedCategoryCount: 5, rosterMembershipCount: 5 })).toBe(
			"admin",
		);
	});

	it("drops back to submitter when the last category and roster seat are removed", () => {
		expect(
			deriveUserRole({ isAdmin: false, ownedCategoryCount: 0, rosterMembershipCount: 0 }),
		).toBe("submitter");
	});
});
