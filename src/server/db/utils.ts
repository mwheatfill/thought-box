/**
 * Generate a CUID-like ID using the Web Crypto API.
 * Uses a timestamp prefix + random bytes for uniqueness and sortability.
 */
export function createId(): string {
	const timestamp = Date.now().toString(36);
	const randomBytes = new Uint8Array(8);
	crypto.getRandomValues(randomBytes);
	const random = Array.from(randomBytes)
		.map((b) => b.toString(36).padStart(2, "0"))
		.join("");
	return `${timestamp}${random}`;
}
