import { describe, expect, it } from "vitest";

// Test the inline markdown parsing logic directly
// (extracted from chat-interface.tsx parseInline logic)

function parseInlineToText(text: string): string[] {
	const parts: string[] = [];
	const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	match = regex.exec(text);
	while (match !== null) {
		if (match.index > lastIndex) {
			parts.push(text.slice(lastIndex, match.index));
		}
		if (match[2]) {
			parts.push(`[bold:${match[2]}]`);
		} else if (match[3]) {
			parts.push(`[italic:${match[3]}]`);
		}
		lastIndex = match.index + match[0].length;
		match = regex.exec(text);
	}

	if (lastIndex < text.length) {
		parts.push(text.slice(lastIndex));
	}

	return parts;
}

describe("inline markdown parsing", () => {
	it("parses bold text", () => {
		const result = parseInlineToText("This is **bold** text");
		expect(result).toEqual(["This is ", "[bold:bold]", " text"]);
	});

	it("parses italic text", () => {
		const result = parseInlineToText("This is *italic* text");
		expect(result).toEqual(["This is ", "[italic:italic]", " text"]);
	});

	it("handles multiple bold segments", () => {
		const result = parseInlineToText("**Title:** Some text **here**");
		expect(result).toEqual(["[bold:Title:]", " Some text ", "[bold:here]"]);
	});

	it("returns plain text when no formatting", () => {
		const result = parseInlineToText("No formatting here");
		expect(result).toEqual(["No formatting here"]);
	});

	it("handles empty string", () => {
		const result = parseInlineToText("");
		expect(result).toEqual([]);
	});

	it("handles bold at start of string", () => {
		const result = parseInlineToText("**Bold start**");
		expect(result).toEqual(["[bold:Bold start]"]);
	});
});

describe("line type detection", () => {
	it("detects headings", () => {
		expect(/^#{1,3}\s+/.test("### Heading")).toBe(true);
		expect(/^#{1,3}\s+/.test("## Heading")).toBe(true);
		expect(/^#{1,3}\s+/.test("# Heading")).toBe(true);
		expect(/^#{1,3}\s+/.test("Not a heading")).toBe(false);
	});

	it("detects bullet points", () => {
		expect(/^[-*]\s+/.test("- Item")).toBe(true);
		expect(/^[-*]\s+/.test("* Item")).toBe(true);
		expect(/^[-*]\s+/.test("Not a bullet")).toBe(false);
	});

	it("detects numbered lists", () => {
		expect(/^\d+\.\s+/.test("1. First")).toBe(true);
		expect(/^\d+\.\s+/.test("10. Tenth")).toBe(true);
		expect(/^\d+\.\s+/.test("Not numbered")).toBe(false);
	});
});
