import { describe, expect, it } from "vitest";
import { resolveIdeaOwnership } from "#/server/lib/ownership";

const OWNER = "user-category-owner";
const REVIEWER = "user-assigned-reviewer";

/**
 * Ownership is category-centric (ADR-0001): the accountable Owner is always the
 * Category Owner, and the active reviewer is the assignment if present, else the
 * Owner. These tests pin the derivation so a future refactor can't quietly
 * reintroduce a stored per-idea owner.
 */
describe("resolveIdeaOwnership", () => {
	it("derives the accountable owner from the category", () => {
		const { accountableOwnerId } = resolveIdeaOwnership({
			categoryOwnerId: OWNER,
			assignedReviewerId: null,
		});
		expect(accountableOwnerId).toBe(OWNER);
	});

	it("falls back to the category owner as active reviewer when unassigned", () => {
		const { activeReviewerId } = resolveIdeaOwnership({
			categoryOwnerId: OWNER,
			assignedReviewerId: null,
		});
		expect(activeReviewerId).toBe(OWNER);
	});

	it("uses the assigned reviewer as active reviewer, without changing the owner", () => {
		const result = resolveIdeaOwnership({
			categoryOwnerId: OWNER,
			assignedReviewerId: REVIEWER,
		});
		expect(result).toEqual({ accountableOwnerId: OWNER, activeReviewerId: REVIEWER });
	});

	it("reports an unowned category as null owner and null reviewer when unassigned", () => {
		const result = resolveIdeaOwnership({
			categoryOwnerId: null,
			assignedReviewerId: null,
		});
		expect(result).toEqual({ accountableOwnerId: null, activeReviewerId: null });
	});

	it("keeps an assigned reviewer working even when the category is unowned", () => {
		const result = resolveIdeaOwnership({
			categoryOwnerId: null,
			assignedReviewerId: REVIEWER,
		});
		expect(result).toEqual({ accountableOwnerId: null, activeReviewerId: REVIEWER });
	});
});
