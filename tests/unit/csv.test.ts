import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "#/lib/csv";

describe("csvCell", () => {
	it("flattens embedded line breaks to a space (Power BI row-splitting)", () => {
		expect(csvCell("line one\nline two")).toBe("line one line two");
		expect(csvCell("a\r\nb\rc")).toBe("a b c");
	});

	it("quotes commas and doubles embedded quotes", () => {
		expect(csvCell('add dark mode, "please"')).toBe('"add dark mode, ""please"""');
	});

	it("neutralizes leading formula characters", () => {
		expect(csvCell("=cmd()")).toBe("'=cmd()");
		expect(csvCell("-1 + 2")).toBe("'-1 + 2");
	});
});

describe("toCsv", () => {
	it("starts with a UTF-8 BOM and joins rows with CRLF", () => {
		const csv = toCsv([
			["Submission ID", "Title"],
			["TB-0001", "Dark mode"],
		]);
		expect(csv.startsWith("\uFEFF")).toBe(true);
		expect(csv).toBe("\uFEFFSubmission ID,Title\r\nTB-0001,Dark mode");
	});

	it("never emits a multiline record, even for multiline input", () => {
		const csv = toCsv([["a\nb", "c"]]);
		expect(csv.split("\r\n")).toHaveLength(1);
	});
});
