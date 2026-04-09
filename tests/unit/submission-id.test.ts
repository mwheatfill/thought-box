import { describe, expect, it } from "vitest";

describe("submission ID format", () => {
	it("formats single digit as TB-0001", () => {
		const num = 1;
		const id = `TB-${num.toString().padStart(4, "0")}`;
		expect(id).toBe("TB-0001");
	});

	it("formats double digit as TB-0042", () => {
		const num = 42;
		const id = `TB-${num.toString().padStart(4, "0")}`;
		expect(id).toBe("TB-0042");
	});

	it("formats triple digit as TB-0123", () => {
		const num = 123;
		const id = `TB-${num.toString().padStart(4, "0")}`;
		expect(id).toBe("TB-0123");
	});

	it("formats four digit as TB-1234", () => {
		const num = 1234;
		const id = `TB-${num.toString().padStart(4, "0")}`;
		expect(id).toBe("TB-1234");
	});

	it("handles five digits without truncation", () => {
		const num = 10000;
		const id = `TB-${num.toString().padStart(4, "0")}`;
		expect(id).toBe("TB-10000");
	});
});
