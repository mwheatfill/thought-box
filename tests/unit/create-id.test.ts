import { describe, expect, it } from "vitest";
import { createId } from "#/server/db/utils";

describe("createId", () => {
	it("generates a non-empty string", () => {
		const id = createId();
		expect(id).toBeTruthy();
		expect(typeof id).toBe("string");
	});

	it("generates unique IDs", () => {
		const ids = new Set(Array.from({ length: 100 }, () => createId()));
		expect(ids.size).toBe(100);
	});

	it("starts with a timestamp prefix", () => {
		const before = Date.now().toString(36);
		const id = createId();
		// The ID should start with a base36 timestamp close to the current time
		expect(id.length).toBeGreaterThan(10);
		// First chars should be roughly the same timestamp prefix
		expect(id.slice(0, before.length - 1)).toBe(before.slice(0, before.length - 1));
	});
});
