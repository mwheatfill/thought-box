import { describe, expect, it } from "vitest";
import {
	addBusinessDays,
	businessDaysRemaining,
	calculateSlaDueDate,
	isOverdue,
	summarizeReviewCompliance,
} from "#/server/lib/sla";

describe("addBusinessDays", () => {
	it("skips weekends when adding days", () => {
		// Friday April 3, 2026
		const friday = new Date(2026, 3, 3);
		const result = addBusinessDays(friday, 1);
		// Should be Monday April 6
		expect(result.getDay()).toBe(1); // Monday
		expect(result.getDate()).toBe(6);
	});

	it("adds 5 business days across a week", () => {
		// Monday April 6, 2026
		const monday = new Date(2026, 3, 6);
		const result = addBusinessDays(monday, 5);
		// Should be Monday April 13
		expect(result.getDate()).toBe(13);
		expect(result.getDay()).toBe(1); // Monday
	});

	it("adds 15 business days (3 weeks)", () => {
		// Monday April 6, 2026
		const monday = new Date(2026, 3, 6);
		const result = addBusinessDays(monday, 15);
		// 15 business days = 3 weeks = April 27 (Monday)
		expect(result.getDate()).toBe(27);
	});

	it("handles starting on Saturday", () => {
		// Saturday April 4, 2026
		const saturday = new Date(2026, 3, 4);
		const result = addBusinessDays(saturday, 1);
		// Should be Monday April 6
		expect(result.getDay()).toBe(1);
		expect(result.getDate()).toBe(6);
	});

	it("handles starting on Sunday", () => {
		// Sunday April 5, 2026
		const sunday = new Date(2026, 3, 5);
		const result = addBusinessDays(sunday, 1);
		// Should be Monday April 6
		expect(result.getDay()).toBe(1);
		expect(result.getDate()).toBe(6);
	});

	it("handles zero days", () => {
		const monday = new Date(2026, 3, 6);
		const result = addBusinessDays(monday, 0);
		expect(result.getDate()).toBe(6);
	});
});

describe("calculateSlaDueDate", () => {
	it("defaults to 15 business days", () => {
		const monday = new Date(2026, 3, 6);
		const result = calculateSlaDueDate(monday);
		// 15 business days from Monday April 6 = Monday April 27
		expect(result.getDate()).toBe(27);
	});

	it("accepts custom business days", () => {
		const monday = new Date(2026, 3, 6);
		const result = calculateSlaDueDate(monday, 30);
		// 30 business days = 6 weeks = May 18 (Monday)
		expect(result.getMonth()).toBe(4); // May
		expect(result.getDate()).toBe(18);
	});
});

describe("isOverdue", () => {
	it("returns false for null due date", () => {
		expect(isOverdue(null)).toBe(false);
	});

	it("returns true when past due date", () => {
		const pastDate = new Date(2020, 0, 1);
		expect(isOverdue(pastDate)).toBe(true);
	});

	it("returns false when before due date", () => {
		const futureDate = new Date(2030, 0, 1);
		expect(isOverdue(futureDate)).toBe(false);
	});
});

describe("businessDaysRemaining", () => {
	it("returns null for null due date", () => {
		expect(businessDaysRemaining(null)).toBe(null);
	});

	it("returns positive days when before due date", () => {
		const now = new Date();
		const futureDate = addBusinessDays(now, 5);
		const result = businessDaysRemaining(futureDate);
		expect(result).toBeGreaterThanOrEqual(4);
		expect(result).toBeLessThanOrEqual(6);
	});

	it("returns negative days when past due date", () => {
		const pastDate = new Date();
		pastDate.setDate(pastDate.getDate() - 14); // ~2 weeks ago
		const result = businessDaysRemaining(pastDate);
		expect(result).toBeLessThan(0);
	});
});

describe("summarizeReviewCompliance", () => {
	const PAST_DUE = new Date("2020-01-15T00:00:00Z");
	const FUTURE_DUE = new Date("2099-01-15T00:00:00Z");

	it("counts ideas reviewed before their due date as on time", () => {
		const r = summarizeReviewCompliance([
			{
				status: "under_review",
				slaDueDate: PAST_DUE,
				closedAt: null,
				firstReviewedAt: new Date("2020-01-10T00:00:00Z"),
			},
		]);
		expect(r).toEqual({ onTime: 1, breached: 0, percent: 100 });
	});

	it("counts ideas reviewed after their due date as breached", () => {
		const r = summarizeReviewCompliance([
			{
				status: "under_review",
				slaDueDate: PAST_DUE,
				closedAt: null,
				firstReviewedAt: new Date("2020-02-01T00:00:00Z"),
			},
		]);
		expect(r).toEqual({ onTime: 0, breached: 1, percent: 0 });
	});

	it("counts an idea still New past its due date as a breach in progress", () => {
		const r = summarizeReviewCompliance([
			{ status: "new", slaDueDate: PAST_DUE, closedAt: null, firstReviewedAt: null },
			{
				status: "under_review",
				slaDueDate: PAST_DUE,
				closedAt: null,
				firstReviewedAt: new Date("2020-01-10T00:00:00Z"),
			},
		]);
		expect(r).toEqual({ onTime: 1, breached: 1, percent: 50 });
	});

	it("excludes ideas still New with time remaining", () => {
		const r = summarizeReviewCompliance([
			{ status: "new", slaDueDate: FUTURE_DUE, closedAt: null, firstReviewedAt: null },
		]);
		expect(r).toEqual({ onTime: 0, breached: 0, percent: null });
	});

	it("uses the close date for direct closes that skipped Under Review", () => {
		const r = summarizeReviewCompliance([
			{
				status: "declined",
				slaDueDate: PAST_DUE,
				closedAt: new Date("2020-01-12T00:00:00Z"),
				firstReviewedAt: null,
			},
			{
				status: "declined",
				slaDueDate: PAST_DUE,
				closedAt: new Date("2020-03-01T00:00:00Z"),
				firstReviewedAt: null,
			},
		]);
		expect(r).toEqual({ onTime: 1, breached: 1, percent: 50 });
	});
});
