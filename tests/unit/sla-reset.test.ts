import { describe, expect, it } from "vitest";
import { slaResetsOnAction } from "#/server/lib/sla";

/**
 * The SLA reset split (ADR-0001): re-scoping work resets the clock, delegating
 * or reorganising does not. The regression this guards: a Category-owner change
 * must NOT reset SLAs, or a reorg would restart every idea's clock at once.
 */
describe("slaResetsOnAction", () => {
	it("resets on Change Category and Reopen", () => {
		expect(slaResetsOnAction("change_category")).toBe(true);
		expect(slaResetsOnAction("reopen")).toBe(true);
	});

	it("does not reset on Assignment or a Category-owner change", () => {
		expect(slaResetsOnAction("assign_reviewer")).toBe(false);
		expect(slaResetsOnAction("category_owner_change")).toBe(false);
	});
});
