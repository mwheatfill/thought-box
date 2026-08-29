/**
 * CSV-escape a single value: ISO for dates, embedded line breaks flattened to a
 * space (Power BI's default CSV parser splits rows at a newline even inside a
 * quoted field), quote when it contains a comma or quote, and neutralize
 * spreadsheet formula injection — a user-controlled value like `=cmd()` must
 * not execute when the file is opened in Excel or PowerBI, so a leading
 * =,+,-,@ (or tab) is prefixed with `'`.
 */
export function csvCell(v: unknown): string {
	if (v === null || v === undefined) return "";
	let s = v instanceof Date ? v.toISOString() : String(v);
	s = s.replace(/\r\n|[\r\n]/g, " ");
	if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
	return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Build a CSV string from rows of raw values (each inner array is one line).
 * UTF-8 BOM so Excel/Power BI decode the encoding correctly, CRLF line endings
 * per RFC 4180. NOTE: the first header cell must never be exactly "ID" —
 * Microsoft's format sniffing misreads such a file as SYLK and refuses it.
 */
export function toCsv(rows: unknown[][]): string {
	return `\uFEFF${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}`;
}
