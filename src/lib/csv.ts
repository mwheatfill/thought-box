/**
 * CSV-escape a single value: ISO for dates, quote when it contains a comma,
 * quote, or newline, and neutralize spreadsheet formula injection — a
 * user-controlled value like `=cmd()` must not execute when the file is opened
 * in Excel or PowerBI, so a leading =,+,-,@ (or tab/CR) is prefixed with `'`.
 */
export function csvCell(v: unknown): string {
	if (v === null || v === undefined) return "";
	let s = v instanceof Date ? v.toISOString() : String(v);
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string from rows of raw values (each inner array is one line). */
export function toCsv(rows: unknown[][]): string {
	return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}
