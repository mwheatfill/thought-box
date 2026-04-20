import { describe, expect, it } from "vitest";
import { IMPACT_AREAS, ROLE_LABELS, STATUS_LABELS } from "#/lib/constants";

describe("STATUS_LABELS", () => {
	it("has all expected statuses", () => {
		expect(STATUS_LABELS).toHaveProperty("new");
		expect(STATUS_LABELS).toHaveProperty("under_review");
		expect(STATUS_LABELS).toHaveProperty("accepted");
		expect(STATUS_LABELS).toHaveProperty("declined");
		expect(STATUS_LABELS).toHaveProperty("redirected");
	});

	it("maps to human-readable labels", () => {
		expect(STATUS_LABELS.new).toBe("New");
		expect(STATUS_LABELS.under_review).toBe("Under Review");
		expect(STATUS_LABELS.accepted).toBe("Accepted");
		expect(STATUS_LABELS.declined).toBe("Declined");
	});
});

describe("ROLE_LABELS", () => {
	it("has all three roles", () => {
		expect(Object.keys(ROLE_LABELS)).toHaveLength(3);
		expect(ROLE_LABELS.submitter).toBe("Submitter");
		expect(ROLE_LABELS.leader).toBe("Leader");
		expect(ROLE_LABELS.admin).toBe("Admin");
	});
});

describe("IMPACT_AREAS", () => {
	it("has all five areas", () => {
		expect(Object.keys(IMPACT_AREAS)).toHaveLength(5);
		expect(IMPACT_AREAS.cost).toBe("Cost");
		expect(IMPACT_AREAS.time).toBe("Time");
		expect(IMPACT_AREAS.safety).toBe("Safety");
		expect(IMPACT_AREAS.customer).toBe("Customer");
		expect(IMPACT_AREAS.culture).toBe("Culture");
	});
});
