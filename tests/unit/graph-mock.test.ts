import { describe, expect, it } from "vitest";
import { searchDirectory } from "#/server/lib/graph";

describe("searchDirectory (dev mock)", () => {
	it("returns empty for short queries", async () => {
		const result = await searchDirectory("a");
		expect(result).toEqual([]);
	});

	it("returns empty for empty query", async () => {
		const result = await searchDirectory("");
		expect(result).toEqual([]);
	});

	it("finds users by name", async () => {
		const result = await searchDirectory("Sarah");
		expect(result.length).toBeGreaterThan(0);
		expect(result[0].displayName).toContain("Sarah");
	});

	it("finds users by email", async () => {
		const result = await searchDirectory("marcus.williams");
		expect(result.length).toBeGreaterThan(0);
		expect(result[0].email).toContain("marcus.williams");
	});

	it("finds users by department", async () => {
		const result = await searchDirectory("Digital Banking");
		expect(result.length).toBeGreaterThan(0);
	});

	it("returns no results for unknown query", async () => {
		const result = await searchDirectory("zzzznonexistent");
		expect(result).toEqual([]);
	});

	it("returns DirectoryUser shape", async () => {
		const result = await searchDirectory("Sarah");
		expect(result[0]).toHaveProperty("entraId");
		expect(result[0]).toHaveProperty("displayName");
		expect(result[0]).toHaveProperty("email");
		expect(result[0]).toHaveProperty("jobTitle");
		expect(result[0]).toHaveProperty("department");
		expect(result[0]).toHaveProperty("officeLocation");
	});
});
